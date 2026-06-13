/**
 * RetryAgent
 * ─────────────────────────────────────────────────────────────────
 * Intelligent retry wrapper with exponential backoff.
 * Use for flaky actions (network calls, animations, dynamic content).
 *
 * Unlike Playwright's built-in retry (which reruns the whole test),
 * RetryAgent retries individual actions within a test.
 *
 * @example
 * const retryAgent = new RetryAgent();
 * const result = await retryAgent.retry(() => page.click('[data-testid="submit"]'), {
 *   maxAttempts: 3,
 *   backoff: 'exponential',
 * });
 */

import { Logger } from '../utils/Logger';

export type BackoffStrategy = 'linear' | 'exponential' | 'fixed';

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: BackoffStrategy;
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  attempts: number;
  lastError?: Error;
}

export class RetryAgent {
  private readonly logger: Logger;
  private readonly defaults: Required<Omit<RetryOptions, 'retryOn' | 'onRetry'>>;

  constructor() {
    this.logger = new Logger('RetryAgent');
    this.defaults = {
      maxAttempts: 3,
      delayMs: 1000,
      backoff: 'exponential',
    };
  }

  async retry<T>(
    action: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<RetryResult<T>> {
    const opts = { ...this.defaults, ...options };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        const value = await action();
        if (attempt > 1) {
          this.logger.info(`Action succeeded on attempt ${attempt}`);
        }
        return { success: true, value, attempts: attempt };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Check if this error should be retried
        if (opts.retryOn && !opts.retryOn(lastError)) {
          this.logger.warn(`Non-retryable error: ${lastError.message}`);
          return { success: false, attempts: attempt, lastError };
        }

        if (attempt < opts.maxAttempts) {
          const delay = this.calculateDelay(attempt, opts.delayMs, opts.backoff);
          this.logger.warn(`Attempt ${attempt}/${opts.maxAttempts} failed. Retrying in ${delay}ms...`);

          if (opts.onRetry) opts.onRetry(attempt, lastError);
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(`All ${opts.maxAttempts} attempts failed. Last error: ${lastError?.message}`);
    return { success: false, attempts: opts.maxAttempts, lastError };
  }

  /** Retry specifically for Playwright timeout/network errors */
  async retryPlaywrightAction<T>(action: () => Promise<T>): Promise<T> {
    const result = await this.retry(action, {
      maxAttempts: 3,
      delayMs: 2000,
      backoff: 'exponential',
      retryOn: (err) =>
        err.message.includes('TimeoutError') ||
        err.message.includes('Network') ||
        err.message.includes('net::'),
    });

    if (!result.success || result.value === undefined) {
      throw result.lastError ?? new Error('Action failed after all retries');
    }

    return result.value;
  }

  private calculateDelay(attempt: number, baseDelay: number, strategy: BackoffStrategy): number {
    switch (strategy) {
      case 'exponential':
        return baseDelay * Math.pow(2, attempt - 1);
      case 'linear':
        return baseDelay * attempt;
      case 'fixed':
      default:
        return baseDelay;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
