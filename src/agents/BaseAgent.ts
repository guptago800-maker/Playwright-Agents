/**
 * BaseAgent
 * ─────────────────────────────────────────────────────────────────
 * Abstract foundation every agent extends.
 * Enforces: init → execute → teardown lifecycle.
 * Provides shared logger, config access, and error boundary.
 */

import { Logger } from '../utils/Logger';

export interface AgentConfig {
  name: string;
  enabled: boolean;
  [key: string]: unknown;
}

export interface AgentResult<T = unknown> {
  success: boolean;
  agentName: string;
  data?: T;
  error?: string;
  timestamp: string;
}

export abstract class BaseAgent<TConfig extends AgentConfig = AgentConfig, TResult = unknown> {
  protected readonly logger: Logger;
  protected readonly config: TConfig;

  constructor(config: TConfig) {
    this.config = config;
    this.logger = new Logger(config.name);
  }

  /** Called once before execute — setup connections, validate config */
  protected abstract init(): Promise<void>;

  /** Core agent logic */
  protected abstract execute(...args: unknown[]): Promise<TResult>;

  /** Cleanup after execute — close connections, flush logs */
  protected async teardown(): Promise<void> {}

  /** Public entry point — wraps lifecycle with error boundary */
  async run(...args: unknown[]): Promise<AgentResult<TResult>> {
    if (!this.config.enabled) {
      this.logger.warn(`Agent "${this.config.name}" is disabled. Skipping.`);
      return this.buildResult(false, undefined, 'Agent disabled');
    }

    try {
      await this.init();
      const data = await this.execute(...args);
      return this.buildResult(true, data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Agent "${this.config.name}" failed: ${message}`);
      return this.buildResult(false, undefined, message);
    } finally {
      await this.teardown();
    }
  }

  private buildResult(success: boolean, data?: TResult, error?: string): AgentResult<TResult> {
    return {
      success,
      agentName: this.config.name,
      data,
      error,
      timestamp: new Date().toISOString(),
    };
  }
}
