import { test, expect } from '@playwright/test';

test.describe('Display Path Rules E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the app
    await page.goto('/');
    
    // Open Main Menu
    await page.getByLabel('Main Menu').click();
    
    // Click Visual Rules Editor
    await page.getByText('Visual Rules Editor').click();
    
    // Handle Login
    const loginTitle = page.getByText('Display Rules Manager Access');
    try {
      await expect(loginTitle).toBeVisible({ timeout: 5000 });
      await page.getByLabel('Username').fill('admin');
      await page.getByLabel('Password').fill('admin');
      await page.getByRole('button', { name: 'Sign In' }).click();
    } catch (e) {
      console.log('Login not required or already authenticated.');
    }

    // Wait for the manager to load
    await expect(page.getByText('Display Rules Manager')).toBeVisible();
  });

  test('should create and cleanup PowerTransformer and EnergyConsumer rules', async ({ page }) => {
    // Create a new test profile if needed to avoid affecting defaults
    const profileName = `E2E Test Profile ${Date.now()}`;
    
    page.on('dialog', async dialog => {
      if (dialog.message().includes('New profile name')) {
        await dialog.accept(profileName);
      } else {
        await dialog.dismiss();
      }
    });

    // Click + button for new profile
    await page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).last().click();
    await page.getByText('New Profile').click();
    
    // Verify profile created
    await expect(page.getByRole('combobox', { name: 'Display Profile' })).toHaveValue(profileName);

    // 1. Create PowerTransformer Rule
    await page.getByRole('button', { name: 'Add Rule' }).click();
    await page.getByLabel('Rule Name').fill('E2E PowerTransformer');
    
    // Start path
    await page.getByRole('button', { name: 'Start path' }).click();
    await page.getByPlaceholder('Select starting class…').fill('PowerTransformer');
    await page.getByRole('option', { name: 'PowerTransformer', exact: true }).click();
    
    // Set geometry filter to Node
    await page.getByLabel('Node (1 point)').click();
    
    // Save
    await page.getByRole('button', { name: 'Save Rule' }).click();
    await expect(page.getByText('E2E PowerTransformer')).toBeVisible();

    // 2. Create EnergyConsumer Rule
    await page.getByRole('button', { name: 'Add Rule' }).click();
    await page.getByLabel('Rule Name').fill('E2E EnergyConsumer');
    
    // Start path
    await page.getByRole('button', { name: 'Start path' }).click();
    await page.getByPlaceholder('Select starting class…').fill('EnergyConsumer');
    await page.getByRole('option', { name: 'EnergyConsumer', exact: true }).click();
    
    // Save
    await page.getByRole('button', { name: 'Save Rule' }).click();
    await expect(page.getByText('E2E EnergyConsumer')).toBeVisible();

    // CLEANUP
    // Delete EnergyConsumer
    await page.locator('div').filter({ hasText: /^E2E EnergyConsumer$/ }).locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).click();
    await expect(page.getByText('E2E EnergyConsumer')).not.toBeVisible();

    // Delete PowerTransformer
    await page.locator('div').filter({ hasText: /^E2E PowerTransformer$/ }).locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).click();
    await expect(page.getByText('E2E PowerTransformer')).not.toBeVisible();

    // Delete the test profile
    await page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).first().click();
    // Assuming a confirmation dialog appears for profile deletion
    page.on('dialog', async dialog => {
        if (dialog.message().includes('delete this profile')) {
            await dialog.accept();
        }
    });
  });
});
