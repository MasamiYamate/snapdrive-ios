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

export interface OverlapResult {
  offset: number;        // Pixel offset from expected position (positive = scrolled too much)
  confidence: number;    // Match confidence (0-1)
  matchPosition: number; // Y position in current image where match was found
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
  stitchVertically(imagePaths: string[], outputPath: string): Promise<string>;
  findOverlap(
    prevImagePath: string,
    currentImagePath: string,
    expectedOverlap: number,
    options?: { stripHeight?: number; searchRange?: number }
  ): Promise<OverlapResult>;
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

  /**
   * Stitch multiple images vertically into a single image
   * Used for full-page screenshots of scrollable content
   */
  async stitchVertically(imagePaths: string[], outputPath: string): Promise<string> {
    if (imagePaths.length === 0) {
      throw new Error('No images to stitch');
    }

    if (imagePaths.length === 1) {
      // Single image, just copy it
      await copyFile(imagePaths[0]!, outputPath);
      return outputPath;
    }

    // Get metadata for all images
    const metadataPromises = imagePaths.map(p => sharp(p).metadata());
    const metadataList = await Promise.all(metadataPromises);

    // Use the width of the first image (assume all have same width)
    const width = metadataList[0]?.width ?? 0;
    const totalHeight = metadataList.reduce((sum, m) => sum + (m.height ?? 0), 0);

    this.logger.debug(`Stitching ${imagePaths.length} images: ${width}x${totalHeight}`);

    // Create composite operations
    let currentY = 0;
    const compositeOps: sharp.OverlayOptions[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      compositeOps.push({
        input: imagePaths[i]!,
        top: currentY,
        left: 0,
      });
      currentY += metadataList[i]?.height ?? 0;
    }

    // Create stitched image
    await mkdir(dirname(outputPath), { recursive: true });
    await sharp({
      create: {
        width,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(compositeOps)
      .png()
      .toFile(outputPath);

    this.logger.info(`Stitched ${imagePaths.length} images into: ${outputPath}`);
    return outputPath;
  }

  /**
   * Find overlap between previous and current screenshot to detect scroll position drift.
   * Takes a strip from near bottom of prev image and finds where it appears in current image.
   *
   * Algorithm:
   * 1. Extract a strip from bottom area of previous image (at STRIP_FROM_BOTTOM pixels from bottom)
   * 2. After scrolling by scrollDistancePixels, this strip should appear at y = STRIP_FROM_BOTTOM - scrollDistancePixels
   * 3. Search for the strip in current image around that expected position
   * 4. Calculate offset = expectedPosition - actualPosition (positive = scrolled too little)
   *
   * @param prevImagePath - Path to previous screenshot
   * @param currentImagePath - Path to current screenshot
   * @param scrollDistancePixels - Expected scroll distance in pixels
   * @param options - Search options
   * @returns Overlap result with offset correction needed
   */
  async findOverlap(
    prevImagePath: string,
    currentImagePath: string,
    scrollDistancePixels: number,
    options: { stripHeight?: number; searchRange?: number } = {}
  ): Promise<OverlapResult> {
    const { stripHeight = 50, searchRange = 150 } = options;
    const STRIP_FROM_BOTTOM = 200; // How far from bottom to take the strip

    try {
      // Load both images
      const [prevBuffer, currentBuffer] = await Promise.all([
        sharp(prevImagePath).raw().toBuffer({ resolveWithObject: true }),
        sharp(currentImagePath).raw().toBuffer({ resolveWithObject: true }),
      ]);

      const { width, height, channels } = prevBuffer.info;
      const currentHeight = currentBuffer.info.height;

      // Take a strip from near the bottom of previous image
      const stripStartY = height - STRIP_FROM_BOTTOM - stripHeight / 2;
      const stripEndY = stripStartY + stripHeight;

      if (stripStartY < 0 || stripEndY > height) {
        this.logger.warn('Strip position out of bounds, skipping overlap detection');
        return { offset: 0, confidence: 0, matchPosition: 0 };
      }

      // After scrolling, this strip should appear at this Y position in current image
      const expectedPositionInCurrent = stripStartY - scrollDistancePixels;

      if (expectedPositionInCurrent < 0 || expectedPositionInCurrent > currentHeight - stripHeight) {
        this.logger.warn(`Expected strip position (${expectedPositionInCurrent}) out of bounds, skipping`);
        return { offset: 0, confidence: 0, matchPosition: 0 };
      }

      // Search for this strip in current image around expected position
      let bestMatch = { similarity: 0, position: 0 };
      const searchStart = Math.max(0, expectedPositionInCurrent - searchRange);
      const searchEnd = Math.min(currentHeight - stripHeight, expectedPositionInCurrent + searchRange);

      for (let searchY = searchStart; searchY <= searchEnd; searchY++) {
        let matchingPixels = 0;
        let totalPixels = 0;

        // Compare strip at this position
        for (let y = 0; y < stripHeight; y++) {
          const prevY = stripStartY + y;
          const currY = searchY + y;

          for (let x = 0; x < width; x++) {
            const prevIdx = (prevY * width + x) * channels;
            const currIdx = (currY * width + x) * channels;

            // Compare RGB values (skip alpha)
            let isMatch = true;
            for (let c = 0; c < Math.min(channels, 3); c++) {
              const diff = Math.abs(
                (prevBuffer.data[prevIdx + c] ?? 0) - (currentBuffer.data[currIdx + c] ?? 0)
              );
              if (diff > 5) { // Allow small tolerance for anti-aliasing
                isMatch = false;
                break;
              }
            }

            if (isMatch) matchingPixels++;
            totalPixels++;
          }
        }

        const similarity = matchingPixels / totalPixels;
        if (similarity > bestMatch.similarity) {
          bestMatch = { similarity, position: searchY };
        }

        // Early exit if we found a very good match
        if (similarity > 0.98) break;
      }

      // Calculate offset: expected position - actual position
      // Positive offset = strip is higher than expected = scrolled too little, need to scroll MORE
      // Negative offset = strip is lower than expected = scrolled too much, need to scroll LESS
      const offset = expectedPositionInCurrent - bestMatch.position;

      this.logger.debug(
        `Overlap: strip@${stripStartY} expected@${expectedPositionInCurrent}, found@${bestMatch.position}, ` +
        `offset=${offset}, confidence=${(bestMatch.similarity * 100).toFixed(1)}%`
      );

      return {
        offset: Math.round(offset),
        confidence: bestMatch.similarity,
        matchPosition: bestMatch.position,
      };
    } catch (error) {
      this.logger.error('Failed to find overlap', { error: String(error) });
      return { offset: 0, confidence: 0, matchPosition: 0 };
    }
  }
}

export const imageDiffer = new ImageDiffer();
