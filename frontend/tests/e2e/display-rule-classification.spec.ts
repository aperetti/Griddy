import { test, expect } from '@playwright/test';

test.describe('Display Rule Classification Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the map/app to load
    await page.waitForTimeout(3000);
  });

  test('topology API returns nodes with display_icon', async ({ page }) => {
    // Intercept the topology API response to check classification
    const topologyResponse = await page.evaluate(async () => {
      const res = await fetch('/api/graph/topology');
      return res.json();
    });

    const nodes = topologyResponse.nodes || [];
    const nodesWithIcon = nodes.filter((n: any) => n.display_icon);
    
    console.log(`Total nodes: ${nodes.length}`);
    console.log(`Nodes with display_icon: ${nodesWithIcon.length}`);
    
    if (nodesWithIcon.length > 0) {
      const sampleIcons = nodesWithIcon.slice(0, 5).map((n: any) => ({
        id: n.id,
        type: n.type,
        display_icon: n.display_icon,
        display_type: n.display_type,
      }));
      console.log('Sample classified nodes:', JSON.stringify(sampleIcons, null, 2));
    }
    
    // We expect SOME nodes to have display_icon if rules are configured
    expect(nodes.length).toBeGreaterThan(0);
    // This assertion is the key: after fixing the tuple unpacking bug, 
    // we should have nodes with display_icon
    expect(nodesWithIcon.length).toBeGreaterThan(0);
  });

  test('sprite map JSON contains rule entries', async ({ page }) => {
    // The sprite map should contain entries for each rule (rule_1, rule_2, etc.)
    const spriteResponse = await page.evaluate(async () => {
      const res = await fetch('/api/display-rules/sprites/map.json');
      return res.json();
    });

    const ruleKeys = Object.keys(spriteResponse).filter(k => k.startsWith('rule_'));
    console.log(`Sprite map rule keys: ${ruleKeys.join(', ')}`);
    
    expect(ruleKeys.length).toBeGreaterThan(0);
  });

  test('Test Rule Match button works for EnergyConsumer', async ({ page }) => {
    // Open Main Menu
    await page.getByLabel('Main Menu').click();
    
    // Click Visual Rules Editor
    await page.getByText('Visual Rules Editor').click();
    
    // Handle Login
    const loginTitle = page.getByText('Display Rules Manager Access');
    try {
      await expect(loginTitle).toBeVisible({ timeout: 3000 });
      await page.getByLabel('Username').fill('admin');
      await page.getByLabel('Password').fill('admin');
      await page.getByRole('button', { name: 'Sign In' }).click();
    } catch (e) {
      console.log('Login not required, proceeding...');
    }

    // Wait for rules list to load
    await page.waitForTimeout(1000);

    // Click Add Rule to create a test rule
    await page.getByRole('button', { name: 'Add Rule' }).click();

    // Fill rule name
    await page.getByLabel('Rule Name').clear();
    await page.getByLabel('Rule Name').fill('Test EnergyConsumer Rule');

    // Set up the match conditions via the CIM Rule Builder
    // We need to set target_class = EnergyConsumer
    // Look for the class selector in the CimRuleBuilder
    const classSelect = page.locator('input[placeholder*="class"]').first();
    if (await classSelect.isVisible()) {
      await classSelect.fill('EnergyConsumer');
      // Select from dropdown
      await page.getByRole('option', { name: 'EnergyConsumer' }).click();
    }

    // Now test the rule - intercept the API call
    const testPromise = page.waitForResponse(resp => 
      resp.url().includes('/api/display-rules/test') && resp.status() === 200
    );

    // Click the Test Rule Match button
    await page.getByRole('button', { name: 'Test Rule Match' }).click();

    // Wait for the response
    const testResponse = await testPromise;
    const testData = await testResponse.json();

    console.log('Test Rule Match response:', JSON.stringify(testData, null, 2));
    
    // Verify the response structure
    expect(testData).toHaveProperty('query');
    expect(testData).toHaveProperty('match_count');
    expect(testData).toHaveProperty('warnings');

    // EnergyConsumer should have matches in the test data
    expect(testData.match_count).toBeGreaterThan(0);

    // The UI should show the match count badge
    await expect(page.getByText(/\d+ Matches Found/)).toBeVisible();

    // Cancel - don't save
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
