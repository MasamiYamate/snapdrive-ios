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
  | 'checkpoint'
  | 'full_page_checkpoint'
  | 'smart_checkpoint'
  | 'scroll_to_top'
  | 'scroll_to_bottom'
  | 'open_url'
  | 'set_location'
  | 'clear_location'
  | 'simulate_route';

export interface Waypoint {
  latitude: number;
  longitude: number;
}

export interface ScenarioStep {
  action: ScenarioAction;
  // launch_app / terminate_app
  bundleId?: string;
  // tap (coordinates required)
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
  // wait
  seconds?: number;
  // checkpoint
  name?: string;
  compare?: boolean;
  tolerance?: number;
  // full_page_checkpoint / scroll_to_top
  maxScrolls?: number;
  scrollAmount?: number; // pixels to scroll each time
  stitchImages?: boolean; // true: stitch into one image, false: compare each segment
  // open_url
  url?: string;
  // set_location
  latitude?: number;
  longitude?: number;
  // simulate_route
  waypoints?: Waypoint[];
  intervalMs?: number;
  captureAtWaypoints?: boolean; // capture screenshot at each waypoint
  captureDelayMs?: number; // delay before capturing screenshot at each waypoint (default: 2000)
  waypointCheckpointName?: string; // checkpoint name prefix for waypoint screenshots
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

export interface WaypointComparisonResult {
  index: number;
  actualPath: string;
  baselinePath: string;
  diffPath?: string;
  match: boolean;
  differencePercent: number;
}

export interface CheckpointResult {
  name: string;
  match: boolean;
  differencePercent: number;
  baselinePath: string;
  actualPath: string;
  diffPath?: string;
  // For full_page_checkpoint / smart_checkpoint with scrollable views
  isFullPage?: boolean;
  segmentPaths?: string[];
  // For simulate_route with captureAtWaypoints
  isRouteSimulation?: boolean;
  waypointResults?: WaypointComparisonResult[];
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
