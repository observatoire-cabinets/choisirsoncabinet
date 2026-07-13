import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test('bandeau date des données + 6 onglets (accueil = cotations)', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await expect(win.locator('#data-date')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  // Onglet actif au démarrage : Cotations (1er onglet, écran d'accueil).
  await expect(win.locator('nav [data-screen="cotations"]')).toHaveClass(/active/);
  for (const s of ['cotations', 'cabinet', 'fiches', 'fiche-cabinet', 'registre', 'reglages']) {
    await expect(win.locator(`nav [data-screen="${s}"]`)).toBeVisible();
  }
  await app.close();
});

test('onglet Fiches : liste les 12 fiches avec cases cochées', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  // L'accueil est désormais Cotations : on ouvre l'onglet Fiches avant d'inspecter sa liste.
  await win.locator('nav [data-screen="fiches"]').click();
  await expect(win.locator('#fiche-list .fiche-cb')).toHaveCount(12);
  await app.close();
});
