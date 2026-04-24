const { test, expect } = require('@playwright/test');

test('route price chart renders', async ({ page }) => {
  // Adjust URL if your frontend runs on a different port
  await page.goto('http://localhost:5173/route/MIA-GRU');
  await page.waitForSelector('[data-testid="price-chart"]', { timeout: 15000 });
  await expect(page.locator('[data-testid="price-chart"]')).toHaveScreenshot('route-price-chart.png');
});
