/**
 * tests/e2e/inventory.spec.ts
 * E2E tests for SauceDemo inventory using authenticated fixture.
 */

import { test, expect } from '../../src/fixtures/index';

test.describe('Inventory', () => {
  // Uses authenticatedPage fixture — login handled automatically
  test.beforeEach(async ({ authenticatedPage: _ }) => {});

  test('should display 6 products', async ({ inventoryPage }) => {
    await inventoryPage.assertItemCount(6);
  });

  test('should add item to cart', async ({ inventoryPage }) => {
    await inventoryPage.addItemToCart('Sauce Labs Backpack');
    await inventoryPage.assertCartCount(1);
  });

  test('should add multiple items to cart', async ({ inventoryPage }) => {
    await inventoryPage.addItemToCart('Sauce Labs Backpack');
    await inventoryPage.addItemToCart('Sauce Labs Bike Light');
    await inventoryPage.assertCartCount(2);
  });

  test('should sort products A to Z', async ({ inventoryPage }) => {
    await inventoryPage.sortBy('az');
    const names = await inventoryPage.getItemNames();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});
