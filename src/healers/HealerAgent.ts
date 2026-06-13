/**
 * HealerAgent
 * ─────────────────────────────────────────────────────────────────
 * Self-healing locator system for Playwright.
 *
 * HOW IT WORKS:
 * 1. Before a test run, it snapshots all known locators with metadata
 *    (role, text, test-id, CSS, position) into healer-snapshots/.
 * 2. On locator failure, HealerAgent scans the live DOM for the best
 *    matching element using a weighted scoring strategy:
 *    - Exact test-id match  → 100 pts
 *    - Role + name match    → 80 pts
 *    - Partial text match   → 60 pts
 *    - CSS class similarity → 40 pts
 * 3. Returns the healed locator string and logs a warning.
 * 4. Persists the suggestion to healer-snapshots/suggestions.json
 *    so engineers can review and update their selectors.
 *
 * SETUP: Set HEALER_ENABLED=true in .env
 */

import { Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';

export interface LocatorSnapshot {
  alias: string;
  original: string;
  testId?: string;
  role?: string;
  text?: string;
  cssClass?: string;
  lastSeen: string;
}

export interface HealResult {
  healed: boolean;
  original: string;
  suggestion?: string;
  score?: number;
  strategy?: string;
  calledFrom?: string;
}

export class HealerAgent {
  private readonly logger: Logger;
  private readonly snapshotDir: string;
  private readonly snapshots: Map<string, LocatorSnapshot> = new Map();
  private readonly suggestions: HealResult[] = [];
  private readonly enabled: boolean;

  constructor() {
    this.logger = new Logger('HealerAgent');
    this.enabled = process.env.HEALER_ENABLED === 'true';
    this.snapshotDir = process.env.HEALER_SNAPSHOT_DIR || 'reports/healer-snapshots';
    this.ensureSnapshotDir();
    this.loadSnapshots();
  }

  /**
   * Register a known locator alias so the healer can track it.
   * Call this in your Page Object constructors.
   *
   * @example
   * healer.register('loginButton', '[data-testid="login-btn"]', { role: 'button', text: 'Login' });
   */
  register(alias: string, locatorString: string, meta?: Partial<LocatorSnapshot>): void {
    this.snapshots.set(alias, {
      alias,
      original: locatorString,
      lastSeen: new Date().toISOString(),
      ...meta,
    });
    this.persistSnapshots();
  }

  /**
   * Attempt to heal a broken locator.
   * Scans the live DOM and returns the best match.
   *
   * @example
   * const result = await healer.heal(page, '[data-testid="submit"]', { text: 'Submit' });
   * if (result.healed) await page.locator(result.suggestion!).click();
   */
  async heal(
    page: Page,
    brokenLocator: string,
    hints?: Partial<LocatorSnapshot>,
    calledFrom?: string
  ): Promise<HealResult> {
    if (!this.enabled) {
      return { healed: false, original: brokenLocator };
    }

    this.logger.warn(`Attempting to heal broken locator: "${brokenLocator}"`);

    const candidates = await this.getCandidates(page, hints);
    const best = this.scoreCandidates(candidates, brokenLocator, hints);

    if (!best) {
      this.logger.error(`HealerAgent: No suitable replacement found for "${brokenLocator}"`);
      return { healed: false, original: brokenLocator, calledFrom };
    }

    const result: HealResult = {
      healed: true,
      original: brokenLocator,
      suggestion: best.locator,
      score: best.score,
      strategy: best.strategy,
      calledFrom,
    };

    this.logger.info(
      `Healed "${brokenLocator}" → "${best.locator}" (score: ${best.score}, strategy: ${best.strategy}) — fix at: ${calledFrom ?? 'unknown'}`
    );
    this.suggestions.push(result);
    this.persistSuggestions();

    return result;
  }

  /**
   * Safe locator: tries the primary, falls back to healed locator if not visible.
   * Captures the call site so suggestions.json shows exactly which file/line to fix.
   */
  async safeLocator(page: Page, primary: string, alias?: string): Promise<Locator> {
    const calledFrom = this.parseCallerFromStack(new Error().stack);

    const locator = page.locator(primary);
    const isVisible = await locator.isVisible().catch(() => false);

    if (isVisible) return locator;

    const snapshot = alias ? this.snapshots.get(alias) : undefined;
    const result = await this.heal(page, primary, snapshot, calledFrom);

    if (result.healed && result.suggestion) {
      return page.locator(result.suggestion);
    }

    // Return original — let Playwright throw a meaningful error
    return locator;
  }

  private parseCallerFromStack(stack: string | undefined): string | undefined {
    if (!stack) return undefined;

    const skipPatterns = ['HealerAgent.ts', 'BasePage.ts', 'node:', 'node_modules'];
    const projectRoot = process.cwd();

    for (const line of stack.split('\n')) {
      if (skipPatterns.some((p) => line.includes(p))) continue;

      // Match "at Something (C:\path\file.ts:50:10)" or "at C:\path\file.ts:50:10"
      const match = line.match(/\((.+\.ts):(\d+):\d+\)/) ?? line.match(/at (.+\.ts):(\d+):\d+/);
      if (!match) continue;

      const [, filePath, lineNumber] = match;
      const relative = path.relative(projectRoot, filePath).replace(/\\/g, '/');
      return `${relative}:${lineNumber}`;
    }

    return undefined;
  }

  private async getCandidates(
    page: Page,
    hints?: Partial<LocatorSnapshot>
  ): Promise<Array<{ locator: string; text: string; testId: string; role: string; cssClass: string }>> {
    return page.evaluate((hintsData) => {
      const elements = document.querySelectorAll('button, input, a, [role], [data-testid], [data-test]');
      return Array.from(elements).slice(0, 100).map((el) => {
        const dataTestId = el.getAttribute('data-testid');
        const dataTest   = el.getAttribute('data-test');
        const locator = dataTestId
          ? `[data-testid="${dataTestId}"]`
          : dataTest
            ? `[data-test="${dataTest}"]`
            : el.tagName.toLowerCase();
        const text =
          el.textContent?.trim() ||
          (el as HTMLInputElement).placeholder ||
          (el as HTMLInputElement).value ||
          '';
        return {
          locator,
          text,
          testId: dataTestId ?? dataTest ?? '',
          role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
          cssClass: el.className ?? '',
        };
      });
    }, hints);
  }

  private scoreCandidates(
    candidates: Array<{ locator: string; text: string; testId: string; role: string; cssClass: string }>,
    original: string,
    hints?: Partial<LocatorSnapshot>
  ): { locator: string; score: number; strategy: string } | null {
    let best: { locator: string; score: number; strategy: string } | null = null;

    for (const candidate of candidates) {
      let score = 0;
      let strategy = '';

      // Exact test-id match
      if (hints?.testId && candidate.testId === hints.testId) {
        score += 100; strategy = 'exact-testid';
      }
      // Partial test-id match
      if (hints?.testId && candidate.testId.includes(hints.testId)) {
        score += 70; strategy = 'partial-testid';
      }
      // Role match
      if (hints?.role && candidate.role === hints.role) {
        score += 50; strategy = 'role';
      }
      // Exact text match
      if (hints?.text && candidate.text === hints.text) {
        score += 80; strategy = 'exact-text';
      }
      // Partial text match
      if (hints?.text && candidate.text.toLowerCase().includes(hints.text.toLowerCase())) {
        score += 60; strategy = 'partial-text';
      }
      // CSS class similarity
      if (hints?.cssClass && candidate.cssClass.includes(hints.cssClass)) {
        score += 40; strategy = 'css-class';
      }
      // Locator string similarity
      if (candidate.locator.includes(original.replace(/[[\]"]/g, ''))) {
        score += 30; strategy = 'locator-similarity';
      }

      if (score > (best?.score ?? 0)) {
        best = { locator: candidate.locator, score, strategy };
      }
    }

    return best && best.score >= 40 ? best : null;
  }

  private ensureSnapshotDir(): void {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  private loadSnapshots(): void {
    const file = path.join(this.snapshotDir, 'locator-registry.json');
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as LocatorSnapshot[];
      data.forEach((s) => this.snapshots.set(s.alias, s));
    }
  }

  private persistSnapshots(): void {
    const file = path.join(this.snapshotDir, 'locator-registry.json');
    fs.writeFileSync(file, JSON.stringify(Array.from(this.snapshots.values()), null, 2));
  }

  private persistSuggestions(): void {
    const file = path.join(this.snapshotDir, 'suggestions.json');
    fs.writeFileSync(file, JSON.stringify(this.suggestions, null, 2));
  }

  /** Returns all heal suggestions for review in CI logs */
  getSuggestions(): HealResult[] {
    return this.suggestions;
  }
}
