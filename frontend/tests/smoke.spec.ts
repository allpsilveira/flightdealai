import { test, expect } from '@playwright/test';

// Minimal fixtures for mocking API responses used by the RouteDetail page
const ROUTES_FIXTURE = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'MIA → GRU Test Route',
    origins: ['MIA'],
    destinations: ['GRU'],
    cabin_classes: ['BUSINESS'],
  }
];

const PRICE_HISTORY_FIXTURE = [
  { bucket: '2026-04-01T00:00:00', min_price: 2800, avg_price: 3000, max_price: 3200, p10: 2850, p50: 3000, p90: 3150, sample_count: 3 },
  { bucket: '2026-04-08T00:00:00', min_price: 2500, avg_price: 2600, max_price: 2700, p10: 2525, p50: 2600, p90: 2675, sample_count: 4 },
  { bucket: '2026-04-15T00:00:00', min_price: 2200, avg_price: 2300, max_price: 2400, p10: 2225, p50: 2300, p90: 2375, sample_count: 2 },
];

test('smoke: route detail loads and chart renders', async ({ page }) => {
  // Intercept API calls and return fixtures
  await page.route('**/api/routes', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROUTES_FIXTURE) }));
  await page.route('**/api/deals/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/deals/offers/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/prices/history/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PRICE_HISTORY_FIXTURE) }));
  // Also catch price endpoints that use query params (e.g. /api/prices/history?route_id=...)
  await page.route('**/api/prices**', route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PRICE_HISTORY_FIXTURE) });
  });
  await page.route('**/api/events/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/intelligence/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) }));

  // Navigate to a route detail page for our fixture id (match App route: /route/:id)
  await page.goto('/route/11111111-1111-1111-1111-111111111111');

  // Wait for the chart's SVG element to appear (Recharts renders an <svg>)
  const svg = await page.waitForSelector('svg', { timeout: 10_000 });
  expect(svg).toBeTruthy();

  // Chart SVG present — that's our primary smoke assertion
});
