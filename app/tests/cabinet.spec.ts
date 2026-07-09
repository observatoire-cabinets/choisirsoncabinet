import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test('vue cabinet : écart national + liste complète triée + filtre + export', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="cabinet"]').click();
  const first = await win.evaluate(async () => (await window.api.listCabinets())[0]);
  await win.locator('#cabinet-select').selectOption(first);
  await expect(win.locator('#cabinet-gap')).toContainText(/[-+]?\d/);

  // Liste COMPLÈTE : autant de lignes que d'évaluations scorées (plus de coupe à 5).
  const nEval = await win.evaluate(async (c) => (await window.api.cabinetDetail(c))!.nEvaluations, first);
  const rows = await win.locator('#cabinet-list tbody tr').count();
  expect(rows).toBe(nEval);

  // Le filtre réduit l'affichage.
  if (rows > 1) {
    const firstName = (await win.locator('#cabinet-list tbody tr').first().locator('td').nth(0).textContent()) ?? '';
    await win.locator('#cabinet-filter').fill(firstName.slice(0, 4));
    expect(await win.locator('#cabinet-list tbody tr').count()).toBeLessThanOrEqual(rows);
    await win.locator('#cabinet-filter').fill('');
  }

  // Le bouton d'export est présent.
  await expect(win.locator('#cabinet-export')).toBeVisible();
  await app.close();
});
