/**
 * tests/e2e/login.spec.ts
 * E2E tests for SauceDemo login using POM + fixtures.
 */

import { test, expect } from '../../src/fixtures/index';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });

  test('should login with valid credentials', async ({ loginPage }) => {
    await loginPage.login('standard_user', 'secret_sauce');
    await loginPage.assertLoggedIn();
  });

  test('should show error for invalid password', async ({ loginPage }) => {
    await loginPage.login('standard_user', 'wrong_password');
    await loginPage.assertLoginError('Username and password do not match');
  });

  test('should show error for locked out user', async ({ loginPage }) => {
    await loginPage.login('locked_out_user', 'secret_sauce');
    await loginPage.assertLoginError('Sorry, this user has been locked out');
  });

  test('should show error for empty credentials', async ({ loginPage }) => {
    await loginPage.login('', '');
    await loginPage.assertLoginError('Username is required');
  });
});
