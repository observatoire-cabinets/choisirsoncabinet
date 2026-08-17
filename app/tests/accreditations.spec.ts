import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test("l'onglet Accréditations rend les trois volets", async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="accreditations"]').click();
  // Volet ① par défaut : tableau des statuts non vide (les cabinets Synaé sont > 100).
  await expect
    .poll(async () => win.locator('#acc-statuts tbody tr').count(), { timeout: 30_000 })
    .toBeGreaterThan(100);
  // Volet ② : 8 relevés + 4 bilans = 12 lignes de chronologie (l'archive est
  // dérivée du userData isolé de launchApp → comptes exacts déterministes).
  await win.locator('#acc-v-chronologie').click();
  await expect(win.locator('#acc-chrono tbody tr')).toHaveCount(12);
  await expect(win.locator('#acc-mouvements tbody tr')).toHaveCount(7);
  // Volet ③ : des sorties existent (25+ dans la fenêtre des 894 jours à elle seule).
  await win.locator('#acc-v-sorties').click();
  await expect
    .poll(async () => win.locator('#acc-sorties tbody tr').count())
    .toBeGreaterThan(20);
  await app.close();
});
