/**
 * Command executor for running subprocess commands
 */

import { spawn } from 'node:child_process';
import type { CommandResult, ExecuteOptions } from '../interfaces/config.interface.js';
import { type ILogger, Logger } from '../utils/logger.js';

export interface ICommandExecutor {
  execute(
    command: string,
    args: string[],
    options?: ExecuteOptions
  ): Promise<CommandResult>;
}

export class CommandExecutor implements ICommandExecutor {
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger ?? new Logger('command-executor');
  }

  async execute(
    command: string,
    args: string[],
    options: ExecuteOptions = {}
  ): Promise<CommandResult> {
    const { timeoutMs = 30000, cwd, env } = options;

    const fullCommand = `${command} ${args.join(' ')}`;
    this.logger.debug(`Executing: ${fullCommand}`);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(command, args, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        shell: false,
      });

      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        this.logger.warn(`Command timed out after ${timeoutMs}ms: ${fullCommand}`);
      }, timeoutMs);

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        const exitCode = code ?? (timedOut ? -1 : 0);

        if (exitCode !== 0 && !timedOut) {
          this.logger.debug(`Command failed with exit code ${exitCode}: ${fullCommand}`, {
            stderr: stderr.slice(0, 200),
          });
        }

        resolve({
          stdout,
          stderr,
          exitCode,
          timedOut,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        this.logger.error(`Command error: ${fullCommand}`, { error: err.message });
        resolve({
          stdout,
          stderr: `${stderr}\nError: ${err.message}`,
          exitCode: -1,
          timedOut: false,
        });
      });
    });
  }
}

export const commandExecutor = new CommandExecutor();
