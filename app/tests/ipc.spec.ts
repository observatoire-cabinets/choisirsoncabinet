import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test('window.api.listCabinets renvoie un tableau non vide', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  const n = await win.evaluate(async () => (await window.api.listCabinets()).length);
  expect(n).toBeGreaterThan(100);
  await app.close();
});

test('window.api.getMeta expose les dates du jeu de données', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  const meta = await win.evaluate(() => window.api.getMeta());
  expect(meta.finessSnapshotMax).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(meta.sources.length).toBeGreaterThan(0);
  await app.close();
});
