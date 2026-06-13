/**
 * LoginPage — SauceDemo
 * Page Object with healer-registered locators.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  get url(): string {
    return '/';
  }

  // Declared once here — resolved through healer in waitForPageLoad()
  private usernameInput!: Locator;
  private passwordInput!: Locator;
  private loginButton!: Locator;
  private errorMessage!: Locator;

  constructor(page: Page) {
    super(page);

    // Register primary selectors + hints so healer can recover them if they break
    this.healer.register('usernameInput', '[data-test="username"]', {
      role: 'textbox',
      text: 'Username',
      testId: 'username',
    });
    this.healer.register('passwordInput', '[data-test="password"]', {
      role: 'textbox',
      text: 'Password',
      testId: 'password',
    });
    this.healer.register('loginButton', '[data-test="login-button"]', {
      role: 'button',
      text: 'Login',
      testId: 'login-button',
    });
  }

  // navigate() resolves all locators through the healer once after page load.
  // Every method below just uses the already-resolved locators — no healer calls scattered around.
  override async navigate(): Promise<void> {
    await super.navigate();
    await this.waitForPageLoad();
  }

  override async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    this.usernameInput = await this.getLocator('[data-test="user--465name"]', 'usernameInput');
    this.passwordInput = await this.getLocator('[data-test="password"]', 'passwordInput');
    this.loginButton   = await this.getLocator('[data-test="login-button"]', 'loginButton');
    this.errorMessage  = this.page.locator('[data-test="error"]');
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async assertLoginError(expectedMessage: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(expectedMessage);
  }

  async assertLoggedIn(): Promise<void> {
    await expect(this.page).toHaveURL(/inventory/);
  }
}
