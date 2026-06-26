import { test, expect } from '@playwright/test';

test.describe('TreeMakerWeb editor', () => {
  test('add nodes by clicking, then undo/redo', async ({ page }) => {
    await page.goto('/');
    const svg = page.locator('svg.tm-design');
    await expect(svg).toBeVisible();
    const box = (await svg.boundingBox())!;

    // First empty click → root node.
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await expect(page.locator('.tm-node')).toHaveCount(1);

    // Second empty click (root selected) → child node + edge.
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await expect(page.locator('.tm-node')).toHaveCount(2);
    await expect(page.locator('.tm-edge')).toHaveCount(1);
    await expect(page.locator('.tm-statusbar')).toContainText('2 nodes');

    // Undo twice → empty; redo once → back to one node.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.tm-node')).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.tm-node')).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.locator('.tm-node')).toHaveCount(1);
  });

  test('sample tree renders five nodes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sample' }).click();
    await expect(page.locator('.tm-node')).toHaveCount(5);
    await expect(page.locator('.tm-edge')).toHaveCount(4);
  });

  test('selecting a node shows its inspector panel', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sample' }).click();
    await page.locator('.tm-node').first().click();
    await expect(page.locator('.tm-inspector .tm-panel-title')).toContainText('Node');
  });

  test('Scale Everything runs the Wasm optimizer and packs the tree', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sample' }).click();
    await expect(page.locator('.tm-node')).toHaveCount(5);

    // Tree inspector shows the default scale 0.1.
    const scaleInput = page.locator('.tm-inspector .tm-row', { hasText: 'Scale' }).locator('input');
    await expect(scaleInput).toHaveValue('0.1');

    await page.getByRole('button', { name: 'Scale Everything' }).click();

    // The optimizer increases the scale (circle/river packing) and stays feasible.
    await expect(page.locator('.tm-statusbar')).toContainText('feasible', { timeout: 15000 });
    await expect(page.locator('.tm-statusbar')).not.toContainText('failed');
    await expect.poll(async () => Number(await scaleInput.inputValue())).toBeGreaterThan(0.2);
    // Undo restores the pre-optimization scale.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(scaleInput).toHaveValue('0.1');
  });

  test('Build Crease Pattern renders mountain/valley creases', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sample' }).click();
    await page.getByRole('button', { name: 'Build Crease Pattern' }).click();

    await expect(page.locator('.tm-statusbar')).toContainText('creases', { timeout: 15000 });
    // creases rendered, including both mountain and valley folds
    await expect(page.locator('.tm-crease')).not.toHaveCount(0);
    await expect(page.locator('.tm-crease.tm-mountain').first()).toBeVisible();
    await expect(page.locator('.tm-crease.tm-valley').first()).toBeVisible();

    // The folded-form panel previews the base (facets in elevation/depth).
    await expect(page.locator('.tm-folded .tm-folded-facet').first()).toBeVisible();

    // Kill CP removes both the overlay and the folded-form preview.
    await page.getByRole('button', { name: 'Kill CP' }).click();
    await expect(page.locator('.tm-crease')).toHaveCount(0);
    await expect(page.locator('.tm-folded .tm-folded-facet')).toHaveCount(0);
  });

  test('opens a legacy .tmd5 file', async ({ page }) => {
    await page.goto('/');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Open…' }).click(),
    ]);
    await chooser.setFiles('Orig/Source/test/tmModelTester/tmModelTester_1.tmd5');
    await expect(page.locator('.tm-node')).toHaveCount(4);
    await expect(page.locator('.tm-edge')).toHaveCount(3);
  });
});
