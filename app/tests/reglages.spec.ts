import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test('réglage alpha : bascule 0,01 persistée', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="reglages"]').click();
  await win.locator('#alpha-001').check();
  const persisted = await win.evaluate(async () => (await window.api.getSettings()).alpha);
  expect(persisted).toBe(0.01);
  await app.close();
});

test('réglage alpha : défaut 0,05 sur userData vierge', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  const alpha = await win.evaluate(async () => (await window.api.getSettings()).alpha);
  expect(alpha).toBe(0.05);
  await app.close();
});
