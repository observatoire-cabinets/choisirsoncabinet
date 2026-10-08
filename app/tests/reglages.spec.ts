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

test('mise à jour manuelle : bouton présent sous la case automatique (jamais cliqué : réseau)', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="reglages"]').click();
  const bouton = win.locator('#maj-donnees');
  await expect(bouton).toHaveText('Mettre à jour les données maintenant');
  await expect(bouton).toBeEnabled();
  await expect(win.locator('#maj-donnees-statut')).toBeAttached();
  // Bloc placé effectivement sous la case « Mise à jour automatique ».
  const yCase = (await win.locator('#autoupdate').boundingBox())!.y;
  const yBouton = (await bouton.boundingBox())!.y;
  expect(yBouton).toBeGreaterThan(yCase);
  // Aucune mise à jour manuelle en cours dans ce lancement.
  expect(await win.evaluate(() => window.api.miseAJourDonneesEnCours())).toBe(false);
  // Aucune vérification du logiciel dans ce lancement : l'état ne se dit pas « à jour ».
  const etat = win.locator('#set-etat-collecte');
  await expect(etat).toContainText('· mise à jour du logiciel non vérifiée');
  await expect(etat).not.toContainText('logiciel : mise à jour');
  await app.close();
});
