#!/usr/bin/env node
/**
 * SnapDrive CLI
 * Run tests directly from command line without Claude/MCP
 */

import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { IDBClient } from './core/idb-client.js';
import { SimctlClient } from './core/simctl-client.js';
import { ElementFinder } from './core/element-finder.js';
import { ImageDiffer } from './core/image-differ.js';
import { ScenarioRunner } from './core/scenario-runner.js';
import { ReportGenerator } from './core/report-generator.js';
import { Logger } from './utils/logger.js';
import type { TestRunResult } from './interfaces/scenario.interface.js';

const VERSION = '0.1.0';

interface CliOptions {
  command: 'list' | 'run' | 'help' | 'version';
  testCaseId?: string;
  all?: boolean;
  updateBaselines?: boolean;
  snapdriveDir?: string;
  resultsDir?: string;
  deviceUdid?: string;
  verbose?: boolean;
}

function printHelp(): void {
  console.log(`
SnapDrive CLI v${VERSION}
iOS Simulator UI testing tool

Usage:
  snapdrive <command> [options]

Commands:
  list                    List all test cases
  run <test-case-id>      Run a specific test case
  run --all               Run all test cases
  help                    Show this help message
  version                 Show version

Options:
  --all                   Run all test cases
  --update-baselines      Update baseline screenshots instead of comparing
  --snapdrive-dir <path>  Path to .snapdrive directory (default: ./.snapdrive)
  --results-dir <path>    Path to results directory (default: ./results)
  --device <udid>         Target simulator UDID
  --verbose               Enable verbose logging

Examples:
  snapdrive list
  snapdrive run login-flow
  snapdrive run login-flow --update-baselines
  snapdrive run --all
  snapdrive run --all --verbose
`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    command: 'help',
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === 'list') {
      options.command = 'list';
    } else if (arg === 'run') {
      options.command = 'run';
    } else if (arg === 'help' || arg === '--help' || arg === '-h') {
      options.command = 'help';
    } else if (arg === 'version' || arg === '--version' || arg === '-v') {
      options.command = 'version';
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
    } else if (arg === '--update-baselines' || arg === '-u') {
      options.updateBaselines = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--snapdrive-dir' && args[i + 1]) {
      options.snapdriveDir = args[++i];
    } else if (arg === '--results-dir' && args[i + 1]) {
      options.resultsDir = args[++i];
    } else if (arg === '--device' && args[i + 1]) {
      options.deviceUdid = args[++i];
    } else if (!arg.startsWith('-') && options.command === 'run' && !options.testCaseId) {
      options.testCaseId = arg;
    }

    i++;
  }

  return options;
}

async function createRunner(verbose: boolean) {
  const logLevel = verbose ? 'debug' : 'info';
  const logger = new Logger('snapdrive-cli', logLevel);

  const idbClient = new IDBClient({}, undefined, logger);
  const simctlClient = new SimctlClient({}, undefined, logger);
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

  return { scenarioRunner, reportGenerator, logger };
}

async function listTestCases(options: CliOptions): Promise<void> {
  const snapdriveDir = options.snapdriveDir ?? join(process.cwd(), '.snapdrive');
  const { scenarioRunner } = await createRunner(options.verbose ?? false);

  console.log(`\nLooking for test cases in: ${snapdriveDir}/test-cases\n`);

  const testCases = await scenarioRunner.listTestCases(snapdriveDir);

  if (testCases.length === 0) {
    console.log('No test cases found.');
    console.log('\nCreate a test case with Claude:');
    console.log('  "login-flowという名前でテストケースを作成して"');
    return;
  }

  console.log(`Found ${testCases.length} test case(s):\n`);
  console.log('─'.repeat(60));

  for (const tc of testCases) {
    console.log(`  ${tc.id}`);
    console.log(`    Name: ${tc.scenario.name}`);
    if (tc.scenario.description) {
      console.log(`    Description: ${tc.scenario.description}`);
    }
    console.log(`    Steps: ${tc.scenario.steps.length}`);
    console.log('');
  }
}

async function runTests(options: CliOptions): Promise<void> {
  const snapdriveDir = options.snapdriveDir ?? join(process.cwd(), '.snapdrive');
  const baseResultsDir = options.resultsDir ?? join(process.cwd(), 'results');
  const resultsDir = join(baseResultsDir, new Date().toISOString().replace(/[:.]/g, '-'));

  const { scenarioRunner, reportGenerator } = await createRunner(options.verbose ?? false);

  // Ensure results directory exists (do not clean up previous results)
  await mkdir(resultsDir, { recursive: true });
  await mkdir(join(resultsDir, 'screenshots'), { recursive: true });
  await mkdir(join(resultsDir, 'diffs'), { recursive: true });

  let testCases;

  if (options.all) {
    testCases = await scenarioRunner.listTestCases(snapdriveDir);
    if (testCases.length === 0) {
      console.error('No test cases found.');
      process.exit(1);
    }
    console.log(`\nRunning all ${testCases.length} test case(s)...\n`);
  } else if (options.testCaseId) {
    const tcPath = join(snapdriveDir, 'test-cases', options.testCaseId);
    try {
      const testCase = await scenarioRunner.loadTestCase(tcPath);
      testCases = [testCase];
      console.log(`\nRunning test case: ${options.testCaseId}\n`);
    } catch (error) {
      console.error(`Error: Test case not found: ${options.testCaseId}`);
      console.error(`Expected path: ${tcPath}`);
      process.exit(1);
    }
  } else {
    console.error('Error: Specify a test case ID or use --all');
    console.error('Usage: snapdrive run <test-case-id>');
    console.error('       snapdrive run --all');
    process.exit(1);
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
    resultsDir,
  };

  console.log('─'.repeat(60));

  for (const testCase of testCases) {
    const mode = options.updateBaselines ? '[UPDATE BASELINES]' : '[COMPARE]';
    console.log(`\n${mode} ${testCase.scenario.name}`);

    try {
      const result = await scenarioRunner.runTestCase(testCase, {
        deviceUdid: options.deviceUdid,
        updateBaselines: options.updateBaselines ?? false,
        resultsDir,
        testCasePath: testCase.path,
      });

      results.results.push(result);

      if (result.success) {
        results.passed++;
        console.log(`  ✓ PASSED (${(result.durationMs / 1000).toFixed(2)}s)`);
      } else {
        results.failed++;
        console.log(`  ✗ FAILED (${(result.durationMs / 1000).toFixed(2)}s)`);

        // Show failed steps
        for (const step of result.steps) {
          if (!step.success) {
            console.log(`    - Step ${step.stepIndex + 1} (${step.action}): ${step.error}`);
          }
        }

        // Show checkpoint diffs
        for (const cp of result.checkpoints) {
          if (!cp.match) {
            console.log(`    - Checkpoint "${cp.name}": ${cp.differencePercent.toFixed(2)}% different`);
          }
        }
      }
    } catch (error) {
      results.failed++;
      console.log(`  ✗ ERROR: ${String(error)}`);
    }
  }

  const endTime = new Date();
  results.endTime = endTime.toISOString();
  results.durationMs = endTime.getTime() - startTime.getTime();

  console.log('\n' + '─'.repeat(60));
  console.log('\nSummary:');
  console.log(`  Total:  ${results.totalTests}`);
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Duration: ${(results.durationMs / 1000).toFixed(2)}s`);

  // Generate report if comparing (not updating baselines)
  if (!options.updateBaselines) {
    const reportPath = await reportGenerator.generateReport(results);
    console.log(`\n📄 Report: ${reportPath}`);
  }

  console.log(`📁 Results: ${resultsDir}`);
  console.log('');

  // Exit with error code if tests failed
  if (results.failed > 0) {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  try {
    switch (options.command) {
      case 'list':
        await listTestCases(options);
        break;
      case 'run':
        await runTests(options);
        break;
      case 'version':
        console.log(`snapdrive v${VERSION}`);
        break;
      case 'help':
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error('Error:', String(error));
    process.exit(1);
  }
}

main();
