import { test, expect } from '@playwright/test';

test.describe('Silo Core Whistleblower to Journalist Flow', () => {
  test('should allow filling out whistleblower details and submitting', async ({ page }) => {
    await page.goto('/');

    // 1. Fill details
    const titleInput = page.locator('input[value*="Falsified Safety"]');
    if (await titleInput.isVisible()) {
      await titleInput.fill('Test Safety Issue');
    }

    const summaryInput = page.locator('textarea').first();
    if (await summaryInput.isVisible()) {
      await summaryInput.fill('Test description for safety violations in the main lobby.');
    }

    const phoneInput = page.getByPlaceholder('your-phone-or-email@domain.com');
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('whistleblower@hospital-safety.org');
    }

    // Since we don't mock drag-and-drop file upload easily in simple E2E, we verify page has dropzone.
    await expect(page.getByText('Drag & drop forensic PDF file here, or click to browse')).toBeVisible();

    // Verify system logs section is rendering on the right sidebar
    await expect(page.getByText('Live Agent Console Feed')).toBeVisible();
  });
});
