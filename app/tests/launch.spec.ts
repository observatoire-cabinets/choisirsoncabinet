import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test("la fenêtre s'ouvre avec le nom du produit", async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await expect(win.locator('#app-title')).toHaveText(
    "Observatoire Cabinets Evaluateurs d'ESSMS",
  );
  await app.close();
});
