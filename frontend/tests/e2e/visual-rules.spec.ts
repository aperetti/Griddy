import { test, expect } from '@playwright/test';

test.describe('Visual Rules Editor', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the app
    await page.goto('/');
    
    // Open Main Menu
    await page.getByLabel('Main Menu').click();
    
    // Click Visual Rules Editor
    await page.getByText('Visual Rules Editor').click();
    
    // Handle Login if visible
    const loginTitle = page.getByText('Display Rules Manager Access');
    try {
      await expect(loginTitle).toBeVisible({ timeout: 5000 });
      await page.getByLabel('Username').fill('admin');
      await page.getByLabel('Password').fill('admin');
      await page.getByRole('button', { name: 'Sign In' }).click();
    } catch (e) {
      // Login might not be required if already authenticated in local storage
      console.log('Login modal not visible, proceeding...');
    }
  });

  test('should open rules manager and show list', async ({ page }) => {
    await expect(page.getByText('Display Rules Manager')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Rule' })).toBeVisible();
  });

  test('should create and edit a rule with conditional symbols', async ({ page }) => {
    // Handle dialog for prompt
    page.on('dialog', async dialog => {
      if (dialog.message().includes('New profile name')) {
        await dialog.accept('Test Profile');
      } else {
        await dialog.dismiss();
      }
    });

    // Ensure we have a profile selected
    const profileSelect = page.getByRole('combobox', { name: 'Display Profile' });
    
    // Mantine Select might not have inputValue() set on the hidden input in some versions
    // so we check if the selected text is visible instead.
    const hasProfile = await page.getByText('Default Grid View (Default)').isVisible();
    
    if (!hasProfile) {
      // Click + button and then "New Profile"
      await page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).last().click();
      await page.getByText('New Profile').click();
      // Dialog handler will fill 'Test Profile'
    }

    // Click Add Rule
    await page.getByRole('button', { name: 'Add Rule' }).click();
    
    // Fill basic info
    await page.getByLabel('Rule Name').clear();
    await page.getByLabel('Rule Name').fill('E2E Test Rule');
    
    // Switch to Conditional Symbols tab
    await page.getByRole('tab', { name: 'Conditional Symbols' }).click();
    
    // Click Add Symbol
    await page.getByRole('button', { name: 'Add Symbol' }).click();
    
    // Check if symbol editor opened
    await expect(page.getByText('Symbol #1')).toBeVisible();
    
    // Add a condition in the symbol editor
    await page.getByRole('button', { name: 'Add Condition' }).last().click();
    
    // Fill condition details
    await page.getByPlaceholder('attribute.path').fill('cim_type');
    await page.getByPlaceholder('value').fill('Transformer');
    
    // Add SVG content
    await page.getByPlaceholder('<svg>...</svg>').fill('<svg><circle cx="10" cy="10" r="5" fill="red" /></svg>');
    
    // Save Rule
    await page.getByRole('button', { name: 'Save Rule' }).last().click();
    
    // Verify it appeared in the list
    await expect(page.getByText('E2E Test Rule')).toBeVisible();
    
    // Re-open to verify persistence
    await page.getByText('E2E Test Rule').click();
    await page.getByRole('tab', { name: 'Conditional Symbols' }).click();
    
    // Verify the values are still there
    await expect(page.getByText('Symbol #1')).toBeVisible();
    await expect(page.locator('input[value="cim_type"]')).toBeVisible();
    await expect(page.locator('input[value="Transformer"]')).toBeVisible();
    await expect(page.getByPlaceholder('<svg>...</svg>')).toHaveValue('<svg><circle cx="10" cy="10" r="5" fill="red" /></svg>');

    // Clean up
    await page.getByRole('button', { name: 'Back to List' }).click();
  });
});
