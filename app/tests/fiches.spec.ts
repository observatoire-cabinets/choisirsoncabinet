import { test, expect } from '@playwright/test';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './_app';

test("génère au moins une fiche PDF via l'application (alpha=0,05)", async () => {
  const out = mkdtempSync(join(tmpdir(), 'obs-ui-'));
  const app = await launchApp();
  const win = await app.firstWindow();
  const r = await win.evaluate(
    (o) => window.api.generateFiches({ numeros: [3], outDir: o, alpha: 0.05 }),
    out,
  );
  expect(r.written.length).toBeGreaterThan(0);
  expect(readdirSync(out).some((f) => f.endsWith('.pdf'))).toBe(true);
  await app.close();
});
