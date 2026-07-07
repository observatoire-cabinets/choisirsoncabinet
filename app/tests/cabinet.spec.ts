import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test('vue cabinet : écart national + ≤5 structures nominatives', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="cabinet"]').click();
  const first = await win.evaluate(async () => (await window.api.listCabinets())[0]);
  await win.locator('#cabinet-select').selectOption(first);
  await expect(win.locator('#cabinet-gap')).toContainText(/[-+]?\d/);
  expect(await win.locator('#cabinet-lowest tbody tr').count()).toBeLessThanOrEqual(5);
  await app.close();
});
