/**
 * idb (iOS Development Bridge) client wrapper
 * Wraps Facebook's idb CLI for UI automation
 */

import type { AccessibilityElement, UITree, Frame } from '../interfaces/element.interface.js';
import type { DeviceButton } from '../interfaces/config.interface.js';
import { type ICommandExecutor, CommandExecutor } from './command-executor.js';
import { type ILogger, Logger } from '../utils/logger.js';

export interface TapOptions {
  duration?: number;
  deviceUdid?: string;
}

export interface SwipeOptions {
  delta?: number;
  duration?: number;
  deviceUdid?: string;
}

export interface IDBClientOptions {
  deviceUdid?: string;
  timeoutMs?: number;
}

export interface IIDBClient {
  tap(x: number, y: number, options?: TapOptions): Promise<void>;
  swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    options?: SwipeOptions
  ): Promise<void>;
  typeText(text: string, deviceUdid?: string): Promise<void>;
  describeAll(deviceUdid?: string): Promise<UITree>;
  describePoint(x: number, y: number, deviceUdid?: string): Promise<AccessibilityElement | null>;
  pressButton(button: DeviceButton, duration?: number, deviceUdid?: string): Promise<void>;
  keyEvent(keyCode: number, duration?: number, deviceUdid?: string): Promise<void>;
}

export class IDBClient implements IIDBClient {
  private executor: ICommandExecutor;
  private logger: ILogger;
  private defaultUdid?: string;
  private timeoutMs: number;
  private connectedUdids: Set<string> = new Set();

  constructor(options: IDBClientOptions = {}, executor?: ICommandExecutor, logger?: ILogger) {
    this.executor = executor ?? new CommandExecutor();
    this.logger = logger ?? new Logger('idb-client');
    this.defaultUdid = options.deviceUdid;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  /**
   * Ensure idb is connected to the target device
   */
  private async ensureConnected(deviceUdid?: string): Promise<string> {
    // Get target UDID
    let udid = deviceUdid ?? this.defaultUdid;

    if (!udid) {
      // Try to find booted device
      const result = await this.executor.execute(
        'xcrun',
        ['simctl', 'list', 'devices', 'booted', '-j'],
        { timeoutMs: 10000 }
      );

      if (result.exitCode === 0) {
        try {
          const data = JSON.parse(result.stdout) as { devices?: Record<string, Array<{ udid?: string; state?: string }>> };
          for (const deviceList of Object.values(data.devices ?? {})) {
            for (const device of deviceList) {
              if (device.state === 'Booted' && device.udid) {
                udid = device.udid;
                break;
              }
            }
            if (udid) break;
          }
        } catch {
          // ignore parse error
        }
      }
    }

    if (!udid) {
      throw new Error('No simulator UDID specified and no booted simulator found');
    }

    // Connect if not already connected
    if (!this.connectedUdids.has(udid)) {
      this.logger.debug(`Connecting idb to device: ${udid}`);
      const connectResult = await this.executor.execute(
        'idb',
        ['connect', udid],
        { timeoutMs: 10000 }
      );

      if (connectResult.exitCode !== 0) {
        throw new Error(`Failed to connect idb to device ${udid}: ${connectResult.stderr}`);
      }

      this.connectedUdids.add(udid);
      this.logger.info(`Connected idb to device: ${udid}`);
    }

    return udid;
  }

  private buildArgs(baseArgs: string[]): string[] {
    // No --udid flag needed after idb connect
    return baseArgs;
  }

  async tap(x: number, y: number, options: TapOptions = {}): Promise<void> {
    await this.ensureConnected(options.deviceUdid);

    const args = this.buildArgs(
      ['ui', 'tap', String(Math.round(x)), String(Math.round(y))]
    );

    if (options.duration && options.duration > 0) {
      args.push('--duration', String(options.duration));
    }

    const result = await this.executor.execute('idb', args, {
      timeoutMs: this.timeoutMs,
    });

    if (result.exitCode !== 0) {
      throw new Error(`idb tap failed: ${result.stderr}`);
    }

    this.logger.debug(`Tapped at (${x}, ${y})`);
  }

  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    options: SwipeOptions = {}
  ): Promise<void> {
    await this.ensureConnected(options.deviceUdid);

    const args = this.buildArgs([
      'ui',
      'swipe',
      String(Math.round(startX)),
      String(Math.round(startY)),
      String(Math.round(endX)),
      String(Math.round(endY)),
    ]);

    if (options.delta) {
      args.push('--delta', String(options.delta));
    }

    if (options.duration) {
      args.push('--duration', String(options.duration));
    }

    const result = await this.executor.execute('idb', args, {
      timeoutMs: this.timeoutMs,
    });

    if (result.exitCode !== 0) {
      throw new Error(`idb swipe failed: ${result.stderr}`);
    }

    this.logger.debug(`Swiped from (${startX}, ${startY}) to (${endX}, ${endY})`);
  }

  async typeText(text: string, deviceUdid?: string): Promise<void> {
    await this.ensureConnected(deviceUdid);

    const args = this.buildArgs(['ui', 'text', text]);

    const result = await this.executor.execute('idb', args, {
      timeoutMs: this.timeoutMs,
    });

    if (result.exitCode !== 0) {
      throw new Error(`idb text failed: ${result.stderr}`);
    }

    this.logger.debug(`Typed text: "${text.slice(0, 20)}${text.length > 20 ? '...' : ''}"`);
  }

  async describeAll(deviceUdid?: string): Promise<UITree> {
    await this.ensureConnected(deviceUdid);

    const args = this.buildArgs(['ui', 'describe-all']);

    const result = await this.executor.execute('idb', args, {
      timeoutMs: this.timeoutMs,
    });

    if (result.exitCode !== 0) {
      throw new Error(`idb describe-all failed: ${result.stderr}`);
    }

    const elements = this.parseDescribeOutput(result.stdout);

    return {
      elements,
      timestamp: new Date().toISOString(),
    };
  }

  async describePoint(
    x: number,
    y: number,
    deviceUdid?: string
  ): Promise<AccessibilityElement | null> {
    await this.ensureConnected(deviceUdid);

    const args = this.buildArgs([
      'ui',
      'describe-point',
      String(Math.round(x)),
      String(Math.round(y)),
    ]);

    const result = await this.executor.execute('idb', args, {
      timeoutMs: this.timeoutMs,
    });

    if (result.exitCode !== 0) {
      return null;
    }

    try {
      const parsed = JSON.parse(result.stdout);
      return this.normalizeElement(parsed);
    } catch {
      return null;
    }
  }

  async pressButton(
    button: DeviceButton,
    duration?: number,
    deviceUdid?: string
  ): Promise<void> {
    await this.ensureConnected(deviceUdid);

    const buttonMap: Record<DeviceButton, string> = {
      HOME: 'HOME',
      LOCK: 'LOCK',
      SIDE_BUTTON: 'SIDE_BUTTON',
      SIRI: 'SIRI',
      APPLE_PAY: 'APPLE_PAY',
    };

    const args = this.buildArgs(['ui', 'button', buttonMap[button]]);

    if (duration) {
      args.push('--duration', String(duration));
    }

    const result = await this.executor.execute('idb', args, {
      timeoutMs: this.timeoutMs,
    });

    if (result.exitCode !== 0) {
      throw new Error(`idb button press failed: ${result.stderr}`);
    }

    this.logger.debug(`Pressed button: ${button}`);
  }

  async keyEvent(keyCode: number, duration?: number, deviceUdid?: string): Promise<void> {
    await this.ensureConnected(deviceUdid);

    const args = this.buildArgs(['ui', 'key', String(keyCode)]);

    if (duration) {
      args.push('--duration', String(duration));
    }

    const result = await this.executor.execute('idb', args, {
      timeoutMs: this.timeoutMs,
    });

    if (result.exitCode !== 0) {
      throw new Error(`idb key event failed: ${result.stderr}`);
    }

    this.logger.debug(`Sent key event: ${keyCode}`);
  }

  /**
   * Parse idb describe-all output into AccessibilityElement array
   * Handles both JSON array and newline-delimited JSON formats
   */
  private parseDescribeOutput(output: string): AccessibilityElement[] {
    const trimmed = output.trim();
    if (!trimmed) {
      return [];
    }

    try {
      // Try parsing as JSON array first
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((el) => this.normalizeElement(el)).filter(Boolean) as AccessibilityElement[];
      }
      // Single object
      const normalized = this.normalizeElement(parsed);
      return normalized ? [normalized] : [];
    } catch {
      // Try parsing as newline-delimited JSON
      const elements: AccessibilityElement[] = [];
      for (const line of trimmed.split('\n')) {
        const lineTrimmed = line.trim();
        if (!lineTrimmed) continue;
        try {
          const parsed = JSON.parse(lineTrimmed);
          const normalized = this.normalizeElement(parsed);
          if (normalized) {
            elements.push(normalized);
          }
        } catch {
          this.logger.debug(`Failed to parse line: ${lineTrimmed.slice(0, 50)}`);
        }
      }
      return elements;
    }
  }

  /**
   * Normalize element from idb output to our interface
   * Handles different field naming conventions defensively
   */
  private normalizeElement(raw: Record<string, unknown>): AccessibilityElement | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    // Parse frame - handle multiple formats
    const frame = this.parseFrame(raw);
    if (!frame || !this.isValidFrame(frame)) {
      return null;
    }

    return {
      label: this.getString(raw, ['AXLabel', 'label', 'title', 'name']),
      value: this.getString(raw, ['AXValue', 'value']),
      type: this.getString(raw, ['type', 'AXType', 'element_type']),
      role: this.getString(raw, ['role', 'AXRole']),
      roleDescription: this.getString(raw, ['role_description', 'AXRoleDescription']),
      identifier: this.getString(raw, ['AXUniqueId', 'identifier', 'accessibilityIdentifier']),
      frame,
      enabled: this.getBoolean(raw, ['enabled', 'AXEnabled'], true),
      traits: this.getStringArray(raw, ['traits', 'AXTraits']),
    };
  }

  private getString(obj: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const val = obj[key];
      if (typeof val === 'string' && val.length > 0) {
        return val;
      }
    }
    return undefined;
  }

  private getBoolean(obj: Record<string, unknown>, keys: string[], defaultVal: boolean): boolean {
    for (const key of keys) {
      const val = obj[key];
      if (typeof val === 'boolean') {
        return val;
      }
    }
    return defaultVal;
  }

  private getStringArray(obj: Record<string, unknown>, keys: string[]): string[] | undefined {
    for (const key of keys) {
      const val = obj[key];
      if (Array.isArray(val)) {
        return val.filter((v): v is string => typeof v === 'string');
      }
    }
    return undefined;
  }

  private parseFrame(obj: Record<string, unknown>): Frame | null {
    // Format 1: {frame: {x, y, width, height}}
    const frameObj = obj['frame'];
    if (frameObj && typeof frameObj === 'object') {
      const f = frameObj as Record<string, unknown>;
      if (
        typeof f['x'] === 'number' &&
        typeof f['y'] === 'number' &&
        typeof f['width'] === 'number' &&
        typeof f['height'] === 'number'
      ) {
        return {
          x: f['x'],
          y: f['y'],
          width: f['width'],
          height: f['height'],
        };
      }
    }

    // Format 2: AXFrame string "{{x, y}, {width, height}}"
    const axFrame = obj['AXFrame'];
    if (typeof axFrame === 'string') {
      return this.parseAXFrameString(axFrame);
    }

    return null;
  }

  private parseAXFrameString(frameStr: string): Frame | null {
    // Format: "{{123.0, 456.0}, {100.0, 50.0}}"
    try {
      const cleaned = frameStr.replace(/\s/g, '').replace(/[{}]/g, '');
      const nums = cleaned.split(',').map(Number);
      if (nums.length === 4 && nums.every((n) => !isNaN(n))) {
        return {
          x: nums[0]!,
          y: nums[1]!,
          width: nums[2]!,
          height: nums[3]!,
        };
      }
    } catch {
      // Fall through to return null
    }
    return null;
  }

  private isValidFrame(frame: Frame): boolean {
    return frame.width > 0 && frame.height > 0 && frame.x >= 0 && frame.y >= 0;
  }
}

export const idbClient = new IDBClient();
