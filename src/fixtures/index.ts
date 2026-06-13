/**
 * fixtures/index.ts
 * ─────────────────────────────────────────────────────────────────
 * Central fixture registry.
 * Extends Playwright's base test with:
 * - Page Objects (LoginPage, InventoryPage)
 * - HealerAgent
 * - RetryAgent
 * - JiraAgent
 *
 * Usage in tests:
 *   import { test, expect } from '@fixtures/index';
 *   test('my test', async ({ loginPage, inventoryPage }) => { ... });
 */

import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';
import { HealerAgent } from '../healers/HealerAgent';
import { RetryAgent } from '../agents/RetryAgent';
import { JiraAgent } from '../agents/JiraAgent';

type AppFixtures = {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  healer: HealerAgent;
  retryAgent: RetryAgent;
  jiraAgent: JiraAgent;
  authenticatedPage: void;
};

export const test = base.extend<AppFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page));
  },

  healer: async ({}, use) => {
    await use(new HealerAgent());
  },

  retryAgent: async ({}, use) => {
    await use(new RetryAgent());
  },

  jiraAgent: async ({}, use) => {
    await use(new JiraAgent());
  },

  /** Pre-authenticated fixture — use for tests that need to skip login */
  authenticatedPage: async ({ page, loginPage }, use) => {
    await loginPage.navigate();
    await loginPage.login(
      process.env.STANDARD_USER || 'standard_user',
      process.env.STANDARD_PASS || 'secret_sauce'
    );
    await loginPage.assertLoggedIn();
    await use();
  },
});

export { expect };
