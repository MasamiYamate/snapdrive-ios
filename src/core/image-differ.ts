/**
 * Image differ - screenshot comparison using sharp
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { type ILogger, Logger } from '../utils/logger.js';

export interface DiffResult {
  match: boolean;
  differenceRatio: number;
  differentPixels: number;
  totalPixels: number;
  diffImagePath?: string;
}

export interface CompareOptions {
  tolerance: number;
  generateDiff: boolean;
  diffOutputPath?: string;
}

export interface IImageDiffer {
  compare(
    actualPath: string,
    baselinePath: string,
    options?: Partial<CompareOptions>
  ): Promise<DiffResult>;
  updateBaseline(screenshotPath: string, baselinePath: string): Promise<void>;
  toBase64(imagePath: string): Promise<string>;
  fromBase64(base64: string, outputPath: string): Promise<void>;
  resize(imagePath: string, scale: number, outputPath?: string): Promise<string>;
}

export class ImageDiffer implements IImageDiffer {
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger ?? new Logger('image-differ');
  }

  /**
   * Compare two images and return diff result
   */
  async compare(
    actualPath: string,
    baselinePath: string,
    options: Partial<CompareOptions> = {}
  ): Promise<DiffResult> {
    const { tolerance = 0, generateDiff = true, diffOutputPath } = options;

    // Check if baseline exists
    if (!existsSync(baselinePath)) {
      this.logger.warn(`Baseline not found: ${baselinePath}`);
      return {
        match: false,
        differenceRatio: 1,
        differentPixels: 0,
        totalPixels: 0,
      };
    }

    try {
      // Load images
      const [actualBuffer, baselineBuffer] = await Promise.all([
        sharp(actualPath).raw().toBuffer({ resolveWithObject: true }),
        sharp(baselinePath).raw().toBuffer({ resolveWithObject: true }),
      ]);

      // Check dimensions
      if (
        actualBuffer.info.width !== baselineBuffer.info.width ||
        actualBuffer.info.height !== baselineBuffer.info.height
      ) {
        this.logger.warn('Image dimensions do not match', {
          actual: `${actualBuffer.info.width}x${actualBuffer.info.height}`,
          baseline: `${baselineBuffer.info.width}x${baselineBuffer.info.height}`,
        });
        return {
          match: false,
          differenceRatio: 1,
          differentPixels: 0,
          totalPixels: actualBuffer.info.width * actualBuffer.info.height,
        };
      }

      const { width, height, channels } = actualBuffer.info;
      const totalPixels = width * height;
      let differentPixels = 0;

      // Create diff image buffer if needed
      const diffBuffer = generateDiff
        ? Buffer.alloc(actualBuffer.data.length)
        : null;

      // Compare pixels
      for (let i = 0; i < actualBuffer.data.length; i += channels) {
        // Check if any channel differs
        let isDifferent = false;
        for (let c = 0; c < Math.min(channels, 3); c++) { // Compare RGB only
          const actualVal = actualBuffer.data[i + c] ?? 0;
          const baselineVal = baselineBuffer.data[i + c] ?? 0;
          if (actualVal !== baselineVal) {
            isDifferent = true;
            break;
          }
        }

        if (isDifferent) {
          differentPixels++;
        }

        // Write to diff buffer
        if (diffBuffer) {
          if (isDifferent) {
            // Bright magenta for different pixels (highly visible)
            diffBuffer[i] = 255;     // R
            diffBuffer[i + 1] = 0;   // G
            diffBuffer[i + 2] = 255; // B (magenta instead of red for visibility)
            if (channels === 4) {
              diffBuffer[i + 3] = 255; // A
            }
          } else {
            // Grayscale dimmed version of original
            const gray = Math.floor(
              ((actualBuffer.data[i] ?? 0) * 0.3 +
               (actualBuffer.data[i + 1] ?? 0) * 0.59 +
               (actualBuffer.data[i + 2] ?? 0) * 0.11) * 0.4
            );
            diffBuffer[i] = gray;
            diffBuffer[i + 1] = gray;
            diffBuffer[i + 2] = gray;
            if (channels === 4) {
              diffBuffer[i + 3] = actualBuffer.data[i + 3] ?? 255;
            }
          }
        }
      }

      const differenceRatio = differentPixels / totalPixels;
      const match = differenceRatio <= tolerance;

      // Generate diff image if requested and there are differences
      let outputDiffPath: string | undefined;
      if (diffBuffer && differentPixels > 0 && diffOutputPath) {
        await mkdir(dirname(diffOutputPath), { recursive: true });
        await sharp(diffBuffer, {
          raw: { width, height, channels },
        })
          .png()
          .toFile(diffOutputPath);
        outputDiffPath = diffOutputPath;
        this.logger.debug(`Diff image saved to: ${diffOutputPath}`);
      }

      this.logger.info(
        `Comparison result: ${match ? 'MATCH' : 'DIFFERENT'} (${(differenceRatio * 100).toFixed(2)}% different)`
      );

      return {
        match,
        differenceRatio,
        differentPixels,
        totalPixels,
        diffImagePath: outputDiffPath,
      };
    } catch (error) {
      this.logger.error('Failed to compare images', { error: String(error) });
      throw error;
    }
  }

  /**
   * Update baseline by copying screenshot
   */
  async updateBaseline(screenshotPath: string, baselinePath: string): Promise<void> {
    await mkdir(dirname(baselinePath), { recursive: true });
    await copyFile(screenshotPath, baselinePath);
    this.logger.info(`Baseline updated: ${baselinePath}`);
  }

  /**
   * Convert image file to base64 string
   */
  async toBase64(imagePath: string): Promise<string> {
    const buffer = await readFile(imagePath);
    return buffer.toString('base64');
  }

  /**
   * Save base64 string as image file
   */
  async fromBase64(base64: string, outputPath: string): Promise<void> {
    const buffer = Buffer.from(base64, 'base64');
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, buffer);
    this.logger.debug(`Image saved from base64: ${outputPath}`);
  }

  /**
   * Resize image by scale factor
   */
  async resize(
    imagePath: string,
    scale: number,
    outputPath?: string
  ): Promise<string> {
    const metadata = await sharp(imagePath).metadata();
    const newWidth = Math.round((metadata.width ?? 0) * scale);
    const newHeight = Math.round((metadata.height ?? 0) * scale);

    const output = outputPath ?? imagePath.replace(/(\.[^.]+)$/, `_${scale}x$1`);

    await sharp(imagePath)
      .resize(newWidth, newHeight)
      .toFile(output);

    this.logger.debug(`Image resized to ${newWidth}x${newHeight}: ${output}`);
    return output;
  }
}

export const imageDiffer = new ImageDiffer();
