import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineService } from './engine';
import { setSignificanceAlpha } from '../../../core/significance';

const DATA = join(__dirname, '../../../data/generated');
const has = existsSync(join(DATA, 'meta.json'));

describe.skipIf(!has)('EngineService (données réelles)', () => {
  let eng: EngineService;
  beforeAll(async () => {
    eng = new EngineService();
    await eng.load(DATA);
  }, 60_000);

  // Hygiène de suite : le seuil global revient TOUJOURS au défaut produit (0,05).
  afterEach(() => setSignificanceAlpha(0.05));

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

  it('cabinetDetail : comparaison nationale + liste COMPLÈTE triée alphabétiquement par nom', () => {
    const d = eng.cabinetDetail(eng.listCabinets()[0]);
    expect(d).not.toBeNull();
    // Toutes les structures évaluées (plus de coupe à 5).
    expect(d!.establishments.length).toBe(d!.nEvaluations);
    // Ordre alphabétique par nom (aucun classement par score exposé).
    const names = d!.establishments.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
    expect(typeof d!.gapVsNational).toBe('number');
  });

  it('exportCabinetRanking écrit un PDF des structures hors ligne', async () => {
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

  it('ficheCabinet : portrait mono-cabinet (7 axes, cotations, période)', () => {
    const f = eng.ficheCabinet(eng.listCabinets()[0], 0.05);
    expect(f).not.toBeNull();
    expect(f!.axes).toHaveLength(7);
    expect(f!.n).toBeGreaterThan(0);
    expect(f!.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }, 180_000);

  it('ficheCabinetHistory : série mensuelle cumulative (n croissant)', () => {
    const h = eng.ficheCabinetHistory(eng.listCabinets()[0]);
    expect(h).not.toBeNull();
    expect(h!.rows.length).toBeGreaterThan(0);
    const ns = h!.rows.map((r) => r.n);
    expect([...ns]).toEqual([...ns].sort((a, b) => a - b));
    // Fiabilité de la date de clôture : la quasi-totalité des évals est datée.
    expect(h!.nUndated).toBeLessThanOrEqual(ns[ns.length - 1] * 0.05);
  }, 120_000);

  it('exportFicheCabinet écrit la fiche courante et une fiche mensuelle', async () => {
    const out = mkdtempSync(join(tmpdir(), 'obs-fc-'));
    const cab = eng.listCabinets()[0];
    const p1 = await eng.exportFicheCabinet(cab, out, 0.05, null);
    const h = eng.ficheCabinetHistory(cab)!;
    const p2 = await eng.exportFicheCabinet(cab, out, 0.05, h.rows[h.rows.length - 1].month);
    expect(p1.endsWith('.pdf') && p2.endsWith('.pdf')).toBe(true);
    expect(existsSync(p1) && existsSync(p2)).toBe(true);
    expect(p1).not.toBe(p2); // suffixe -YYYY-MM sur la fiche mensuelle
  }, 300_000);
});
