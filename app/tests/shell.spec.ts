import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test('bandeau date des données + 4 onglets', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await expect(win.locator('#data-date')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  for (const s of ['fiches', 'cabinet', 'registre', 'reglages']) {
    await expect(win.locator(`nav [data-screen="${s}"]`)).toBeVisible();
  }
  await app.close();
});

test('onglet Fiches : liste les 12 fiches avec cases cochées', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await expect(win.locator('#fiche-list .fiche-cb')).toHaveCount(12);
  await app.close();
});
