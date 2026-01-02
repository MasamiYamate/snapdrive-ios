/**
 * simctl (Simulator Control) client wrapper
 * Wraps xcrun simctl for simulator management and screenshots
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Simulator } from '../interfaces/config.interface.js';
import { type ICommandExecutor, CommandExecutor } from './command-executor.js';
import { type ILogger, Logger } from '../utils/logger.js';

export interface SimctlClientOptions {
  defaultDeviceUdid?: string;
  timeoutMs?: number;
}

export interface LaunchOptions {
  args?: string[];
  env?: Record<string, string>;
  waitForDebugger?: boolean;
  terminateExisting?: boolean;
}

export interface Waypoint {
  latitude: number;
  longitude: number;
}

export interface RouteOptions {
  intervalMs?: number; // Time between waypoints in milliseconds (default: 3000)
  loop?: boolean; // Whether to loop the route (default: false)
}

export interface ISimctlClient {
  screenshot(outputPath: string, deviceUdid?: string): Promise<string>;
  listDevices(): Promise<Simulator[]>;
  getBootedDevice(): Promise<Simulator | null>;
  boot(deviceUdid: string): Promise<void>;
  shutdown(deviceUdid?: string): Promise<void>;
  launchApp(bundleId: string, options?: LaunchOptions, deviceUdid?: string): Promise<void>;
  terminateApp(bundleId: string, deviceUdid?: string): Promise<void>;
  installApp(appPath: string, deviceUdid?: string): Promise<void>;
  openUrl(url: string, deviceUdid?: string): Promise<void>;
  setLocation(latitude: number, longitude: number, deviceUdid?: string): Promise<void>;
  clearLocation(deviceUdid?: string): Promise<void>;
  simulateRoute(waypoints: Waypoint[], options?: RouteOptions, deviceUdid?: string): Promise<void>;
}

export class SimctlClient implements ISimctlClient {
  private executor: ICommandExecutor;
  private logger: ILogger;
  private defaultUdid?: string;
  private timeoutMs: number;

  constructor(
    options: SimctlClientOptions = {},
    executor?: ICommandExecutor,
    logger?: ILogger
  ) {
    this.executor = executor ?? new CommandExecutor();
    this.logger = logger ?? new Logger('simctl-client');
    this.defaultUdid = options.defaultDeviceUdid;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  private getDevice(deviceUdid?: string): string {
    return deviceUdid ?? this.defaultUdid ?? 'booted';
  }

  async screenshot(outputPath: string, deviceUdid?: string): Promise<string> {
    // Ensure directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    const device = this.getDevice(deviceUdid);
    const args = ['simctl', 'io', device, 'screenshot', outputPath];

    const result = await this.executor.execute('xcrun', args, {
      timeoutMs: this.timeoutMs,
    });

    if (result.exitCode !== 0) {
      throw new Error(`simctl screenshot failed: ${result.stderr}`);
    }

    this.logger.debug(`Screenshot saved to: ${outputPath}`);
    return outputPath;
  }

  async listDevices(): Promise<Simulator[]> {
    const result = await this.executor.execute(
      'xcrun',
      ['simctl', 'list', 'devices', '-j'],
      { timeoutMs: this.timeoutMs }
    );

    if (result.exitCode !== 0) {
      throw new Error(`simctl list devices failed: ${result.stderr}`);
    }

    try {
      const data = JSON.parse(result.stdout) as {
        devices?: Record<string, Array<{
          udid?: string;
          name?: string;
          state?: string;
          deviceTypeIdentifier?: string;
        }>>;
      };

      const devices: Simulator[] = [];

      for (const [runtime, deviceList] of Object.entries(data.devices ?? {})) {
        for (const device of deviceList) {
          if (device.udid && device.name) {
            devices.push({
              udid: device.udid,
              name: device.name,
              state: this.parseState(device.state),
              runtime: this.parseRuntime(runtime),
              deviceType: device.deviceTypeIdentifier,
            });
          }
        }
      }

      return devices;
    } catch (e) {
      this.logger.error('Failed to parse device list', { error: String(e) });
      return [];
    }
  }

  async getBootedDevice(): Promise<Simulator | null> {
    const devices = await this.listDevices();
    return devices.find((d) => d.state === 'Booted') ?? null;
  }

  async boot(deviceUdid: string): Promise<void> {
    const result = await this.executor.execute(
      'xcrun',
      ['simctl', 'boot', deviceUdid],
      { timeoutMs: 60000 } // Booting can take longer
    );

    if (result.exitCode !== 0) {
      // Check if already booted
      if (result.stderr.includes('already booted')) {
        this.logger.debug(`Device ${deviceUdid} is already booted`);
        return;
      }
      throw new Error(`simctl boot failed: ${result.stderr}`);
    }

    this.logger.info(`Booted device: ${deviceUdid}`);
  }

  async shutdown(deviceUdid?: string): Promise<void> {
    const device = this.getDevice(deviceUdid);
    const result = await this.executor.execute(
      'xcrun',
      ['simctl', 'shutdown', device],
      { timeoutMs: this.timeoutMs }
    );

    if (result.exitCode !== 0) {
      // Check if already shutdown
      if (result.stderr.includes('current state: Shutdown')) {
        this.logger.debug(`Device ${device} is already shutdown`);
        return;
      }
      throw new Error(`simctl shutdown failed: ${result.stderr}`);
    }

    this.logger.info(`Shutdown device: ${device}`);
  }

  async launchApp(
    bundleId: string,
    options: LaunchOptions = {},
    deviceUdid?: string
  ): Promise<void> {
    const device = this.getDevice(deviceUdid);

    // Terminate existing if requested
    if (options.terminateExisting !== false) {
      try {
        await this.terminateApp(bundleId, device);
      } catch {
        // Ignore errors - app might not be running
      }
    }

    const args = ['simctl', 'launch', device, bundleId];

    if (options.waitForDebugger) {
      args.push('--wait-for-debugger');
    }

    // Add launch arguments
    if (options.args?.length) {
      args.push(...options.args);
    }

    const result = await this.executor.execute('xcrun', args, {
      timeoutMs: this.timeoutMs,
      env: options.env,
    });

    if (result.exitCode !== 0) {
      throw new Error(`simctl launch failed: ${result.stderr}`);
    }

    this.logger.info(`Launched app: ${bundleId}`);
  }

  async terminateApp(bundleId: string, deviceUdid?: string): Promise<void> {
    const device = this.getDevice(deviceUdid);
    const result = await this.executor.execute(
      'xcrun',
      ['simctl', 'terminate', device, bundleId],
      { timeoutMs: this.timeoutMs }
    );

    if (result.exitCode !== 0) {
      throw new Error(`simctl terminate failed: ${result.stderr}`);
    }

    this.logger.debug(`Terminated app: ${bundleId}`);
  }

  async installApp(appPath: string, deviceUdid?: string): Promise<void> {
    const device = this.getDevice(deviceUdid);
    const result = await this.executor.execute(
      'xcrun',
      ['simctl', 'install', device, appPath],
      { timeoutMs: 120000 } // Install can take longer
    );

    if (result.exitCode !== 0) {
      throw new Error(`simctl install failed: ${result.stderr}`);
    }

    this.logger.info(`Installed app from: ${appPath}`);
  }

  async openUrl(url: string, deviceUdid?: string): Promise<void> {
    const device = this.getDevice(deviceUdid);
    const result = await this.executor.execute(
      'xcrun',
      ['simctl', 'openurl', device, url],
      { timeoutMs: this.timeoutMs }
    );

    if (result.exitCode !== 0) {
      throw new Error(`simctl openurl failed: ${result.stderr}`);
    }

    this.logger.debug(`Opened URL: ${url}`);
  }

  async setLocation(latitude: number, longitude: number, deviceUdid?: string): Promise<void> {
    const device = this.getDevice(deviceUdid);
    const result = await this.executor.execute(
      'xcrun',
      ['simctl', 'location', device, 'set', `${latitude},${longitude}`],
      { timeoutMs: this.timeoutMs }
    );

    if (result.exitCode !== 0) {
      throw new Error(`simctl location set failed: ${result.stderr}`);
    }

    this.logger.info(`Set location to: ${latitude}, ${longitude}`);
  }

  async clearLocation(deviceUdid?: string): Promise<void> {
    const device = this.getDevice(deviceUdid);
    const result = await this.executor.execute(
      'xcrun',
      ['simctl', 'location', device, 'clear'],
      { timeoutMs: this.timeoutMs }
    );

    if (result.exitCode !== 0) {
      throw new Error(`simctl location clear failed: ${result.stderr}`);
    }

    this.logger.info('Cleared simulated location');
  }

  async simulateRoute(
    waypoints: Waypoint[],
    options: RouteOptions = {},
    deviceUdid?: string
  ): Promise<void> {
    if (waypoints.length === 0) {
      throw new Error('simulateRoute requires at least one waypoint');
    }

    const intervalMs = options.intervalMs ?? 3000;
    const loop = options.loop ?? false;

    this.logger.info(`Simulating route with ${waypoints.length} waypoints, interval: ${intervalMs}ms`);

    const executeRoute = async () => {
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i]!;
        await this.setLocation(wp.latitude, wp.longitude, deviceUdid);

        // Wait between waypoints (except after the last one)
        if (i < waypoints.length - 1) {
          await this.wait(intervalMs);
        }
      }
    };

    if (loop) {
      // For loop mode, run once and log warning
      // (infinite loop would block, so we just run once)
      this.logger.warn('Loop mode: running route once (infinite loop not supported in sync mode)');
    }

    await executeRoute();
    this.logger.info('Route simulation completed');
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseState(state?: string): Simulator['state'] {
    switch (state) {
      case 'Booted':
        return 'Booted';
      case 'Shutdown':
        return 'Shutdown';
      case 'Creating':
        return 'Creating';
      default:
        return 'Unknown';
    }
  }

  private parseRuntime(runtime: string): string {
    // Convert "com.apple.CoreSimulator.SimRuntime.iOS-17-4" to "iOS 17.4"
    const match = runtime.match(/iOS-(\d+)-(\d+)/);
    if (match?.[1] && match[2]) {
      return `iOS ${match[1]}.${match[2]}`;
    }
    return runtime;
  }
}

export const simctlClient = new SimctlClient();
