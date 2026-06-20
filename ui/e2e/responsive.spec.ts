import { test, expect } from '@playwright/test';

test.describe('Silo Responsive Layout', () => {
  test('desktop layout (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    
    // Header should be fully visible, and sidebar logs should be present on the right
    await expect(page.locator('span.font-display').first()).toBeVisible();
    await expect(page.getByText('Live Agent Console Feed')).toBeVisible();
  });

  test('mobile layout (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Header title should still render
    await expect(page.locator('span.font-display').first()).toBeVisible();

    // Tab buttons should fit or wrap nicely
    await expect(page.getByRole('button', { name: 'Secure Drop Portal' })).toBeVisible();
  });
});
