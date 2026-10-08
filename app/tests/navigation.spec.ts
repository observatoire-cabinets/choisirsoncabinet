import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test('changement rapide d’onglet au lancement : Registre reste affiché après la réponse tardive des accréditations', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await expect(win.locator('nav [data-screen="accreditations"]')).toBeVisible();

  // Deux clics rapprochés (moins de 300 ms) pendant que les calculs du
  // lancement sont encore en cours. Ils sont émis dans la page : les clics
  // simulés depuis l'extérieur transitent par le processus principal, occupé
  // à ce moment-là, et arriveraient trop espacés.
  const ecart = await win.evaluate(async () => {
    const bouton = (id: string): HTMLElement =>
      document.querySelector<HTMLElement>(`nav [data-screen="${id}"]`)!;
    const t0 = performance.now();
    bouton('accreditations').click();
    await new Promise((r) => setTimeout(r, 100));
    bouton('registre').click();
    return performance.now() - t0;
  });
  expect(ecart).toBeLessThan(300);

  // Laisse au rendu des accréditations le temps de se terminer.
  await win.waitForTimeout(6000);

  await expect(win.locator('#screen h2:visible')).toHaveCount(1);
  await expect(win.locator('#screen h2:visible')).toHaveText('Registre des cabinets');
  await expect(win.locator('nav [data-screen="registre"]')).toHaveClass(/active/);
  await expect(win.locator('nav button.active')).toHaveCount(1);
  await expect(win.locator('h2:visible', { hasText: 'Accréditations' })).toHaveCount(0);
  await app.close();
});
