import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Build produit par `pnpm dist` DANS le dépôt (electron-builder, output: release).
const PACKAGED = join(__dirname, "../release/win-unpacked/Observatoire Cabinets Evaluateurs d'ESSMS.exe");

test("app packagée : charge les données embarquées (resourcesPath) et sert l'IPC", async () => {
  test.skip(!existsSync(PACKAGED), 'app packagée absente (lancer pnpm dist)');
  const ud = mkdtempSync(join(tmpdir(), 'obs-pkg-'));
  const app = await electron.launch({
    executablePath: PACKAGED,
    args: ['--no-autoupdate', `--user-data-dir=${ud}`],
  });
  const win = await app.firstWindow();
  await expect(win.locator('#app-title')).toHaveText("Observatoire Cabinets Evaluateurs d'ESSMS");
  const n = await win.evaluate(async () => (await window.api.listCabinets()).length);
  expect(n).toBeGreaterThan(100);
  await app.close();
});

test("app packagée : l'onglet Fiche cabinet rend le portrait complet", async () => {
  test.skip(!existsSync(PACKAGED), 'app packagée absente (lancer pnpm dist)');
  const ud = mkdtempSync(join(tmpdir(), 'obs-pkg-fc-'));
  const app = await electron.launch({
    executablePath: PACKAGED,
    args: ['--no-autoupdate', `--user-data-dir=${ud}`],
  });
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="fiche-cabinet"]').click();
  const first = await win.evaluate(async () => (await window.api.listCabinets())[0]);
  await win.locator('#fc-select').selectOption(first);
  await expect(win.locator('#fc-niveau')).toContainText(/[-+]?\d/, { timeout: 120_000 });
  await expect(win.locator('#fc-axes tbody tr')).toHaveCount(7);
  await expect(win.locator('#fc-history tbody tr')).not.toHaveCount(0);
  await app.close();
});
