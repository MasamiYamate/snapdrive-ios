/**
 * Configuration types for SnapDrive MCP Server
 */

export interface ServerConfig {
  // Paths
  resultsDir: string;

  // Defaults
  defaultTimeoutMs: number;
  defaultPollIntervalMs: number;
  defaultTolerance: number;

  // Screenshot settings
  screenshotScale: number;
  screenshotFormat: 'png' | 'jpeg';

  // Device settings
  defaultDeviceUdid?: string;

  // Plugin settings
  pluginsDir?: string;
  enabledPlugins: string[];

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_CONFIG: ServerConfig = {
  resultsDir: './results',
  defaultTimeoutMs: 8000,
  defaultPollIntervalMs: 500,
  defaultTolerance: 0.0,
  screenshotScale: 1.0,
  screenshotFormat: 'png',
  enabledPlugins: [],
  logLevel: 'info',
};

export interface Simulator {
  udid: string;
  name: string;
  state: SimulatorState;
  runtime: string;
  deviceType?: string;
}

export type SimulatorState = 'Booted' | 'Shutdown' | 'Creating' | 'Unknown';

export type DeviceButton =
  | 'HOME'
  | 'LOCK'
  | 'SIDE_BUTTON'
  | 'SIRI'
  | 'APPLE_PAY';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface ExecuteOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
}
