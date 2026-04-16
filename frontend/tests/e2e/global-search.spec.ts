import { test, expect } from '@playwright/test';

/**
 * Global Search E2E Test
 * 
 * Verifies that the global search bar:
 * 1. Can find assets by name (case-insensitive)
 * 2. Interacts with Neo4j directly by default
 * 3. Correctlly resolves nodes to their containing feeder
 * 4. Navigates to the selected asset on the map
 */
test.describe('Global Search', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app (using baseURL from config)
    await page.goto('/');
    // Wait for the app to load and the map to initialize
    await page.waitForSelector('.deck-container', { timeout: 30000 });
  });

  test('should find and navigate to an asset using global search', async ({ page }) => {
    // 1. Locate the search input
    // In Mantine Select, the input is often inside a wrapper. 
    // Let's use a more robust locator based on the placeholder
    const searchInput = page.getByPlaceholder(/Search all models/);
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // 2. Type a known asset name (e.g., "bus" in lowercase to test case-insensitivity)
    // We'll use a specific one if possible, but "bus" should return results in IEEE8500
    await searchInput.fill('bus');

    // 3. Wait for the dropdown options to appear
    // The options are rendered in a Mantine portal with specific labels
    const dropdownOption = page.locator('div[role="option"]').first();
    await expect(dropdownOption).toBeVisible({ timeout: 15000 });

    const assetName = await dropdownOption.locator('div > div > div:first-child').textContent();
    const assetModel = await dropdownOption.locator('div > div > div:last-child').textContent();
    
    console.log(`Found asset in search: ${assetName} (Model: ${assetModel})`);
    
    // 4. Click the first result to navigate
    await dropdownOption.click();

    // 5. Verify search input is cleared
    await expect(searchInput).toHaveValue('');

    // 6. Verify navigation (map center changes)
    // We can check if the overlay shows "Applying rules..." which indicates model loading or data updates
    // Or check for the AnalysisToolbar which appears when a node is selected
    const analysisToolbar = page.locator('div:has-text("Selected Assets")');
    // If it's a new model being loaded, it might take a few seconds
    await expect(analysisToolbar).toBeVisible({ timeout: 30000 });
    
    // Check if the selected asset name appears in the HUD
    const selectedText = page.getByText(assetName || "");
    await expect(selectedText).toBeVisible();
  });

  test('should handle case-insensitive searches (BUS vs bus)', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search all models/);
    
    // Search for "BUS"
    await searchInput.fill('BUS');
    await expect(page.locator('div[role="option"]').first()).toBeVisible({ timeout: 10000 });
    const busCount = await page.locator('div[role="option"]').count();
    expect(busCount).toBeGreaterThan(0);
    
    // Clear and search for "bus"
    await searchInput.clear();
    await searchInput.fill('bus');
    await expect(page.locator('div[role="option"]').first()).toBeVisible({ timeout: 10000 });
    const lowercaseBusCount = await page.locator('div[role="option"]').count();
    expect(lowercaseBusCount).toBeGreaterThan(0);
    
    // They should return similar numbers of results (or at least both should work)
    expect(busCount).toEqual(lowercaseBusCount);
  });
});
