import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

// Le calcul des profils 7 axes (toutes cabinets) est rapide (<1 s sur le jeu réel)
// mais le premier affichage cumule démarrage + IPC : marge généreuse.
test.setTimeout(240_000);

test('fiche cabinet : portrait 6 sections + historique mensuel + exports', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="fiche-cabinet"]').click();
  const first = await win.evaluate(async () => (await window.api.listCabinets())[0]);
  await win.locator('#fc-select').selectOption(first);

  // Niveau global signé (le calcul peut être long au premier affichage).
  await expect(win.locator('#fc-niveau')).toContainText(/[-+]?\d/, { timeout: 180_000 });
  // 7 axes phares.
  await expect(win.locator('#fc-axes tbody tr')).toHaveCount(7);
  // Historique mensuel non vide, avec un bouton PDF par ligne.
  await expect(win.locator('#fc-history tbody tr')).not.toHaveCount(0);
  await expect(win.locator('#fc-history tbody tr').first().locator('button.fc-month-pdf')).toBeVisible();
  // Export de la fiche complète présent.
  await expect(win.locator('#fc-export')).toBeVisible();
  await app.close();
});
