import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGED = "C:/tmp/observatoire-build/win-unpacked/Observatoire Cabinets Evaluateurs d'ESSMS.exe";

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
