import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './_app';

test("l'onglet Accréditations rend les trois volets", async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="accreditations"]').click();
  // Volet ① par défaut : tableau des statuts non vide (les cabinets Synaé sont > 100).
  await expect
    .poll(async () => win.locator('#acc-statuts tbody tr').count(), { timeout: 30_000 })
    .toBeGreaterThan(100);
  // Volet ② : 9 relevés + 4 bilans = 13 lignes de chronologie (l'archive est
  // dérivée du userData isolé de launchApp → comptes exacts déterministes).
  await win.locator('#acc-v-chronologie').click();
  await expect(win.locator('#acc-chrono tbody tr')).toHaveCount(13);
  await expect(win.locator('#acc-mouvements tbody tr')).toHaveCount(8);
  // Accrédités (4e colonne) des éditions HAS du 2026-07-16 et du 2026-10-06.
  const accredites = (date: string) =>
    win.locator('#acc-chrono tbody tr', { hasText: date }).locator('td').nth(3);
  await expect(accredites('16/07/2026')).toHaveText('104');
  await expect(accredites('06/10/2026')).toHaveText('103');
  // Volet ③ : des sorties existent (25+ dans la fenêtre des 894 jours à elle seule).
  await win.locator('#acc-v-sorties').click();
  await expect
    .poll(async () => win.locator('#acc-sorties tbody tr').count())
    .toBeGreaterThan(20);
  await app.close();
});

test('volet ③ : la sortie d’A-AMCOS porte le commentaire COFRAC et la piste à confirmer', async () => {
  // Relevé COFRAC postérieur à la sortie (13/08 → 06/10/2026), déposé dans
  // l'archive du userData isolé avant le lancement.
  const userDataDir = mkdtempSync(join(tmpdir(), 'obs-ud-'));
  const cofracDir = join(userDataDir, 'liste-has', 'cofrac');
  mkdirSync(cofracDir, { recursive: true });
  writeFileSync(
    join(cofracDir, '2026-10-07_rrs.json'),
    JSON.stringify({
      date_releve: '2026-10-07',
      sha256: 'e2e',
      rows: [{ num: '3-2040', nom: 'A-AMCOS', date: '12/08/2026', commentaire: 'vers 3-10079' }],
    }),
    'utf8',
  );
  const app = await launchApp(userDataDir);
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="accreditations"]').click();
  await expect(win.locator('#acc-v-sorties')).toBeVisible({ timeout: 30_000 });
  await win.locator('#acc-v-sorties').click();
  const ligne = win.locator('#acc-sorties tbody tr', { hasText: '518991294' });
  await expect(ligne).toHaveCount(1);
  await expect(ligne.locator('td').nth(7)).toHaveText('constatée le 07/10/2026 — COFRAC : « vers 3-10079 »');
  await expect(win.locator('#acc details')).toContainText(
    'le commentaire éventuel est reproduit tel que publié par le COFRAC',
  );
  await expect(ligne.locator('td').nth(8)).toHaveText(
    'A-AMCOS QUALITE EVALUATION ET CERTIFICATION (nom repris avec variation, autre SIREN) — à confirmer',
  );
  await app.close();
});
