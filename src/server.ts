/**
 * SnapDrive MCP Server
 * Provides iOS Simulator automation tools via Model Context Protocol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { IDBClient, type IIDBClient } from './core/idb-client.js';
import { SimctlClient, type ISimctlClient } from './core/simctl-client.js';
import { ElementFinder, type IElementFinder } from './core/element-finder.js';
import { ImageDiffer, type IImageDiffer } from './core/image-differ.js';
import { ScenarioRunner, type IScenarioRunner } from './core/scenario-runner.js';
import { ReportGenerator, type IReportGenerator } from './core/report-generator.js';
import { Logger, type ILogger } from './utils/logger.js';
import { DEFAULT_CONFIG, type ServerConfig } from './interfaces/config.interface.js';
import type { TestRunResult } from './interfaces/scenario.interface.js';

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
  const { idbClient, simctlClient, elementFinder, imageDiffer, scenarioRunner, reportGenerator, logger, config } = context;

  // Clean up previous results
  if (existsSync(config.resultsDir)) {
    logger.info(`Cleaning up previous results in: ${config.resultsDir}`);
    await rm(config.resultsDir, { recursive: true, force: true });
  }

  // Ensure results directory exists
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
    'Capture a screenshot of the iOS Simulator and return as base64 image',
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
    'Get the accessibility tree of all visible UI elements on screen',
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

  server.tool(
    'find_element',
    'Find UI elements matching criteria and return their details including tap coordinates',
    {
      label: z.string().optional().describe('Exact label match'),
      labelContains: z.string().optional().describe('Partial label match'),
      type: z.string().optional().describe('Element type (button, staticText, etc.)'),
      role: z.string().optional().describe('Accessibility role'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ label, labelContains, type, role, deviceUdid }) => {
      try {
        const uiTree = await idbClient.describeAll(deviceUdid);
        const result = elementFinder.findBest(uiTree.elements, {
          label,
          labelContains,
          type,
          role,
        });

        if (!result.found) {
          const availableLabels = elementFinder.getAllLabels(uiTree.elements).slice(0, 20);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    found: false,
                    message: 'No matching elements found',
                    availableLabels,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  found: true,
                  count: result.count,
                  element: result.element,
                  tapCoordinates: result.tapCoordinates,
                  allMatches: result.elements.slice(0, 5),
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
    'Tap on the iOS Simulator screen at coordinates or by finding an element by label',
    {
      x: z.number().optional().describe('X coordinate to tap'),
      y: z.number().optional().describe('Y coordinate to tap'),
      label: z.string().optional().describe('Label of element to tap (alternative to coordinates)'),
      labelContains: z.string().optional().describe('Partial label match'),
      duration: z.number().optional().describe('Tap duration in seconds (for long press)'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ x, y, label, labelContains, duration, deviceUdid }) => {
      try {
        let tapX: number;
        let tapY: number;

        if (label || labelContains) {
          // Find element and tap its center
          const uiTree = await idbClient.describeAll(deviceUdid);
          const result = elementFinder.findBest(uiTree.elements, { label, labelContains });

          if (!result.found || !result.tapCoordinates) {
            const availableLabels = elementFinder.getAllLabels(uiTree.elements).slice(0, 10);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: false,
                    error: `Element not found: ${label ?? labelContains}`,
                    availableLabels,
                  }),
                },
              ],
            };
          }

          tapX = result.tapCoordinates.x;
          tapY = result.tapCoordinates.y;
        } else if (x !== undefined && y !== undefined) {
          tapX = x;
          tapY = y;
        } else {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Must provide either label/labelContains or x/y coordinates',
                }),
              },
            ],
          };
        }

        await idbClient.tap(tapX, tapY, { duration, deviceUdid });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, tappedAt: { x: tapX, y: tapY } }),
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
    'Perform a swipe gesture on the iOS Simulator',
    {
      startX: z.number().optional().describe('Starting X coordinate'),
      startY: z.number().optional().describe('Starting Y coordinate'),
      endX: z.number().optional().describe('Ending X coordinate'),
      endY: z.number().optional().describe('Ending Y coordinate'),
      direction: z
        .enum(['up', 'down', 'left', 'right'])
        .optional()
        .describe('Swipe direction (alternative to explicit coordinates)'),
      distance: z.number().optional().default(300).describe('Swipe distance in points'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ startX, startY, endX, endY, direction, distance = 300, deviceUdid }) => {
      try {
        let sX: number, sY: number, eX: number, eY: number;

        if (direction) {
          // Use screen center as starting point
          const centerX = 200;
          const centerY = 400;

          switch (direction) {
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
          startX !== undefined &&
          startY !== undefined &&
          endX !== undefined &&
          endY !== undefined
        ) {
          sX = startX;
          sY = startY;
          eX = endX;
          eY = endY;
        } else {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Must provide either direction or start/end coordinates',
                }),
              },
            ],
          };
        }

        await idbClient.swipe(sX, sY, eX, eY, { deviceUdid });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                from: { x: sX, y: sY },
                to: { x: eX, y: eY },
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
    'Type text into the currently focused text field',
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

  server.tool(
    'wait_for_element',
    'Wait for a UI element to appear on screen',
    {
      label: z.string().optional().describe('Exact label match'),
      labelContains: z.string().optional().describe('Partial label match'),
      type: z.string().optional().describe('Element type'),
      timeoutMs: z.number().optional().default(8000).describe('Maximum wait time in milliseconds'),
      pollIntervalMs: z.number().optional().default(500).describe('Polling interval'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ label, labelContains, type, timeoutMs = 8000, pollIntervalMs = 500, deviceUdid }) => {
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        try {
          const uiTree = await idbClient.describeAll(deviceUdid);
          const result = elementFinder.findBest(uiTree.elements, { label, labelContains, type });

          if (result.found) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: true,
                    found: true,
                    element: result.element,
                    tapCoordinates: result.tapCoordinates,
                    elapsedMs: Date.now() - startTime,
                  }),
                },
              ],
            };
          }
        } catch {
          // Continue polling
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              found: false,
              error: `Element not found within ${timeoutMs}ms`,
              searchCriteria: { label, labelContains, type },
            }),
          },
        ],
      };
    }
  );

  // ===========================================
  // VALIDATION TOOLS
  // ===========================================

  server.tool(
    'compare_screenshot',
    'Compare current screen against a baseline image',
    {
      baselineName: z.string().describe('Name of the baseline to compare against'),
      profile: z.string().optional().default('default').describe('Baseline profile folder'),
      tolerance: z.number().optional().default(0).describe('Allowed difference ratio (0.0 to 1.0)'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ baselineName, profile = 'default', tolerance = 0, deviceUdid }) => {
      try {
        // Take current screenshot
        const screenshotPath = join(context.resultsDir, 'screenshots', `${baselineName}_actual.png`);
        await simctlClient.screenshot(screenshotPath, deviceUdid);

        // Compare with baseline
        const baselinePath = join(config.baselinesDir, profile, `${baselineName}.png`);
        const diffPath = join(context.resultsDir, 'diffs', `${baselineName}_diff.png`);

        const result = await imageDiffer.compare(screenshotPath, baselinePath, {
          tolerance,
          generateDiff: true,
          diffOutputPath: diffPath,
        });

        const response: Record<string, unknown> = {
          success: result.match,
          differencePercent: (result.differenceRatio * 100).toFixed(2),
          baselinePath,
          screenshotPath,
        };

        if (result.diffImagePath) {
          response['diffImagePath'] = result.diffImagePath;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
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
    'update_baseline',
    'Save current screenshot as a new baseline',
    {
      name: z.string().describe('Name for the baseline'),
      profile: z.string().optional().default('default').describe('Baseline profile folder'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ name, profile = 'default', deviceUdid }) => {
      try {
        // Take screenshot
        const screenshotPath = join(context.resultsDir, 'screenshots', `${name}_baseline.png`);
        await simctlClient.screenshot(screenshotPath, deviceUdid);

        // Copy to baseline location
        const baselinePath = join(config.baselinesDir, profile, `${name}.png`);
        await imageDiffer.updateBaseline(screenshotPath, baselinePath);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                baselinePath,
                name,
                profile,
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
    'boot_simulator',
    'Boot an iOS Simulator by name or UDID. Opens Simulator.app if not already open.',
    {
      deviceName: z.string().optional().describe('Simulator name (e.g., "iPhone 15")'),
      deviceUdid: z.string().optional().describe('Simulator UDID'),
      openSimulatorApp: z.boolean().optional().default(true).describe('Open Simulator.app'),
    },
    async ({ deviceName, deviceUdid, openSimulatorApp = true }) => {
      try {
        let targetUdid = deviceUdid;

        // Find UDID by name if not provided
        if (!targetUdid && deviceName) {
          const devices = await simctlClient.listDevices();
          const found = devices.find(
            (d) => d.name.toLowerCase() === deviceName.toLowerCase()
          );
          if (!found) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: false,
                    error: `Simulator "${deviceName}" not found`,
                    availableSimulators: devices.map((d) => d.name),
                  }),
                },
              ],
            };
          }
          targetUdid = found.udid;
        }

        if (!targetUdid) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Must provide either deviceName or deviceUdid',
                }),
              },
            ],
          };
        }

        // Boot the simulator
        await simctlClient.boot(targetUdid);

        // Open Simulator.app
        if (openSimulatorApp) {
          const { CommandExecutor } = await import('./core/command-executor.js');
          const executor = new CommandExecutor();
          await executor.execute('open', ['-a', 'Simulator']);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                udid: targetUdid,
                booted: true,
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
    'install_app',
    'Install an app (.app bundle) on the iOS Simulator',
    {
      appPath: z.string().describe('Path to .app bundle'),
      deviceUdid: z.string().optional().describe('Target simulator UDID'),
    },
    async ({ appPath, deviceUdid }) => {
      try {
        await simctlClient.installApp(appPath, deviceUdid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                appPath,
                installed: true,
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
      'wait', 'wait_for_element', 'scroll_to_element',
      'checkpoint', 'full_page_checkpoint', 'smart_checkpoint', 'open_url'
    ]),
    bundleId: z.string().optional(),
    label: z.string().optional(),
    labelContains: z.string().optional(),
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
    target: z.string().optional(),
    seconds: z.number().optional(),
    type: z.string().optional(),
    timeoutMs: z.number().optional(),
    name: z.string().optional(),
    compare: z.boolean().optional(),
    tolerance: z.number().optional(),
    // full_page_checkpoint / smart_checkpoint options
    scrollDirection: z.enum(['up', 'down']).optional(),
    maxScrolls: z.number().optional(),
    scrollAmount: z.number().optional(),
    stitchImages: z.boolean().optional(),
    url: z.string().optional(),
  });

  server.tool(
    'create_test_case',
    `Create a new test case with scenario steps and optionally capture baseline screenshots immediately.

IMPORTANT: When creating test cases, you must ONLY create test scenarios. Do NOT modify any application source code or implementation files. Test cases should verify existing behavior, not change it.

When creating navigation/transition tests:
1. Navigate to the target screen
2. Use 'smart_checkpoint' action to capture the destination screen - it automatically detects scrollable views and captures full content

Available checkpoint actions:
- checkpoint: Captures current screen only
- full_page_checkpoint: Always scrolls and captures entire scrollable content
- smart_checkpoint: Auto-detects scrollable views, uses full_page if scrollable, otherwise regular checkpoint (RECOMMENDED for navigation tests)`,
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
        const scenarioSteps = steps ?? [
          { action: 'launch_app', bundleId: 'com.example.app' },
          { action: 'wait', seconds: 1 },
          { action: 'checkpoint', name: 'initial_screen', compare: true },
        ];

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
    baselinesDir: process.env['SNAPDRIVE_BASELINES_DIR'] ?? './baselines',
    resultsDir: process.env['SNAPDRIVE_RESULTS_DIR'] ?? './results',
    logLevel: (process.env['SNAPDRIVE_LOG_LEVEL'] as ServerConfig['logLevel']) ?? 'info',
  };

  const context = createServerContext(config);
  const server = await createServer(context);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  context.logger.info('SnapDrive MCP Server started');
}
