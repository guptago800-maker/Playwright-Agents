/**
 * BasePage
 * ─────────────────────────────────────────────────────────────────
 * Base class for all Page Objects.
 * Integrates HealerAgent for self-healing locators.
 * All page objects extend this.
 */

import { Page, Locator, expect } from '@playwright/test';
import { HealerAgent } from '../healers/HealerAgent';

export abstract class BasePage {
  protected readonly page: Page;
  protected readonly healer: HealerAgent;

  constructor(page: Page) {
    this.page = page;
    this.healer = new HealerAgent();
  }

  abstract get url(): string;

  async navigate(): Promise<void> {
    await this.page.goto(this.url);
  }

  /** Healer-aware locator — falls back to DOM scan if locator is broken */
  protected async getLocator(selector: string, alias?: string): Promise<Locator> {
    return this.healer.safeLocator(this.page, selector, alias);
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async assertUrl(expected: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(expected));
  }
}
