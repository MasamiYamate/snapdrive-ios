/**
 * Simple logger utility for SnapDrive MCP Server
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger implements ILogger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix: string = 'snapdrive', level: LogLevel = 'info') {
    this.prefix = prefix;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.prefix}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.error(this.formatMessage('debug', message, meta));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.error(this.formatMessage('info', message, meta));
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.error(this.formatMessage('warn', message, meta));
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, meta));
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

export const logger = new Logger();
