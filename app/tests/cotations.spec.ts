import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test('onglet Cotations : vue générale, filtre, profil, exports visibles', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  // Accueil = Cotations (onglet actif au démarrage).
  await expect(win.locator('nav [data-screen="cotations"]')).toHaveClass(/active/);
  await expect(win.locator('#cot-general tbody tr')).not.toHaveCount(0);

  // Filtre : la table reste peuplée pour un préfixe du 1er cabinet.
  const firstCab = await win.evaluate(async () => (await window.api.cotationGeneralView())[0].cabinet);
  await win.locator('#cot-filter').fill(firstCab.slice(0, 4));
  await expect(win.locator('#cot-general tbody tr').first()).toBeVisible();

  // Clic sur une ligne → profil.
  await win.locator('#cot-general tbody tr.cot-row').first().click();
  await expect(win.locator('#cot-view-cabinet')).toBeVisible();
  await expect(win.locator('#cot-profile')).toContainText('Critères impératifs');
  await expect(win.locator('#cot-export-pdf')).toBeVisible();

  // Retour vue générale.
  await win.locator('#cot-back').click();
  await expect(win.locator('#cot-view-general')).toBeVisible();
  await app.close();
});
