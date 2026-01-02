/**
 * Scenario runner - executes test scenarios step by step
 */

import { readFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import sharp from 'sharp';

import type { IIDBClient } from './idb-client.js';
import type { ISimctlClient } from './simctl-client.js';
import type { IElementFinder } from './element-finder.js';
import type { IImageDiffer } from './image-differ.js';
import type { ILogger } from '../utils/logger.js';
import type {
  Scenario,
  ScenarioStep,
  TestCase,
  TestCaseResult,
  StepResult,
  CheckpointResult,
  WaypointComparisonResult,
} from '../interfaces/scenario.interface.js';

// Scroll safety constants to prevent modal dismissal
const SCROLL_SAFE_MARGIN = 100; // Margin from screen edges (px)
const SCROLL_DISTANCE_DETECT = 100; // Short distance for scroll detection
const SCROLL_DISTANCE_CAPTURE = 200; // Distance for full page capture scrolling
const DEFAULT_SCREEN_HEIGHT = 800; // Default screen height for calculations
const SCROLL_SETTLE_WAIT_MS = 2000; // Wait time after drag scroll before taking screenshot
const DRAG_DURATION = 1.0; // Duration for drag scroll (longer = no inertia)
const EDGE_TAP_X = 5; // X position for edge tap to stop inertial scrolling (left edge, no buttons)

export interface ScenarioRunnerDeps {
  idbClient: IIDBClient;
  simctlClient: ISimctlClient;
  elementFinder: IElementFinder;
  imageDiffer: IImageDiffer;
  logger: ILogger;
}

export interface RunOptions {
  deviceUdid?: string;
  updateBaselines?: boolean;
  resultsDir: string;
  testCasePath: string;
}

export interface IScenarioRunner {
  loadScenario(scenarioPath: string): Promise<Scenario>;
  loadTestCase(testCasePath: string): Promise<TestCase>;
  listTestCases(snapdriveDir: string): Promise<TestCase[]>;
  runTestCase(testCase: TestCase, options: RunOptions): Promise<TestCaseResult>;
}

export class ScenarioRunner implements IScenarioRunner {
  private deps: ScenarioRunnerDeps;

  constructor(deps: ScenarioRunnerDeps) {
    this.deps = deps;
  }

  /**
   * Load and parse a scenario YAML file
   */
  async loadScenario(scenarioPath: string): Promise<Scenario> {
    if (!existsSync(scenarioPath)) {
      throw new Error(`Scenario file not found: ${scenarioPath}`);
    }

    const content = await readFile(scenarioPath, 'utf-8');
    const parsed = parseYaml(content) as Scenario;

    if (!parsed.name || !Array.isArray(parsed.steps)) {
      throw new Error(`Invalid scenario format: ${scenarioPath}`);
    }

    return parsed;
  }

  /**
   * Load a test case from a directory
   */
  async loadTestCase(testCasePath: string): Promise<TestCase> {
    const scenarioPath = join(testCasePath, 'scenario.yaml');
    const scenario = await this.loadScenario(scenarioPath);

    const id = testCasePath.split('/').pop() ?? 'unknown';

    return {
      id,
      path: testCasePath,
      scenario,
      baselinesDir: join(testCasePath, 'baselines'),
    };
  }

  /**
   * List all test cases in a .snapdrive directory
   */
  async listTestCases(snapdriveDir: string): Promise<TestCase[]> {
    const testCasesDir = join(snapdriveDir, 'test-cases');

    if (!existsSync(testCasesDir)) {
      return [];
    }

    const entries = await readdir(testCasesDir, { withFileTypes: true });
    const testCases: TestCase[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const testCasePath = join(testCasesDir, entry.name);
        const scenarioPath = join(testCasePath, 'scenario.yaml');

        if (existsSync(scenarioPath)) {
          try {
            const testCase = await this.loadTestCase(testCasePath);
            testCases.push(testCase);
          } catch (error) {
            this.deps.logger.warn(`Failed to load test case: ${testCasePath}`, {
              error: String(error),
            });
          }
        }
      }
    }

    return testCases;
  }

  /**
   * Run a single test case
   */
  async runTestCase(testCase: TestCase, options: RunOptions): Promise<TestCaseResult> {
    const startTime = new Date();
    const steps: StepResult[] = [];
    const checkpoints: CheckpointResult[] = [];
    let success = true;

    // Ensure results directories exist
    const screenshotsDir = join(options.resultsDir, 'screenshots', testCase.id);
    const diffsDir = join(options.resultsDir, 'diffs', testCase.id);
    await mkdir(screenshotsDir, { recursive: true });
    await mkdir(diffsDir, { recursive: true });

    // Ensure baselines directory exists
    await mkdir(testCase.baselinesDir, { recursive: true });

    const deviceUdid = options.deviceUdid ?? testCase.scenario.deviceUdid;

    this.deps.logger.info(`Running test case: ${testCase.scenario.name}`);

    for (let i = 0; i < testCase.scenario.steps.length; i++) {
      const step = testCase.scenario.steps[i]!;
      const stepStartTime = Date.now();

      try {
        const checkpoint = await this.executeStep(step, {
          deviceUdid,
          baselinesDir: testCase.baselinesDir,
          screenshotsDir,
          diffsDir,
          updateBaselines: options.updateBaselines ?? false,
        });

        const stepResult: StepResult = {
          stepIndex: i,
          action: step.action,
          success: true,
          duration: Date.now() - stepStartTime,
        };

        if (checkpoint) {
          stepResult.checkpoint = checkpoint;
          checkpoints.push(checkpoint);

          if (!checkpoint.match && !options.updateBaselines) {
            stepResult.success = false;
            success = false;
          }
        }

        steps.push(stepResult);
        this.deps.logger.debug(`Step ${i + 1}/${testCase.scenario.steps.length}: ${step.action} - OK`);
      } catch (error) {
        steps.push({
          stepIndex: i,
          action: step.action,
          success: false,
          error: String(error),
          duration: Date.now() - stepStartTime,
        });
        success = false;
        this.deps.logger.error(`Step ${i + 1} failed: ${step.action}`, { error: String(error) });
        // Continue with remaining steps or break on error
        break;
      }
    }

    const endTime = new Date();

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.scenario.name,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime(),
      success,
      steps,
      checkpoints,
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: ScenarioStep,
    context: {
      deviceUdid?: string;
      baselinesDir: string;
      screenshotsDir: string;
      diffsDir: string;
      updateBaselines: boolean;
    }
  ): Promise<CheckpointResult | undefined> {
    const { idbClient, simctlClient, elementFinder, imageDiffer } = this.deps;

    switch (step.action) {
      case 'launch_app': {
        if (!step.bundleId) throw new Error('launch_app requires bundleId');
        await simctlClient.launchApp(step.bundleId, { terminateExisting: true }, context.deviceUdid);
        break;
      }

      case 'terminate_app': {
        if (!step.bundleId) throw new Error('terminate_app requires bundleId');
        await simctlClient.terminateApp(step.bundleId, context.deviceUdid);
        break;
      }

      case 'tap': {
        if (step.x === undefined || step.y === undefined) {
          throw new Error('tap requires x/y coordinates');
        }
        await idbClient.tap(step.x, step.y, { duration: step.duration, deviceUdid: context.deviceUdid });
        break;
      }

      case 'swipe': {
        let sX: number, sY: number, eX: number, eY: number;

        if (step.direction) {
          const centerX = 200;
          const centerY = 400;
          const distance = step.distance ?? 300;

          switch (step.direction) {
            case 'up':
              sX = eX = centerX;
              sY = centerY + distance / 2;
              eY = centerY - distance / 2;
              break;
            case 'down':
              sX = eX = centerX;
              sY = centerY - distance / 2;
              eY = centerY + distance / 2;
              break;
            case 'left':
              sY = eY = centerY;
              sX = centerX + distance / 2;
              eX = centerX - distance / 2;
              break;
            case 'right':
              sY = eY = centerY;
              sX = centerX - distance / 2;
              eX = centerX + distance / 2;
              break;
          }
        } else if (
          step.startX !== undefined &&
          step.startY !== undefined &&
          step.endX !== undefined &&
          step.endY !== undefined
        ) {
          sX = step.startX;
          sY = step.startY;
          eX = step.endX;
          eY = step.endY;
        } else {
          throw new Error('swipe requires direction or start/end coordinates');
        }

        await idbClient.swipe(sX, sY, eX, eY, { deviceUdid: context.deviceUdid });
        break;
      }

      case 'type_text': {
        if (!step.text) throw new Error('type_text requires text');
        await idbClient.typeText(step.text, context.deviceUdid);
        break;
      }

      case 'wait': {
        const seconds = step.seconds ?? 1;
        await this.wait(seconds * 1000);
        break;
      }

      case 'scroll_to_top': {
        // Scroll up until no change is detected (reached top)
        const scrollDistance = step.scrollAmount ?? SCROLL_DISTANCE_CAPTURE;
        const maxScrolls = step.maxScrolls ?? 20;

        // Get scroll region
        let centerX = step.startX;
        let centerY = step.startY;

        if (centerX === undefined || centerY === undefined) {
          const uiTree = await idbClient.describeAll(context.deviceUdid);
          const scrollRegion = elementFinder.findScrollRegion(uiTree.elements);
          centerX = scrollRegion?.centerX ?? 200;
          centerY = scrollRegion?.centerY ?? 400;
        }

        // Safe Y range
        const minSafeY = SCROLL_SAFE_MARGIN + scrollDistance / 2;
        const maxSafeY = DEFAULT_SCREEN_HEIGHT - SCROLL_SAFE_MARGIN - scrollDistance / 2;
        const safeCenterY = Math.max(minSafeY, Math.min(maxSafeY, centerY));

        // Take initial screenshot
        const tempPath = join(context.screenshotsDir, '_scroll_to_top_temp.png');
        await simctlClient.screenshot(tempPath, context.deviceUdid);
        let prevData = await imageDiffer.toBase64(tempPath);

        for (let i = 0; i < maxScrolls; i++) {
          // Scroll UP (finger drags from top to bottom)
          await idbClient.swipe(
            centerX,
            safeCenterY - scrollDistance / 2,
            centerX,
            safeCenterY + scrollDistance / 2,
            { deviceUdid: context.deviceUdid, duration: DRAG_DURATION }
          );
          // Tap left edge to stop inertial scrolling
          await idbClient.tap(EDGE_TAP_X, safeCenterY, { deviceUdid: context.deviceUdid });
          await this.wait(SCROLL_SETTLE_WAIT_MS);

          // Check if we've reached the top
          await simctlClient.screenshot(tempPath, context.deviceUdid);
          const currentData = await imageDiffer.toBase64(tempPath);
          if (currentData === prevData) {
            this.deps.logger.debug(`scroll_to_top: reached top after ${i} scroll(s)`);
            break;
          }
          prevData = currentData;
        }
        break;
      }

      case 'scroll_to_bottom': {
        // Scroll down until no change is detected (reached bottom)
        const scrollDistance = step.scrollAmount ?? SCROLL_DISTANCE_CAPTURE;
        const maxScrolls = step.maxScrolls ?? 20;

        // Get scroll region
        let centerX = step.startX;
        let centerY = step.startY;

        if (centerX === undefined || centerY === undefined) {
          const uiTree = await idbClient.describeAll(context.deviceUdid);
          const scrollRegion = elementFinder.findScrollRegion(uiTree.elements);
          centerX = scrollRegion?.centerX ?? 200;
          centerY = scrollRegion?.centerY ?? 400;
        }

        // Safe Y range
        const minSafeY = SCROLL_SAFE_MARGIN + scrollDistance / 2;
        const maxSafeY = DEFAULT_SCREEN_HEIGHT - SCROLL_SAFE_MARGIN - scrollDistance / 2;
        const safeCenterY = Math.max(minSafeY, Math.min(maxSafeY, centerY));

        // Take initial screenshot
        const tempPath = join(context.screenshotsDir, '_scroll_to_bottom_temp.png');
        await simctlClient.screenshot(tempPath, context.deviceUdid);
        let prevData = await imageDiffer.toBase64(tempPath);

        for (let i = 0; i < maxScrolls; i++) {
          // Scroll DOWN (finger drags from bottom to top)
          await idbClient.swipe(
            centerX,
            safeCenterY + scrollDistance / 2,
            centerX,
            safeCenterY - scrollDistance / 2,
            { deviceUdid: context.deviceUdid, duration: DRAG_DURATION }
          );
          // Tap left edge to stop inertial scrolling
          await idbClient.tap(EDGE_TAP_X, safeCenterY, { deviceUdid: context.deviceUdid });
          await this.wait(SCROLL_SETTLE_WAIT_MS);

          // Check if we've reached the bottom
          await simctlClient.screenshot(tempPath, context.deviceUdid);
          const currentData = await imageDiffer.toBase64(tempPath);
          if (currentData === prevData) {
            this.deps.logger.debug(`scroll_to_bottom: reached bottom after ${i} scroll(s)`);
            break;
          }
          prevData = currentData;
        }
        break;
      }

      case 'checkpoint': {
        if (!step.name) throw new Error('checkpoint requires name');

        const actualPath = join(context.screenshotsDir, `${step.name}.png`);
        const baselinePath = join(context.baselinesDir, `${step.name}.png`);
        const diffPath = join(context.diffsDir, `${step.name}_diff.png`);

        // Take screenshot
        await simctlClient.screenshot(actualPath, context.deviceUdid);

        // Update baseline if requested
        if (context.updateBaselines) {
          await imageDiffer.updateBaseline(actualPath, baselinePath);
          return {
            name: step.name,
            match: true,
            differencePercent: 0,
            baselinePath,
            actualPath,
          };
        }

        // Compare with baseline
        if (!existsSync(baselinePath)) {
          return {
            name: step.name,
            match: false,
            differencePercent: 100,
            baselinePath,
            actualPath,
          };
        }

        const compareResult = await imageDiffer.compare(actualPath, baselinePath, {
          tolerance: step.tolerance ?? 0,
          generateDiff: true,
          diffOutputPath: diffPath,
        });

        return {
          name: step.name,
          match: compareResult.match,
          differencePercent: compareResult.differenceRatio * 100,
          baselinePath,
          actualPath,
          diffPath: compareResult.diffImagePath,
        };
      }

      case 'full_page_checkpoint': {
        if (!step.name) throw new Error('full_page_checkpoint requires name');

        const maxScrolls = step.maxScrolls ?? 50;
        const stitchImages = step.stitchImages ?? true;
        const tolerance = step.tolerance ?? 0;

        // Get scroll region - use provided coordinates or detect from UI tree
        let centerX = step.startX;
        let centerY = step.startY;

        if (centerX === undefined || centerY === undefined) {
          const fpUiTree = await idbClient.describeAll(context.deviceUdid);
          const scrollRegion = elementFinder.findScrollRegion(fpUiTree.elements);
          centerX = scrollRegion?.centerX ?? 200;
          centerY = scrollRegion?.centerY ?? 400;
          this.deps.logger.info(`full_page_checkpoint: detected scroll region at (${centerX}, ${centerY})`);
        }

        // Capture screenshots while scrolling
        const segmentPaths: string[] = [];
        const scrollDistance = step.scrollAmount ?? SCROLL_DISTANCE_CAPTURE;

        // Clamp centerY to safe range to avoid triggering modal dismiss gestures
        const minSafeY = SCROLL_SAFE_MARGIN + scrollDistance / 2;
        const maxSafeY = DEFAULT_SCREEN_HEIGHT - SCROLL_SAFE_MARGIN - scrollDistance / 2;
        const safeCenterY = Math.max(minSafeY, Math.min(maxSafeY, centerY));

        this.deps.logger.debug(`full_page_checkpoint: using safeCenterY=${safeCenterY} (original: ${centerY})`);

        // Capture screenshots while scrolling DOWN only (finger drag from bottom to top)
        // Pattern: screenshot first segment, then (scroll down → wait → screenshot) until bottom
        let prevScreenshotData = '';
        let scrollCount = 0;

        // Capture first segment (current position, before any scrolling)
        const firstSegmentPath = join(context.screenshotsDir, `${step.name}_segment_0.png`);
        await simctlClient.screenshot(firstSegmentPath, context.deviceUdid);
        segmentPaths.push(firstSegmentPath);
        prevScreenshotData = await this.deps.imageDiffer.toBase64(firstSegmentPath);
        scrollCount = 1;

        // Get actual image dimensions to calculate scroll distance in pixels
        const firstImageMeta = await sharp(firstSegmentPath).metadata();
        const imageHeight = firstImageMeta.height ?? 0;
        // Retina scale factor (screenshot pixels / logical pixels)
        const scaleFactor = Math.round(imageHeight / DEFAULT_SCREEN_HEIGHT);
        // Scroll distance in pixels (for overlap detection)
        const scrollDistancePixels = scrollDistance * scaleFactor;
        this.deps.logger.info(`full_page_checkpoint: imageHeight=${imageHeight}, scaleFactor=${scaleFactor}, scrollDistancePixels=${scrollDistancePixels}px`);
        let prevSegmentPath = firstSegmentPath;

        // Scroll down → Wait → Screenshot → Correct loop until reaching bottom
        while (scrollCount < maxScrolls) {
          // Scroll DOWN (finger drags from bottom to top to reveal content below)
          await idbClient.swipe(
            centerX,
            safeCenterY + scrollDistance / 2,  // Start: lower position
            centerX,
            safeCenterY - scrollDistance / 2,  // End: upper position
            {
              deviceUdid: context.deviceUdid,
              duration: DRAG_DURATION, // Slow drag = no inertia
            }
          );

          // Tap left edge to stop inertial scrolling
          await idbClient.tap(EDGE_TAP_X, safeCenterY, { deviceUdid: context.deviceUdid });

          // Wait for content to settle
          await this.wait(SCROLL_SETTLE_WAIT_MS);

          // Screenshot
          const segmentPath = join(context.screenshotsDir, `${step.name}_segment_${scrollCount}.png`);
          await simctlClient.screenshot(segmentPath, context.deviceUdid);

          // Check if we've reached the bottom (screenshot is same as previous)
          const currentData = await this.deps.imageDiffer.toBase64(segmentPath);
          if (currentData === prevScreenshotData) {
            // Same as previous - discard duplicate and stop
            await unlink(segmentPath).catch(() => {}); // Delete duplicate file
            this.deps.logger.debug(`full_page_checkpoint: reached bottom at segment ${scrollCount}, discarded duplicate`);
            break;
          }

          // Log overlap detection info (correction disabled due to oscillation issues)
          const overlap = await imageDiffer.findOverlap(prevSegmentPath, segmentPath, scrollDistancePixels);
          this.deps.logger.debug(
            `full_page_checkpoint: segment ${scrollCount} - confidence=${(overlap.confidence * 100).toFixed(1)}%, offset=${overlap.offset}px`
          );

          // Content is different - save this segment
          segmentPaths.push(segmentPath);
          prevScreenshotData = await this.deps.imageDiffer.toBase64(segmentPath);
          prevSegmentPath = segmentPath;
          scrollCount++;
        }

        this.deps.logger.info(`Captured ${segmentPaths.length} scroll segments for ${step.name}`);

        const actualPath = join(context.screenshotsDir, `${step.name}.png`);
        const baselinePath = join(context.baselinesDir, `${step.name}.png`);
        const diffPath = join(context.diffsDir, `${step.name}_diff.png`);

        if (stitchImages && segmentPaths.length > 0) {
          // Stitch all segments into one image
          await imageDiffer.stitchVertically(segmentPaths, actualPath);

          if (context.updateBaselines) {
            await imageDiffer.updateBaseline(actualPath, baselinePath);
            return {
              name: step.name,
              match: true,
              differencePercent: 0,
              baselinePath,
              actualPath,
              isFullPage: true,
              segmentPaths,
            };
          }

          if (!existsSync(baselinePath)) {
            return {
              name: step.name,
              match: false,
              differencePercent: 100,
              baselinePath,
              actualPath,
              isFullPage: true,
              segmentPaths,
            };
          }

          const compareResult = await imageDiffer.compare(actualPath, baselinePath, {
            tolerance,
            generateDiff: true,
            diffOutputPath: diffPath,
          });

          return {
            name: step.name,
            match: compareResult.match,
            differencePercent: compareResult.differenceRatio * 100,
            baselinePath,
            actualPath,
            diffPath: compareResult.diffImagePath,
            isFullPage: true,
            segmentPaths,
          };
        } else {
          // Compare each segment separately
          let totalDiffPercent = 0;
          let allMatch = true;

          for (let i = 0; i < segmentPaths.length; i++) {
            const segmentActual = segmentPaths[i]!;
            const segmentBaseline = join(context.baselinesDir, `${step.name}_segment_${i}.png`);
            const segmentDiff = join(context.diffsDir, `${step.name}_segment_${i}_diff.png`);

            if (context.updateBaselines) {
              await imageDiffer.updateBaseline(segmentActual, segmentBaseline);
            } else if (existsSync(segmentBaseline)) {
              const result = await imageDiffer.compare(segmentActual, segmentBaseline, {
                tolerance,
                generateDiff: true,
                diffOutputPath: segmentDiff,
              });
              if (!result.match) allMatch = false;
              totalDiffPercent += result.differenceRatio * 100;
            } else {
              allMatch = false;
              totalDiffPercent += 100;
            }
          }

          const avgDiffPercent = segmentPaths.length > 0 ? totalDiffPercent / segmentPaths.length : 0;

          return {
            name: step.name,
            match: context.updateBaselines ? true : allMatch,
            differencePercent: avgDiffPercent,
            baselinePath: join(context.baselinesDir, `${step.name}_segment_0.png`),
            actualPath: segmentPaths[0] ?? actualPath,
            isFullPage: true,
            segmentPaths,
          };
        }
      }

      case 'smart_checkpoint': {
        if (!step.name) throw new Error('smart_checkpoint requires name');

        // Get UI tree and find best scroll region
        const uiTree = await idbClient.describeAll(context.deviceUdid);
        const scrollRegion = elementFinder.findScrollRegion(uiTree.elements);
        const centerX = scrollRegion?.centerX ?? 200;
        const centerY = scrollRegion?.centerY ?? 400;

        this.deps.logger.info(
          `smart_checkpoint: ${step.name} - scroll region at (${centerX}, ${centerY})`
        );

        // Detect scrollable content by checking if scroll changes the screen
        this.deps.logger.info(`smart_checkpoint: ${step.name} - checking scroll by screenshot diff`);

        let hasScrollable = false;
        const scrollDistance = SCROLL_DISTANCE_DETECT; // Short distance for detection

        // Clamp centerY to safe range to avoid triggering modal dismiss gestures
        const minSafeY = SCROLL_SAFE_MARGIN + scrollDistance / 2;
        const maxSafeY = DEFAULT_SCREEN_HEIGHT - SCROLL_SAFE_MARGIN - scrollDistance / 2;
        const safeCenterY = Math.max(minSafeY, Math.min(maxSafeY, centerY));

        this.deps.logger.debug(`smart_checkpoint: using safeCenterY=${safeCenterY} (original: ${centerY})`);

        // Take initial screenshot (baseline)
        const tempBeforePath = join(context.screenshotsDir, `${step.name}_scroll_detect_before.png`);
        await simctlClient.screenshot(tempBeforePath, context.deviceUdid);
        const baselineData = await imageDiffer.toBase64(tempBeforePath);

        // Try scrolling DOWN first (drag up to reveal content below)
        await idbClient.swipe(centerX, safeCenterY + scrollDistance / 2, centerX, safeCenterY - scrollDistance / 2, {
          deviceUdid: context.deviceUdid,
          duration: DRAG_DURATION, // Slow drag = no inertia
        });
        // Tap left edge to stop inertial scrolling
        await idbClient.tap(EDGE_TAP_X, safeCenterY, { deviceUdid: context.deviceUdid });
        await this.wait(SCROLL_SETTLE_WAIT_MS);

        const tempAfterDownPath = join(context.screenshotsDir, `${step.name}_scroll_detect_after_down.png`);
        await simctlClient.screenshot(tempAfterDownPath, context.deviceUdid);
        const afterDownData = await imageDiffer.toBase64(tempAfterDownPath);

        if (afterDownData !== baselineData) {
          hasScrollable = true;
          this.deps.logger.info(`smart_checkpoint: ${step.name} - scroll DOWN detected content change`);
        } else {
          // Scrolling down didn't change content - we might be at the bottom
          // Try scrolling UP (swipe down to reveal content above) without repeated attempts
          this.deps.logger.debug(`smart_checkpoint: ${step.name} - scroll DOWN had no effect, trying UP`);

          await idbClient.swipe(centerX, safeCenterY - scrollDistance / 2, centerX, safeCenterY + scrollDistance / 2, {
            deviceUdid: context.deviceUdid,
            duration: DRAG_DURATION, // Slow drag = no inertia
          });
          // Tap left edge to stop inertial scrolling
          await idbClient.tap(EDGE_TAP_X, safeCenterY, { deviceUdid: context.deviceUdid });
          await this.wait(SCROLL_SETTLE_WAIT_MS);

          const tempAfterUpPath = join(context.screenshotsDir, `${step.name}_scroll_detect_after_up.png`);
          await simctlClient.screenshot(tempAfterUpPath, context.deviceUdid);
          const afterUpData = await imageDiffer.toBase64(tempAfterUpPath);

          if (afterUpData !== afterDownData) {
            hasScrollable = true;
            this.deps.logger.info(`smart_checkpoint: ${step.name} - scroll UP detected content change`);
          } else {
            // Neither direction caused a change - no scrollable content
            this.deps.logger.info(`smart_checkpoint: ${step.name} - no scrollable content detected`);
          }
        }

        this.deps.logger.info(
          `smart_checkpoint: ${step.name} - scrollable content ${hasScrollable ? 'detected' : 'not found'}`
        );

        if (hasScrollable) {
          // Scroll back to top before full_page_checkpoint to ensure consistent starting position
          this.deps.logger.debug(`smart_checkpoint: ${step.name} - scrolling to top before capture`);
          const scrollToTopStep = {
            action: 'scroll_to_top' as const,
            startX: centerX,
            startY: centerY,
            maxScrolls: 20,
          };
          await this.executeStep(scrollToTopStep, context);

          // Use full_page_checkpoint logic with detected scroll region
          const scrollStep = {
            ...step,
            action: 'full_page_checkpoint' as const,
            maxScrolls: step.maxScrolls ?? 50,
            stitchImages: step.stitchImages ?? true,
            // Pass scroll region center coordinates
            startX: centerX,
            startY: centerY,
          };
          return this.executeStep(scrollStep, context);
        } else {
          // Use regular checkpoint logic
          const checkpointStep = {
            ...step,
            action: 'checkpoint' as const,
          };
          return this.executeStep(checkpointStep, context);
        }
      }

      case 'open_url': {
        if (!step.url) throw new Error('open_url requires url');
        await simctlClient.openUrl(step.url, context.deviceUdid);
        break;
      }

      case 'set_location': {
        if (step.latitude === undefined || step.longitude === undefined) {
          throw new Error('set_location requires latitude and longitude');
        }
        await simctlClient.setLocation(step.latitude, step.longitude, context.deviceUdid);
        break;
      }

      case 'clear_location': {
        await simctlClient.clearLocation(context.deviceUdid);
        break;
      }

      case 'simulate_route': {
        if (!step.waypoints || step.waypoints.length === 0) {
          throw new Error('simulate_route requires waypoints array');
        }

        const captureAtWaypoints = step.captureAtWaypoints ?? false;
        const intervalMs = step.intervalMs ?? 3000; // 3 seconds default for map rendering
        const captureDelayMs = step.captureDelayMs ?? 2000; // 2 seconds default for map tile loading
        const checkpointName = step.waypointCheckpointName ?? step.name ?? 'route';

        if (captureAtWaypoints) {
          // Manual route simulation with screenshot capture at each waypoint
          const waypointResults: WaypointComparisonResult[] = [];
          const tolerance = step.tolerance ?? 0;

          for (let i = 0; i < step.waypoints.length; i++) {
            const wp = step.waypoints[i]!;
            await simctlClient.setLocation(wp.latitude, wp.longitude, context.deviceUdid);

            // Wait for map to render before capturing
            await this.wait(captureDelayMs);

            // Capture screenshot at this waypoint
            const actualPath = join(context.screenshotsDir, `${checkpointName}_waypoint_${i}.png`);
            const baselinePath = join(context.baselinesDir, `${checkpointName}_waypoint_${i}.png`);
            const diffPath = join(context.diffsDir, `${checkpointName}_waypoint_${i}_diff.png`);

            await simctlClient.screenshot(actualPath, context.deviceUdid);

            this.deps.logger.debug(`Captured waypoint ${i + 1}/${step.waypoints.length} at (${wp.latitude}, ${wp.longitude})`);

            // Update baseline or compare
            if (context.updateBaselines) {
              await imageDiffer.updateBaseline(actualPath, baselinePath);
              waypointResults.push({
                index: i,
                actualPath,
                baselinePath,
                match: true,
                differencePercent: 0,
              });
            } else if (!existsSync(baselinePath)) {
              waypointResults.push({
                index: i,
                actualPath,
                baselinePath,
                match: false,
                differencePercent: 100,
              });
            } else {
              const compareResult = await imageDiffer.compare(actualPath, baselinePath, {
                tolerance,
                generateDiff: true,
                diffOutputPath: diffPath,
              });
              waypointResults.push({
                index: i,
                actualPath,
                baselinePath,
                diffPath: compareResult.diffImagePath,
                match: compareResult.match,
                differencePercent: compareResult.differenceRatio * 100,
              });
            }

            // Wait between waypoints (except after the last one)
            if (i < step.waypoints.length - 1) {
              await this.wait(intervalMs);
            }
          }

          this.deps.logger.info(`Route simulation completed: ${waypointResults.length} waypoint screenshots captured`);

          // Calculate overall match status
          const allMatch = waypointResults.every(r => r.match);
          const avgDiffPercent = waypointResults.length > 0
            ? waypointResults.reduce((sum, r) => sum + r.differencePercent, 0) / waypointResults.length
            : 0;

          // Use last waypoint as the main checkpoint result
          const lastResult = waypointResults[waypointResults.length - 1];

          return {
            name: checkpointName,
            match: allMatch,
            differencePercent: avgDiffPercent,
            baselinePath: lastResult?.baselinePath ?? '',
            actualPath: lastResult?.actualPath ?? '',
            diffPath: lastResult?.diffPath,
            isRouteSimulation: true,
            waypointResults,
          };
        } else {
          // Simple route simulation without screenshot capture
          await simctlClient.simulateRoute(
            step.waypoints,
            { intervalMs: step.intervalMs },
            context.deviceUdid
          );
        }
        break;
      }

      default:
        throw new Error(`Unknown action: ${step.action}`);
    }

    return undefined;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
