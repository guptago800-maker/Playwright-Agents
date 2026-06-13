/**
 * Logger
 * ─────────────────────────────────────────────────────────────────
 * Lightweight structured logger for all agents.
 * Outputs to console with timestamp, level, and context prefix.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export class Logger {
  private readonly context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.DEBUG) this.log('debug', message, meta);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const levelTag = level.toUpperCase().padEnd(5);
    const prefix = `[${timestamp}] [${levelTag}] [${this.context}]`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`${prefix} ${message}${metaStr}`);
  }
}
