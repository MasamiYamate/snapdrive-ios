/**
 * Scenario and test case types for SnapDrive
 */

export type ScenarioAction =
  | 'launch_app'
  | 'terminate_app'
  | 'tap'
  | 'swipe'
  | 'type_text'
  | 'wait'
  | 'wait_for_element'
  | 'scroll_to_element'
  | 'checkpoint'
  | 'open_url';

export interface ScenarioStep {
  action: ScenarioAction;
  // launch_app / terminate_app
  bundleId?: string;
  // tap
  label?: string;
  labelContains?: string;
  x?: number;
  y?: number;
  duration?: number;
  // swipe
  direction?: 'up' | 'down' | 'left' | 'right';
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  distance?: number;
  // type_text
  text?: string;
  target?: string; // label of field to tap before typing
  // wait
  seconds?: number;
  // wait_for_element
  type?: string;
  timeoutMs?: number;
  // checkpoint
  name?: string;
  compare?: boolean;
  tolerance?: number;
  // open_url
  url?: string;
}

export interface Scenario {
  name: string;
  description?: string;
  steps: ScenarioStep[];
  // Optional settings
  deviceName?: string;
  deviceUdid?: string;
}

export interface TestCase {
  id: string;
  path: string;
  scenario: Scenario;
  baselinesDir: string;
}

export interface StepResult {
  stepIndex: number;
  action: ScenarioAction;
  success: boolean;
  error?: string;
  duration: number;
  checkpoint?: CheckpointResult;
}

export interface CheckpointResult {
  name: string;
  match: boolean;
  differencePercent: number;
  baselinePath: string;
  actualPath: string;
  diffPath?: string;
}

export interface TestCaseResult {
  testCaseId: string;
  testCaseName: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  success: boolean;
  steps: StepResult[];
  checkpoints: CheckpointResult[];
}

export interface TestRunResult {
  runId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  totalTests: number;
  passed: number;
  failed: number;
  results: TestCaseResult[];
  resultsDir: string;
  reportPath?: string;
}
