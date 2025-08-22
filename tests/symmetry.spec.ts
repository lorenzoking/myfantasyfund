import { test, expect } from '@playwright/test';

async function assertCentered(page, selector: string, tolerancePx = 4) {
  const box = await page.locator(selector).boundingBox();
  const container = await page.locator('.container').first().boundingBox();
  expect(box).not.toBeNull();
  expect(container).not.toBeNull();
  if (!box || !container) return;
  const center = box.x + box.width / 2;
  const containerCenter = container.x + container.width / 2;
  expect(Math.abs(center - containerCenter)).toBeLessThanOrEqual(tolerancePx);
}

test.describe('Symmetry', () => {
  test('Home header/logo alignment', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.logo-img')).toBeVisible();
    // Visual snapshot for the header area
    await expect(page.locator('header.header')).toHaveScreenshot('home-header.png', { animations: 'disabled' });
    // Ensure logo is horizontally centered within container row when alone
    await assertCentered(page, 'header.header .logo-link');
  });

  test('League header alignment', async ({ page }) => {
    await page.goto('/leagues/burgboyz/');
    await expect(page.locator('.logo-img')).toBeVisible();
    await expect(page.locator('header.header')).toHaveScreenshot('league-header.png', { animations: 'disabled' });
    // Title centered horizontally within container
    await assertCentered(page, 'header.header h1');
  });
});


