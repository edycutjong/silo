import { test, expect } from '@playwright/test';

test.describe('Silo Smoke Test', () => {
  test('should load the home page and have correct title and tabs', async ({ page }) => {
    await page.goto('/');

    // Check header title
    await expect(page.locator('span.font-display').first()).toHaveText('SILO');

    // Check that TEE badge exists
    await expect(page.getByText('TEE INSULATED')).toBeVisible();

    // Check that all three tab buttons exist
    const dropPortalTab = page.getByRole('button', { name: 'Secure Drop Portal' });
    const journalistTab = page.getByRole('button', { name: 'Journalist Console' });
    const telemetryTab = page.getByRole('button', { name: 'System Telemetry' });

    await expect(dropPortalTab).toBeVisible();
    await expect(journalistTab).toBeVisible();
    await expect(telemetryTab).toBeVisible();
  });

  test('should navigate between tabs successfully', async ({ page }) => {
    await page.goto('/');

    // Go to Journalist Console
    await page.getByRole('button', { name: 'Journalist Console' }).click();
    await expect(page.getByText('Incoming Drops')).toBeVisible();

    // Go to System Telemetry
    await page.getByRole('button', { name: 'System Telemetry' }).click();
    await expect(page.getByText('System Telemetry & Integrations')).toBeVisible();

    // Go back to Whistleblower Secure Drop
    await page.getByRole('button', { name: 'Secure Drop Portal' }).click();
    await expect(page.getByText('Whistleblower Secure Drop')).toBeVisible();
  });
});
