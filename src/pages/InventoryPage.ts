/**
 * InventoryPage — SauceDemo
 */

import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class InventoryPage extends BasePage {
  get url(): string {
    return '/inventory.html';
  }

  private get inventoryItems() {
    return this.page.locator('[data-testid="inventory-item"]');
  }

  private get cartBadge() {
    return this.page.locator('[data-testid="shopping-cart-badge"]');
  }

  private get cartLink() {
    return this.page.locator('[data-testid="shopping-cart-link"]');
  }

  private get sortDropdown() {
    return this.page.locator('[data-testid="product-sort-container"]');
  }

  async addItemToCart(itemName: string): Promise<void> {
    const item = this.page.locator('[data-testid="inventory-item"]').filter({ hasText: itemName });
    await item.getByRole('button', { name: /add to cart/i }).click();
  }

  async assertCartCount(count: number): Promise<void> {
    await expect(this.cartBadge).toHaveText(String(count));
  }

  async assertItemCount(count: number): Promise<void> {
    await expect(this.inventoryItems).toHaveCount(count);
  }

  async sortBy(option: 'az' | 'za' | 'lohi' | 'hilo'): Promise<void> {
    await this.sortDropdown.selectOption(option);
  }

  async goToCart(): Promise<void> {
    await this.cartLink.click();
  }

  async getItemNames(): Promise<string[]> {
    return this.page.locator('[data-testid="inventory-item-name"]').allInnerTexts();
  }
}
