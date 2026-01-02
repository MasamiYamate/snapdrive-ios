/**
 * SnapDrive MCP Server
 * Provides iOS Simulator automation tools via Model Context Protocol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { IDBClient, type IIDBClient } from './core/idb-client.js';
import { SimctlClient, type ISimctlClient } from './core/simctl-client.js';
import { ElementFinder, type IElementFinder } from './core/element-finder.js';
import { ImageDiffer, type IImageDiffer } from './core/image-differ.js';
import { ScenarioRunner, type IScenarioRunner } from './core/scenario-runner.js';
import { ReportGenerator, type IReportGenerator } from './core/report-generator.js';
import { Logger, type ILogger } from './utils/logger.js';
import { DEFAULT_CONFIG, type ServerConfig } from './interfaces/config.interface.js';
import type { TestRunResult, Waypoint } from './interfaces/scenario.interface.js';

/**
 * Normalize coordinate to 6 decimal places (10cm precision)
 * This ensures consistent coordinates for reproducible tests
 */
function normalizeCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Normalize waypoint coordinates to 6 decimal places
 */
function normalizeWaypoint(wp: Waypoint): Waypoint {
  return {
    latitude: normalizeCoordinate(wp.latitude),
    longitude: normalizeCoordinate(wp.longitude),
  };
}

/**
 * Normalize all coordinates in scenario steps for reproducibility
 */
function normalizeStepCoordinates(steps: Record<string, unknown>[]): Record<string, unknown>[] {
  return steps.map(step => {
    const normalized = { ...step };

    // Normalize set_location coordinates
    if (typeof normalized.latitude === 'number') {
      normalized.latitude = normalizeCoordinate(normalized.latitude);
    }
    if (typeof normalized.longitude === 'number') {
      normalized.longitude = normalizeCoordinate(normalized.longitude);
    }

    // Normalize waypoints array
    if (Array.isArray(normalized.waypoints)) {
      normalized.waypoints = (normalized.waypoints as Waypoint[]).map(normalizeWaypoint);
    }

    return normalized;
  });
}

export interface ServerContext {
  idbClient: IIDBClient;
  simctlClient: ISimctlClient;
  elementFinder: IElementFinder;
  imageDiffer: IImageDiffer;
  scenarioRunner: IScenarioRunner;
  reportGenerator: IReportGenerator;
  logger: ILogger;
  config: ServerConfig;
  resultsDir: string;
}

export function createServerContext(config: Partial<ServerConfig> = {}): ServerContext {
  const mergedConfig: ServerConfig = { ...DEFAULT_CONFIG, ...config };
  const logger = new Logger('snapdrive', mergedConfig.logLevel);

  const idbClient = new IDBClient({ deviceUdid: mergedConfig.defaultDeviceUdid }, undefined, logger);
  const simctlClient = new SimctlClient({ defaultDeviceUdid: mergedConfig.defaultDeviceUdid }, undefined, logger);
  const elementFinder = new ElementFinder();
  const imageDiffer = new ImageDiffer(logger);

  const scenarioRunner = new ScenarioRunner({
    idbClient,
    simctlClient,
    elementFinder,
    imageDiffer,
    logger,
  });
  const reportGenerator = new ReportGenerator(logger);

  return {
    idbClient,
    simctlClient,
    elementFinder,
    imageDiffer,
    scenarioRunner,
    reportGenerator,
    logger,
    config: mergedConfig,
    resultsDir: join(mergedConfig.resultsDir, new Date().toISOString().replace(/[:.]/g, '-')),
  };
}

export async function createServer(
  context: ServerContext = createServerContext()
): Promise<McpServer> {
  const { idbClient, simctlClient, imageDiffer, scenarioRunner, reportGenerator, logger } = context;

  // Ensure results directory exists (do not clean up previous results)
  await mkdir(context.resultsDir, { recursive: true });
  await mkdir(join(context.resultsDir, 'screenshots'), { recursive: true });
  await mkdir(join(context.resultsDir, 'diffs'), { recursive: true });

  const server = new McpServer({
    name: 'snapdrive',
    version: '0.1.0',
  });

  // ===========================================
  // OBSERVATION TOOLS
  // ===========================================

  server.tool(
    'screenshot',
    `Capture a screenshot of the iOS Simulator via idb (iOS Development Bridge).

IMPORTANT: Always use this tool for iOS Simulator screenshots. Do NOT use xcrun simctl, cliclick, osascript, or other CLI commands directly. This tool uses idb internally for reliable automation.`,
    {
      name: z.string().optional().describe('Optional name for the screenshot'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ name, deviceUdid }) => {
      const screenshotName = name ?? `screenshot_${Date.now()}`;
      const outputPath = join(context.resultsDir, 'screenshots', `${screenshotName}.png`);

      try {
        await simctlClient.screenshot(outputPath, deviceUdid);
        const base64 = await imageDiffer.toBase64(outputPath);

        return {
          content: [
            {
              type: 'image' as const,
              data: base64,
              mimeType: 'image/png',
            },
            {
              type: 'text' as const,
              text: JSON.stringify({ path: outputPath, name: screenshotName }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'describe_ui',
    `Get the accessibility tree of the iOS Simulator screen via idb (iOS Development Bridge).

IMPORTANT: Always use this tool to get UI element information. Do NOT use osascript, AppleScript, or other methods. This tool uses idb internally for reliable automation.

Use screenshot tool to visually identify elements, then use this for precise coordinates:
- Each element has 'frame' with x, y, width, height
- Tap point = frame center: x + width/2, y + height/2
- Note: Not all visual elements have accessibility entries`,
    {
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ deviceUdid }) => {
      try {
        const uiTree = await idbClient.describeAll(deviceUdid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  elementCount: uiTree.elements.length,
                  elements: uiTree.elements,
                  timestamp: uiTree.timestamp,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // ===========================================
  // ACTION TOOLS
  // ===========================================

  server.tool(
    'tap',
    `Tap on the iOS Simulator screen at specific coordinates via idb (iOS Development Bridge).

IMPORTANT: Always use this tool for tapping on iOS Simulator. Do NOT use cliclick, osascript, or other CLI tools. This tool uses idb internally for reliable automation.

Usage:
1. Use describe_ui to get element coordinates from frame property
2. Calculate tap point: frame.x + frame.width/2, frame.y + frame.height/2
3. Tap using those x/y coordinates`,
    {
      x: z.number().describe('X coordinate to tap'),
      y: z.number().describe('Y coordinate to tap'),
      duration: z.number().optional().describe('Tap duration in seconds (for long press)'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ x, y, duration, deviceUdid }) => {
      try {
        await idbClient.tap(x, y, { duration, deviceUdid });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, tappedAt: { x, y } }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'swipe',
    `Swipe from one point to another on the iOS Simulator via idb (iOS Development Bridge).

IMPORTANT: Always use this tool for swiping on iOS Simulator. Do NOT use cliclick, osascript, or other CLI tools. This tool uses idb internally for reliable automation.

Get coordinates from describe_ui frame property for precise swiping.`,
    {
      startX: z.number().describe('Starting X coordinate'),
      startY: z.number().describe('Starting Y coordinate'),
      endX: z.number().describe('Ending X coordinate'),
      endY: z.number().describe('Ending Y coordinate'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ startX, startY, endX, endY, deviceUdid }) => {
      try {
        await idbClient.swipe(startX, startY, endX, endY, { deviceUdid });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                from: { x: startX, y: startY },
                to: { x: endX, y: endY },
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'type_text',
    `Type text into the currently focused text field on iOS Simulator via idb (iOS Development Bridge).

IMPORTANT: Always use this tool for typing text. Do NOT use osascript, cliclick, or other CLI tools. This tool uses idb internally for reliable automation.`,
    {
      text: z.string().describe('Text to type'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ text, deviceUdid }) => {
      try {
        await idbClient.typeText(text, deviceUdid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, typed: text }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'wait',
    'Wait for a specified duration',
    {
      seconds: z.number().min(0.1).max(30).describe('Seconds to wait (0.1 to 30)'),
    },
    async ({ seconds }) => {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, waited: seconds }),
          },
        ],
      };
    }
  );


  // ===========================================
  // SIMULATOR MANAGEMENT TOOLS
  // ===========================================

  server.tool(
    'list_simulators',
    'List available iOS Simulators',
    {
      state: z
        .enum(['booted', 'shutdown', 'all'])
        .optional()
        .default('all')
        .describe('Filter by state'),
    },
    async ({ state = 'all' }) => {
      try {
        let devices = await simctlClient.listDevices();

        if (state !== 'all') {
          const targetState = state === 'booted' ? 'Booted' : 'Shutdown';
          devices = devices.filter((d) => d.state === targetState);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ simulators: devices, count: devices.length }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'launch_app',
    'Launch an app on the iOS Simulator',
    {
      bundleId: z.string().describe('App bundle identifier'),
      args: z.array(z.string()).optional().describe('Launch arguments'),
      terminateExisting: z.boolean().optional().default(true).describe('Terminate existing instance'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ bundleId, args, terminateExisting = true, deviceUdid }) => {
      try {
        await simctlClient.launchApp(bundleId, { args, terminateExisting }, deviceUdid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, bundleId, launched: true }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'terminate_app',
    'Terminate a running app on the iOS Simulator',
    {
      bundleId: z.string().describe('App bundle identifier'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ bundleId, deviceUdid }) => {
      try {
        await simctlClient.terminateApp(bundleId, deviceUdid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                bundleId,
                terminated: true,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'build_and_run',
    'Build Xcode project/workspace by scheme name, install and launch on simulator',
    {
      scheme: z.string().describe('Xcode scheme name'),
      projectPath: z.string().optional().describe('Path to .xcodeproj or .xcworkspace (auto-detected if omitted)'),
      simulatorName: z.string().optional().default('iPhone 15').describe('Simulator name'),
      configuration: z.enum(['Debug', 'Release']).optional().default('Debug').describe('Build configuration'),
      deviceUdid: z.string().optional().describe('Target simulator UDID (alternative to simulatorName)'),
    },
    async ({ scheme, projectPath, simulatorName = 'iPhone 15', configuration = 'Debug', deviceUdid }) => {
      try {
        const { CommandExecutor } = await import('./core/command-executor.js');
        const executor = new CommandExecutor();
        const { join, dirname } = await import('node:path');
        const { existsSync, readdirSync } = await import('node:fs');

        // Find .xcworkspace or .xcodeproj if not specified
        let project = projectPath;
        if (!project) {
          const cwd = process.cwd();
          const files = readdirSync(cwd);
          const workspace = files.find((f) => f.endsWith('.xcworkspace'));
          const xcodeproj = files.find((f) => f.endsWith('.xcodeproj'));
          project = workspace ? join(cwd, workspace) : xcodeproj ? join(cwd, xcodeproj) : undefined;
        }

        if (!project) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'No .xcworkspace or .xcodeproj found. Specify projectPath.',
                }),
              },
            ],
          };
        }

        const isWorkspace = project.endsWith('.xcworkspace');
        const projectFlag = isWorkspace ? '-workspace' : '-project';

        // Determine simulator
        let targetSimulator = simulatorName;
        if (deviceUdid) {
          const devices = await simctlClient.listDevices();
          const found = devices.find((d) => d.udid === deviceUdid);
          if (found) targetSimulator = found.name;
        }

        // Build
        const derivedDataPath = join(dirname(project), 'DerivedData', 'SnapDriveBuild');
        const buildArgs = [
          projectFlag, project,
          '-scheme', scheme,
          '-configuration', configuration,
          '-destination', `platform=iOS Simulator,name=${targetSimulator}`,
          '-derivedDataPath', derivedDataPath,
          'build',
        ];

        logger.info(`Building scheme: ${scheme}`);
        const buildResult = await executor.execute('xcodebuild', buildArgs, { timeoutMs: 300000 });

        if (buildResult.exitCode !== 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Build failed',
                  stderr: buildResult.stderr.slice(-1000),
                }),
              },
            ],
          };
        }

        // Find .app bundle
        const productsPath = join(derivedDataPath, 'Build', 'Products', `${configuration}-iphonesimulator`);
        let appPath: string | undefined;
        let bundleId: string | undefined;

        if (existsSync(productsPath)) {
          const products = readdirSync(productsPath);
          const appBundle = products.find((f) => f.endsWith('.app'));
          if (appBundle) {
            appPath = join(productsPath, appBundle);

            // Read bundle ID from Info.plist
            const infoPlistPath = join(appPath, 'Info.plist');
            if (existsSync(infoPlistPath)) {
              const plistResult = await executor.execute(
                '/usr/libexec/PlistBuddy',
                ['-c', 'Print :CFBundleIdentifier', infoPlistPath]
              );
              if (plistResult.exitCode === 0) {
                bundleId = plistResult.stdout.trim();
              }
            }
          }
        }

        if (!appPath || !bundleId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Build succeeded but could not find .app bundle or bundle ID',
                  productsPath,
                }),
              },
            ],
          };
        }

        // Boot simulator if needed
        const bootedDevice = await simctlClient.getBootedDevice();
        if (!bootedDevice) {
          const devices = await simctlClient.listDevices();
          const target = devices.find((d) => d.name === targetSimulator);
          if (target) {
            await simctlClient.boot(target.udid);
            await executor.execute('open', ['-a', 'Simulator']);
            // Wait for simulator to be ready
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }

        // Install app
        await simctlClient.installApp(appPath, deviceUdid);

        // Launch app
        await simctlClient.launchApp(bundleId, { terminateExisting: true }, deviceUdid);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                scheme,
                bundleId,
                appPath,
                simulator: targetSimulator,
                installed: true,
                launched: true,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'open_url',
    'Open a URL or deep link in the iOS Simulator',
    {
      url: z.string().describe('URL or deep link to open'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ url, deviceUdid }) => {
      try {
        await simctlClient.openUrl(url, deviceUdid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                url,
                opened: true,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'set_location',
    'Set the simulated GPS location of the iOS Simulator',
    {
      latitude: z.number().min(-90).max(90).describe('Latitude (-90 to 90)'),
      longitude: z.number().min(-180).max(180).describe('Longitude (-180 to 180)'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ latitude, longitude, deviceUdid }) => {
      try {
        await simctlClient.setLocation(latitude, longitude, deviceUdid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                latitude,
                longitude,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'clear_location',
    'Clear the simulated GPS location (revert to default)',
    {
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ deviceUdid }) => {
      try {
        await simctlClient.clearLocation(deviceUdid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                cleared: true,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  const waypointSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  });

  server.tool(
    'simulate_route',
    `Simulate GPS movement along a route (for navigation testing).

Provide an array of waypoints with latitude/longitude. The simulator will move through each point sequentially.`,
    {
      waypoints: z.array(waypointSchema).min(1).describe('Array of {latitude, longitude} waypoints'),
      intervalMs: z.number().optional().default(3000).describe('Time between waypoints in milliseconds (default: 3000 for map rendering)'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ waypoints, intervalMs = 3000, deviceUdid }) => {
      try {
        await simctlClient.simulateRoute(waypoints, { intervalMs }, deviceUdid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                waypointsCount: waypoints.length,
                intervalMs,
                completed: true,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // ===========================================
  // TEST CASE MANAGEMENT TOOLS
  // ===========================================

  server.tool(
    'list_test_cases',
    'List all test cases in the .snapdrive directory',
    {
      snapdriveDir: z.string().optional().describe('Path to .snapdrive directory (defaults to ./.snapdrive)'),
    },
    async ({ snapdriveDir }) => {
      try {
        const dir = snapdriveDir ?? join(process.cwd(), '.snapdrive');
        const testCases = await scenarioRunner.listTestCases(dir);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  count: testCases.length,
                  testCases: testCases.map((tc) => ({
                    id: tc.id,
                    name: tc.scenario.name,
                    description: tc.scenario.description,
                    stepsCount: tc.scenario.steps.length,
                    path: tc.path,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'run_test_case',
    'Run a specific test case by ID or path, compare with baselines, and generate HTML report',
    {
      testCaseId: z.string().optional().describe('Test case ID (directory name)'),
      testCasePath: z.string().optional().describe('Full path to test case directory'),
      snapdriveDir: z.string().optional().describe('Path to .snapdrive directory'),
      updateBaselines: z.boolean().optional().default(false).describe('Update baselines instead of comparing'),
      generateReport: z.boolean().optional().default(true).describe('Generate HTML report with visual diff'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ testCaseId, testCasePath, snapdriveDir, updateBaselines = false, generateReport = true, deviceUdid }) => {
      try {
        const baseDir = snapdriveDir ?? join(process.cwd(), '.snapdrive');
        let tcPath: string;

        if (testCasePath) {
          tcPath = testCasePath;
        } else if (testCaseId) {
          tcPath = join(baseDir, 'test-cases', testCaseId);
        } else {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Must provide either testCaseId or testCasePath',
                }),
              },
            ],
          };
        }

        const startTime = new Date();
        const testCase = await scenarioRunner.loadTestCase(tcPath);
        const result = await scenarioRunner.runTestCase(testCase, {
          deviceUdid,
          updateBaselines,
          resultsDir: context.resultsDir,
          testCasePath: tcPath,
        });
        const endTime = new Date();

        // Generate HTML report
        let reportPath: string | undefined;
        if (generateReport && !updateBaselines) {
          const testRunResult: TestRunResult = {
            runId: new Date().toISOString().replace(/[:.]/g, '-'),
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            durationMs: endTime.getTime() - startTime.getTime(),
            totalTests: 1,
            passed: result.success ? 1 : 0,
            failed: result.success ? 0 : 1,
            results: [result],
            resultsDir: context.resultsDir,
          };
          reportPath = await reportGenerator.generateReport(testRunResult);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  testCaseName: result.testCaseName,
                  durationMs: result.durationMs,
                  stepsExecuted: result.steps.length,
                  stepsPassed: result.steps.filter((s) => s.success).length,
                  checkpoints: result.checkpoints.map((cp) => ({
                    name: cp.name,
                    match: cp.match,
                    differencePercent: cp.differencePercent.toFixed(2),
                  })),
                  reportPath,
                  resultsDir: context.resultsDir,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'run_all_tests',
    'Run all test cases in the .snapdrive directory and generate a report',
    {
      snapdriveDir: z.string().optional().describe('Path to .snapdrive directory'),
      updateBaselines: z.boolean().optional().default(false).describe('Update baselines instead of comparing'),
      generateReport: z.boolean().optional().default(true).describe('Generate HTML report'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ snapdriveDir, updateBaselines = false, generateReport = true, deviceUdid }) => {
      try {
        const baseDir = snapdriveDir ?? join(process.cwd(), '.snapdrive');
        const testCases = await scenarioRunner.listTestCases(baseDir);

        if (testCases.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'No test cases found',
                  searchPath: join(baseDir, 'test-cases'),
                }),
              },
            ],
          };
        }

        const startTime = new Date();
        const results: TestRunResult = {
          runId: new Date().toISOString().replace(/[:.]/g, '-'),
          startTime: startTime.toISOString(),
          endTime: '',
          durationMs: 0,
          totalTests: testCases.length,
          passed: 0,
          failed: 0,
          results: [],
          resultsDir: context.resultsDir,
        };

        for (const testCase of testCases) {
          const result = await scenarioRunner.runTestCase(testCase, {
            deviceUdid,
            updateBaselines,
            resultsDir: context.resultsDir,
            testCasePath: testCase.path,
          });

          results.results.push(result);
          if (result.success) {
            results.passed++;
          } else {
            results.failed++;
          }
        }

        const endTime = new Date();
        results.endTime = endTime.toISOString();
        results.durationMs = endTime.getTime() - startTime.getTime();

        // Generate HTML report
        let reportPath: string | undefined;
        if (generateReport) {
          reportPath = await reportGenerator.generateReport(results);
          results.reportPath = reportPath;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: results.failed === 0,
                  totalTests: results.totalTests,
                  passed: results.passed,
                  failed: results.failed,
                  durationMs: results.durationMs,
                  reportPath,
                  resultsDir: context.resultsDir,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // Step schema for scenario definition
  const stepSchema = z.object({
    action: z.enum([
      'launch_app', 'terminate_app', 'tap', 'swipe', 'type_text',
      'wait', 'checkpoint', 'full_page_checkpoint', 'smart_checkpoint',
      'scroll_to_top', 'scroll_to_bottom', 'open_url',
      'set_location', 'clear_location', 'simulate_route'
    ]),
    bundleId: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    duration: z.number().optional(),
    direction: z.enum(['up', 'down', 'left', 'right']).optional(),
    startX: z.number().optional(),
    startY: z.number().optional(),
    endX: z.number().optional(),
    endY: z.number().optional(),
    distance: z.number().optional(),
    text: z.string().optional(),
    seconds: z.number().optional(),
    name: z.string().optional(),
    compare: z.boolean().optional(),
    tolerance: z.number().optional(),
    // full_page_checkpoint / smart_checkpoint / scroll_to_top / scroll_to_bottom options
    maxScrolls: z.number().optional(),
    scrollAmount: z.number().optional(),
    stitchImages: z.boolean().optional(),
    url: z.string().optional(),
    // set_location
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    // simulate_route
    waypoints: z.array(waypointSchema).optional(),
    intervalMs: z.number().optional(),
    captureAtWaypoints: z.boolean().optional(),
    captureDelayMs: z.number().optional(),
    waypointCheckpointName: z.string().optional(),
  });

  server.tool(
    'create_test_case',
    `Create a new test case with scenario steps and capture baseline screenshots.

Workflow:
1. Use screenshot to see the screen, use describe_ui for precise coordinates
2. Use tap/swipe/type_text to navigate
3. Use smart_checkpoint for EVERY screen to verify

CRITICAL - Scrollable Content:
- ALWAYS use smart_checkpoint (NOT checkpoint) for screens
- smart_checkpoint auto-detects scrollable content and captures full page
- It scrolls through ALL content and stitches screenshots together
- This ensures content below the fold is also verified

Available checkpoint actions:
- checkpoint: Single screenshot (use only for non-scrollable screens)
- smart_checkpoint: Auto-detects scroll, captures full page if scrollable (RECOMMENDED)
- full_page_checkpoint: Forces full page capture with scroll

IMPORTANT: Do NOT modify app source code. Only create test scenarios.`,
    {
      name: z.string().describe('Test case name/ID (used as directory name, e.g., "login-flow")'),
      displayName: z.string().optional().describe('Human-readable name (e.g., "ログインフロー")'),
      description: z.string().optional().describe('Description of what this test case does'),
      steps: z.array(stepSchema).optional().describe('Array of scenario steps. If not provided, creates a template.'),
      createBaselines: z.boolean().optional().default(false).describe('Run the test case immediately to capture baseline screenshots'),
      deviceUdid: z.string().optional().describe('Target simulator UDID (required if createBaselines is true)'),
      snapdriveDir: z.string().optional().describe('Path to .snapdrive directory'),
    },
    async ({ name, displayName, description, steps, createBaselines = false, deviceUdid, snapdriveDir }) => {
      try {
        const { writeFile } = await import('node:fs/promises');
        const { stringify } = await import('yaml');

        const baseDir = snapdriveDir ?? join(process.cwd(), '.snapdrive');
        const testCasePath = join(baseDir, 'test-cases', name);
        const scenarioPath = join(testCasePath, 'scenario.yaml');
        const baselinesDir = join(testCasePath, 'baselines');

        // Create directories
        await mkdir(testCasePath, { recursive: true });
        await mkdir(baselinesDir, { recursive: true });

        // Use provided steps or create template
        const rawSteps = steps ?? [
          { action: 'launch_app', bundleId: 'com.example.app' },
          { action: 'wait', seconds: 1 },
          { action: 'checkpoint', name: 'initial_screen', compare: true },
        ];

        // Normalize coordinates to 6 decimal places for reproducibility
        const scenarioSteps = normalizeStepCoordinates(rawSteps as Record<string, unknown>[]);

        const scenario = {
          name: displayName ?? name,
          description: description ?? 'Test case description',
          steps: scenarioSteps,
        };

        await writeFile(scenarioPath, stringify(scenario), 'utf-8');

        // Optionally run immediately to create baselines
        let runResult = null;
        if (createBaselines && steps) {
          const testCase = await scenarioRunner.loadTestCase(testCasePath);
          runResult = await scenarioRunner.runTestCase(testCase, {
            deviceUdid,
            updateBaselines: true,
            resultsDir: context.resultsDir,
            testCasePath,
          });
        }

        const message = createBaselines && runResult
          ? `Test case created and baselines captured. ${runResult.checkpoints.length} checkpoint(s) saved.`
          : steps
            ? `Test case created with ${steps.length} steps. Use createBaselines=true or run separately to capture screenshots.`
            : 'Template created. Edit scenario.yaml or use create_test_case with steps parameter.';

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  testCasePath,
                  scenarioPath,
                  baselinesDir,
                  stepsCount: scenarioSteps.length,
                  baselinesCreated: createBaselines && runResult ? true : false,
                  checkpointsCaptured: runResult?.checkpoints.length ?? 0,
                  message,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }
  );

  logger.info('SnapDrive MCP Server initialized');

  return server;
}

export async function startServer(): Promise<void> {
  const config: Partial<ServerConfig> = {
    resultsDir: process.env['SNAPDRIVE_RESULTS_DIR'] ?? './results',
    logLevel: (process.env['SNAPDRIVE_LOG_LEVEL'] as ServerConfig['logLevel']) ?? 'info',
  };

  const context = createServerContext(config);
  const server = await createServer(context);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  context.logger.info('SnapDrive MCP Server started');
}
