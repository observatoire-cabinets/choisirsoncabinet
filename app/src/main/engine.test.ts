import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineService } from './engine';

const DATA = join(__dirname, '../../../data/generated');
const has = existsSync(join(DATA, 'meta.json'));

describe.skipIf(!has)('EngineService (données réelles)', () => {
  let eng: EngineService;
  beforeAll(async () => {
    eng = new EngineService();
    await eng.load(DATA);
  }, 60_000);

  it('meta expose les dates du jeu de données', () => {
    const m = eng.getMeta();
    expect(m.hasSyncedAt).toBeTruthy();
    expect(m.finessSnapshotMax).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.sources.length).toBeGreaterThan(0);
  });

  it('listCabinets renvoie >100 cabinets triés (FR)', () => {
    const c = eng.listCabinets();
    expect(c.length).toBeGreaterThan(100);
    expect([...c]).toEqual([...c].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('cabinetDetail : comparaison nationale + liste COMPLÈTE triée par score croissant', () => {
    const d = eng.cabinetDetail(eng.listCabinets()[0]);
    expect(d).not.toBeNull();
    // Toutes les structures évaluées (plus de coupe à 5).
    expect(d!.establishments.length).toBe(d!.nEvaluations);
    for (let i = 1; i < d!.establishments.length; i++) {
      expect(d!.establishments[i - 1].score).toBeLessThanOrEqual(d!.establishments[i].score);
    }
    expect(typeof d!.gapVsNational).toBe('number');
  });

  it('exportCabinetRanking écrit un PDF de classement hors ligne', async () => {
    const out = mkdtempSync(join(tmpdir(), 'obs-cab-'));
    const p = await eng.exportCabinetRanking(eng.listCabinets()[0], out);
    expect(p.endsWith('.pdf')).toBe(true);
    expect(existsSync(p)).toBe(true);
  }, 60_000);

  it('registry : lignes de vie', () => {
    expect(eng.registry().length).toBeGreaterThan(100);
  });

  it('generateFiches écrit des PDF (fiche 3, alpha=0,05)', async () => {
    const out = mkdtempSync(join(tmpdir(), 'obs-fiche-'));
    const r = await eng.generateFiches({ numeros: [3], outDir: out, alpha: 0.05 });
    expect(r.written.length).toBeGreaterThan(0);
    expect(readdirSync(out).some((f) => f.endsWith('.pdf'))).toBe(true);
  }, 60_000);
});
