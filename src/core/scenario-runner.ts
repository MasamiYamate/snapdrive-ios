/**
 * Scenario runner - executes test scenarios step by step
 */

import { readFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

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
} from '../interfaces/scenario.interface.js';

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
        let tapX: number;
        let tapY: number;

        if (step.label || step.labelContains) {
          const uiTree = await idbClient.describeAll(context.deviceUdid);
          const result = elementFinder.findBest(uiTree.elements, {
            label: step.label,
            labelContains: step.labelContains,
          });

          if (!result.found || !result.tapCoordinates) {
            throw new Error(`Element not found: ${step.label ?? step.labelContains}`);
          }

          tapX = result.tapCoordinates.x;
          tapY = result.tapCoordinates.y;
        } else if (step.x !== undefined && step.y !== undefined) {
          tapX = step.x;
          tapY = step.y;
        } else {
          throw new Error('tap requires label, labelContains, or x/y coordinates');
        }

        await idbClient.tap(tapX, tapY, { duration: step.duration, deviceUdid: context.deviceUdid });
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

        // If target is specified, tap on it first
        if (step.target) {
          const uiTree = await idbClient.describeAll(context.deviceUdid);
          const result = elementFinder.findBest(uiTree.elements, {
            label: step.target,
            labelContains: step.target,
          });

          if (result.found && result.tapCoordinates) {
            await idbClient.tap(result.tapCoordinates.x, result.tapCoordinates.y, {
              deviceUdid: context.deviceUdid,
            });
            await this.wait(300); // Wait for focus
          }
        }

        await idbClient.typeText(step.text, context.deviceUdid);
        break;
      }

      case 'wait': {
        const seconds = step.seconds ?? 1;
        await this.wait(seconds * 1000);
        break;
      }

      case 'wait_for_element': {
        const timeoutMs = step.timeoutMs ?? 8000;
        const pollInterval = 500;
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
          const uiTree = await idbClient.describeAll(context.deviceUdid);
          const result = elementFinder.findBest(uiTree.elements, {
            label: step.label,
            labelContains: step.labelContains,
            type: step.type,
          });

          if (result.found) {
            return undefined;
          }

          await this.wait(pollInterval);
        }

        throw new Error(
          `Element not found within ${timeoutMs}ms: ${step.label ?? step.labelContains ?? step.type}`
        );
      }

      case 'scroll_to_element': {
        // Scroll until element is visible (max 10 swipes)
        const maxSwipes = step.distance ?? 10; // reuse distance as max swipes
        const direction = step.direction ?? 'up';
        const swipeDistance = 300;

        for (let i = 0; i < maxSwipes; i++) {
          const uiTree = await idbClient.describeAll(context.deviceUdid);
          const result = elementFinder.findBest(uiTree.elements, {
            label: step.label,
            labelContains: step.labelContains,
            type: step.type,
          });

          if (result.found) {
            // Element found, optionally scroll it to center
            return undefined;
          }

          // Swipe to scroll
          const centerX = 200;
          const centerY = 400;
          let sX: number, sY: number, eX: number, eY: number;

          switch (direction) {
            case 'up':
              sX = eX = centerX;
              sY = centerY + swipeDistance / 2;
              eY = centerY - swipeDistance / 2;
              break;
            case 'down':
              sX = eX = centerX;
              sY = centerY - swipeDistance / 2;
              eY = centerY + swipeDistance / 2;
              break;
            default:
              sX = eX = centerX;
              sY = centerY + swipeDistance / 2;
              eY = centerY - swipeDistance / 2;
          }

          await idbClient.swipe(sX, sY, eX, eY, { deviceUdid: context.deviceUdid });
          await this.wait(300); // Wait for scroll animation
        }

        throw new Error(
          `Element not found after ${maxSwipes} swipes: ${step.label ?? step.labelContains ?? step.type}`
        );
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

      case 'open_url': {
        if (!step.url) throw new Error('open_url requires url');
        await simctlClient.openUrl(step.url, context.deviceUdid);
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
