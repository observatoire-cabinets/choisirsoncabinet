import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Dataset, EssmsRow } from '../store/types';
import {
  computePositioningHistory,
  listerMois,
  tronquerHistorique,
  SEUIL_POINT,
  type PositioningHistoryAll,
} from './cabinet-positioning-history';
import { buildCabinetProfiles, sortMetaRanking } from './cabinet-profile';
import { asOfDataset } from './cabinet-fiche';
import { extractRows } from '../store/extract';
import { loadDataset } from '../store/load';
import { significanceAlpha } from './significance';

function mkRow(p: Partial<EssmsRow> & { finessGeo: string }): EssmsRow {
  return {
    finessGeo: p.finessGeo,
    score: p.score === undefined ? 80 : p.score,
    cabinet: p.cabinet === undefined ? 'CAB A' : p.cabinet,
    raisonSociale: null,
    region: p.region ?? 'R1',
    statut: p.statut ?? 'Public', categ: '', categCode: p.categCode ?? '500', departement: p.departement ?? '75',
    evalDate: p.evalDate === undefined ? '2023-05-10' : p.evalDate,
    grade: null, chapters: [null, null, null],
    imperatives: [], ciEvaluated: null, ciMet: null, ciAbove35: null,
  };
}
function mkDataset(essms: EssmsRow[]): Dataset {
  return {
    meta: { builtAt: '', hasSyncedAt: '2026-07-01', finessSnapshotMax: '2026-06-01', sources: [] },
    essms,
    ejSnapshots: essms.map((e) => ({ snapshotDate: '2020-01-01', finessGeo: e.finessGeo, ejSize: 1 })),
    capacitySnapshots: [], baseDoc: [], evalHistory: [],
  };
}

// CAB A : 6 évaluations à 80 en janvier 2023 (R1), 6 à 90 en mars 2023 (R2), 6 à 70
//         en avril 2023 (R1, DROM, PH adultes) ; 1 évaluation sans date.
// CAB B : 6 évaluations à 60 en janvier 2023 (R1), 6 à 40 en avril 2023 (R1, DROM).
// CAB C : 2 évaluations en février 2023 (sous le seuil).
let geo = 0;
const g = () => String(++geo).padStart(9, '0');
const rows: EssmsRow[] = [
  ...Array.from({ length: 6 }, () => mkRow({ finessGeo: g(), cabinet: 'CAB A', score: 80, evalDate: '2023-01-10' })),
  ...Array.from({ length: 6 }, () => mkRow({ finessGeo: g(), cabinet: 'CAB A', score: 90, evalDate: '2023-03-10', region: 'R2' })),
  ...Array.from({ length: 6 }, () => mkRow({ finessGeo: g(), cabinet: 'CAB B', score: 60, evalDate: '2023-01-20' })),
  ...Array.from({ length: 2 }, () => mkRow({ finessGeo: g(), cabinet: 'CAB C', score: 70, evalDate: '2023-02-05' })),
  mkRow({ finessGeo: g(), cabinet: 'CAB A', score: 50, evalDate: null }),
  ...Array.from({ length: 6 }, () =>
    mkRow({ finessGeo: g(), cabinet: 'CAB A', score: 70, evalDate: '2023-04-10', departement: '971', categCode: '246' }),
  ),
  ...Array.from({ length: 6 }, () => mkRow({ finessGeo: g(), cabinet: 'CAB B', score: 40, evalDate: '2023-04-15', departement: '971' })),
];
const ds = mkDataset(rows);

describe('listerMois', () => {
  it('couvre chaque mois du premier au dernier, trous compris', () => {
    expect(listerMois(ds)).toEqual(['2023-01', '2023-02', '2023-03', '2023-04']);
  });
});

describe('computePositioningHistory — jeu synthétique', () => {
  it('note moyenne cumulée du cabinet et moyenne non pondérée des cabinets', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const a = all.byCabinet.get('CAB A')!;
    const niveau = a.series.find((s) => s.seriesId === 'niveau')!;
    expect(niveau.ficheNumero).toBe(3);
    // CAB A : (6×80 + 6×90) / 12 = 85 en mars, (6×80 + 6×90 + 6×70) / 18 = 80 en avril.
    expect(niveau.points.map((p) => p.cabinet)).toEqual([80, 80, 85, 80]);
    // Ensemble = moyenne des cabinets ayant ≥ 5 évaluations (CAB C exclu) :
    // (80 + 60) / 2, puis (85 + 60) / 2, puis (80 + 50) / 2 avec CAB B à (6×60 + 6×40) / 12.
    expect(niveau.points.map((p) => p.ensemble)).toEqual([70, 70, 72.5, 65]);
    expect(niveau.points.map((p) => p.nCabinetsEnsemble)).toEqual([2, 2, 2, 2]);
    expect(niveau.points.map((p) => p.effectifs)).toEqual([[6], [6], [12], [18]]);
    expect(niveau.firstMonth).toBe('2023-01');
    expect(niveau.lastMonth).toBe('2023-04');
    expect(a.nDated).toBe(18);
    expect(a.nUndated).toBe(1);
  });

  it('pointillé du niveau : effectif < 10 à l’une des extrémités, trait plein ensuite', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const niveau = all.byCabinet.get('CAB A')!.series.find((s) => s.seriesId === 'niveau')!;
    expect(niveau.segments).toEqual([
      { i0: 0, v0: 80, i1: 1, v1: 80, cote: 'dessus', pointille: true },
      { i0: 1, v0: 80, i1: 2, v1: 85, cote: 'dessus', pointille: true },
      { i0: 2, v0: 85, i1: 3, v1: 80, cote: 'dessus', pointille: false },
    ]);
  });

  it('côté et pointillé de chaque point, calculés par le cœur', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const a = all.byCabinet.get('CAB A')!;
    const niveauA = a.series.find((s) => s.seriesId === 'niveau')!;
    // Effectifs 6, 6, 12, 18 ; toujours au-dessus de la moyenne des cabinets.
    expect(niveauA.points.map((p) => p.pointille)).toEqual([true, true, false, false]);
    expect(niveauA.points.map((p) => p.cote)).toEqual(['dessus', 'dessus', 'dessus', 'dessus']);
    // Point isolé (dernier mois seul tracé), palier descriptif : −15 face à −17,5 (dessus).
    const dromA = a.series.find((s) => s.seriesId === 'drom')!;
    expect(dromA.points.map((p) => p.pointille)).toEqual([false, false, false, true]);
    expect(dromA.points.map((p) => p.cote)).toEqual([null, null, null, 'dessus']);
    // CAB B : −20 face à −17,5 (dessous).
    const dromB = all.byCabinet.get('CAB B')!.series.find((s) => s.seriesId === 'drom')!;
    expect(dromB.points[3]).toMatchObject({ cote: 'dessous', pointille: true });
    // CAB C : aucune valeur tracée sauf le rang (2 évaluations, sans moyenne).
    const c = all.byCabinet.get('CAB C')!;
    const niveauC = c.series.find((s) => s.seriesId === 'niveau')!;
    expect(niveauC.points.map((p) => p.pointille)).toEqual([false, false, false, false]);
    expect(niveauC.points.map((p) => p.cote)).toEqual([null, null, null, null]);
    const rangC = c.series.find((s) => s.seriesId === 'rang')!;
    expect(rangC.points.map((p) => p.pointille)).toEqual([false, true, true, true]);
    expect(rangC.points.map((p) => p.cote)).toEqual([null, 'dessus', 'dessus', 'dessus']);
  });

  it('écarts : valeur du cabinet à ≥ 5/5 et moyenne des cabinets ayant une valeur', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const dromA = all.byCabinet.get('CAB A')!.series.find((s) => s.seriesId === 'drom')!;
    const dromB = all.byCabinet.get('CAB B')!.series.find((s) => s.seriesId === 'drom')!;
    expect(dromA.ficheNumero).toBe(11);
    // CAB A : 70 (DROM) − 85 (métropole) ; CAB B : 40 − 60 ; ensemble : (−15 − 20) / 2.
    expect(dromA.points.map((p) => p.cabinet)).toEqual([null, null, null, -15]);
    expect(dromA.points[3].effectifs).toEqual([12, 6]);
    expect(dromA.points[3].reliability).toBe('descriptif');
    expect(dromB.points[3].cabinet).toBe(-20);
    expect(dromA.points.map((p) => p.ensemble)).toEqual([null, null, null, -17.5]);
    expect(dromA.points.map((p) => p.nCabinetsEnsemble)).toEqual([0, 0, 0, 2]);
    // Axe phare secteur (PH adultes vs PA) : seul CAB A atteint 5/5.
    const secteurA = all.byCabinet.get('CAB A')!.series.find((s) => s.seriesId === 'secteur')!;
    expect(secteurA.points[3].cabinet).toBe(-15);
    expect(secteurA.points[3].effectifs).toEqual([12, 6]);
    expect(secteurA.points[3].ensemble).toBe(-15);
    expect(secteurA.points[3].nCabinetsEnsemble).toBe(1);
    const secteurB = all.byCabinet.get('CAB B')!.series.find((s) => s.seriesId === 'secteur')!;
    expect(secteurB.points[3].cabinet).toBeNull();
  });

  it('seuils du pointillé : palier descriptif pour un écart, effectif < 10 pour les autres séries', async () => {
    // CAB X : 10 Public et 5 Privé commercial en janvier (palier descriptif), 10/10 dès février.
    // CAB W : exactement 10 évaluations en janvier, 11 ensuite.
    const r = (cabinet: string, statut: string, evalDate: string, score: number) =>
      mkRow({ finessGeo: g(), cabinet, statut, score, evalDate });
    const dsEcart = mkDataset([
      ...Array.from({ length: 10 }, () => r('CAB X', 'Public', '2024-01-10', 80)),
      ...Array.from({ length: 5 }, () => r('CAB X', 'Privé commercial', '2024-01-12', 70)),
      ...Array.from({ length: 5 }, () => r('CAB X', 'Privé commercial', '2024-02-12', 70)),
      r('CAB X', 'Privé non lucratif', '2024-03-10', 75),
      ...Array.from({ length: 10 }, () => r('CAB W', 'Public', '2024-01-15', 60)),
      r('CAB W', 'Public', '2024-02-15', 60),
    ]);
    const all = (await computePositioningHistory(dsEcart, 0.05))!;
    const statut = all.byCabinet.get('CAB X')!.series.find((s) => s.seriesId === 'statut')!;
    expect(statut.points.map((p) => p.cabinet)).toEqual([-10, -10, -10]);
    expect(statut.points.map((p) => p.effectifs)).toEqual([[10, 5], [10, 10], [10, 10]]);
    expect(statut.points.map((p) => p.reliability)).toEqual(['descriptif', 'tendance', 'tendance']);
    expect(statut.segments.map((s) => s.pointille)).toEqual([true, false]);
    const niveauW = all.byCabinet.get('CAB W')!.series.find((s) => s.seriesId === 'niveau')!;
    expect(niveauW.points.map((p) => p.effectifs)).toEqual([[10], [11], [11]]);
    expect(niveauW.segments.map((s) => s.pointille)).toEqual([false, false]);
  });

  it('HHI exact du portefeuille et moyenne des cabinets', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const hhiA = all.byCabinet.get('CAB A')!.series.find((s) => s.seriesId === 'hhi')!;
    expect(hhiA.ficheNumero).toBe(10);
    // Avril : 12 PA + 6 PH adultes sur 18 → (12/18)² + (6/18)² = 5/9 ; CAB B reste à 1 (100 % PA).
    expect(hhiA.points.slice(0, 3).map((p) => p.cabinet)).toEqual([1, 1, 1]);
    expect(hhiA.points[3].cabinet).toBeCloseTo(5 / 9, 12);
    expect(hhiA.points.slice(0, 3).map((p) => p.ensemble)).toEqual([1, 1, 1]);
    expect(hhiA.points[3].ensemble).toBeCloseTo((5 / 9 + 1) / 2, 12);
    expect(hhiA.points.map((p) => p.nCabinetsEnsemble)).toEqual([2, 2, 2, 2]);
    expect(hhiA.segments.map((s) => s.pointille)).toEqual([true, true, false]);
  });

  it('cabinet minuscule : aucune valeur tracée, effectifs conservés, aucun NaN', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const c = all.byCabinet.get('CAB C')!;
    expect(c.series.length).toBeGreaterThan(0);
    for (const s of c.series) {
      if (s.kind === 'rang') continue;
      expect(s.points.every((p) => p.cabinet === null)).toBe(true);
      expect(s.firstMonth).toBeNull();
      expect(s.segments).toEqual([]);
    }
    for (const s of c.series) for (const p of s.points) {
      if (p.cabinet !== null) expect(Number.isFinite(p.cabinet)).toBe(true);
      if (p.ensemble !== null) expect(Number.isFinite(p.ensemble)).toBe(true);
    }
    const niveauC = c.series.find((s) => s.seriesId === 'niveau')!;
    expect(niveauC.points[niveauC.points.length - 1].effectifs).toEqual([2]);
    expect(niveauC.points[0].effectifs).toEqual([]);
    expect(SEUIL_POINT).toBe(5);
  });

  it('cabinet sans aucune évaluation datée : aucune valeur tracée, période absente, non datées comptées', async () => {
    const dsD = mkDataset([
      ...rows,
      ...Array.from({ length: 3 }, () => mkRow({ finessGeo: g(), cabinet: 'CAB D', score: 75, evalDate: null })),
    ]);
    const d = (await computePositioningHistory(dsD, 0.05))!.byCabinet.get('CAB D')!;
    expect(d.firstMonth).toBeNull();
    expect(d.lastMonth).toBeNull();
    expect(d.nDated).toBe(0);
    expect(d.nUndated).toBe(3);
    expect(d.series.length).toBeGreaterThan(0);
    expect(d.series.every((s) => s.firstMonth === null && s.segments.length === 0)).toBe(true);
  });

  it('régions : une série par région du cabinet, triée par effectif, et moyenne des cabinets', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const a = all.byCabinet.get('CAB A')!;
    const ids = a.series.filter((s) => s.kind === 'region').map((s) => s.seriesId);
    expect(ids).toEqual(['region:R1', 'region:R2']);
    const r2 = a.series.find((s) => s.seriesId === 'region:R2')!;
    expect(r2.ficheNumero).toBe(4);
    expect(r2.points.map((p) => p.cabinet)).toEqual([null, null, 90, 90]);
    const r1 = a.series.find((s) => s.seriesId === 'region:R1')!;
    // CAB A : 80 puis (6×80 + 6×70) / 12 = 75 ; CAB B : 60 puis 50 ; CAB C (2 évaluations) exclu.
    expect(r1.points.map((p) => p.cabinet)).toEqual([80, 80, 80, 75]);
    expect(r1.points.map((p) => p.ensemble)).toEqual([70, 70, 70, 62.5]);
    expect(r1.points.map((p) => p.nCabinetsEnsemble)).toEqual([2, 2, 2, 2]);
  });

  it('rang au méta-classement : ordre du classement publié, sans courbe d’ensemble', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const rangA = all.byCabinet.get('CAB A')!.series.find((s) => s.seriesId === 'rang')!;
    expect(rangA.ficheNumero).toBe(12);
    expect(rangA.points.every((p) => p.ensemble === null)).toBe(true);
    const attendu = sortMetaRanking(buildCabinetProfiles(extractRows(asOfDataset(ds, '2023-03')), 0.05))
      .findIndex((p) => p.cabinet === 'CAB A') + 1;
    expect(rangA.points[2].cabinet).toBe(attendu);
    expect(rangA.points[2].nCabinetsEnsemble).toBe(3);
    // Pointillé tant que l'effectif du cabinet est < 10 (6, 6, puis 12 et 18).
    expect(rangA.segments.map((s) => s.pointille)).toEqual([true, true, false]);
  });

  it('rang d’un cabinet sous le seuil : présent dès la première évaluation, tracé en pointillé', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const rangC = all.byCabinet.get('CAB C')!.series.find((s) => s.seriesId === 'rang')!;
    expect(rangC.points.map((p) => p.cabinet === null)).toEqual([true, false, false, false]);
    expect(rangC.points[3].effectifs).toEqual([2]);
    expect(rangC.segments).toHaveLength(2);
    expect(rangC.segments.every((s) => s.pointille)).toBe(true);
  });

  it('ordre des séries : fiches 3, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12 puis régions', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    expect(all.byCabinet.get('CAB A')!.series.map((s) => s.ficheNumero)).toEqual([3, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 4, 4]);
  });

  it('annulation : renvoie null sans terminer', async () => {
    let n = 0;
    const r = await computePositioningHistory(ds, 0.05, { cancelled: () => ++n > 1 });
    expect(r).toBeNull();
    expect(n).toBe(2);
  });

  it('rend la main une fois par mois calculé', async () => {
    let n = 0;
    const all = await computePositioningHistory(ds, 0.05, { yieldEach: async () => { n++; } });
    expect(n).toBe(all!.months.length);
  });

  it('ne modifie jamais le seuil global', async () => {
    const avant = significanceAlpha();
    await computePositioningHistory(ds, avant === 0.05 ? 0.01 : 0.05);
    expect(significanceAlpha()).toBe(avant);
  });
});

describe('tronquerHistorique', () => {
  it('coupe les points après le mois et recalcule bornes et segments', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const t = tronquerHistorique(all.byCabinet.get('CAB A')!, '2023-02');
    expect(t.months).toEqual(['2023-01', '2023-02']);
    const niveau = t.series.find((s) => s.seriesId === 'niveau')!;
    expect(niveau.points).toHaveLength(2);
    expect(niveau.lastMonth).toBe('2023-02');
    expect(niveau.segments).toEqual([{ i0: 0, v0: 80, i1: 1, v1: 80, cote: 'dessus', pointille: true }]);
    expect(niveau.points.map((p) => [p.cote, p.pointille])).toEqual([['dessus', true], ['dessus', true]]);
    expect(t.lastMonth).toBe('2023-02');
    expect(t.nDated).toBe(6);
  });

  it('ne garde que les régions où le cabinet a des évaluations au mois retenu', async () => {
    const all = (await computePositioningHistory(ds, 0.05))!;
    const t = tronquerHistorique(all.byCabinet.get('CAB A')!, '2023-02');
    expect(t.series.filter((s) => s.kind === 'region').map((s) => s.seriesId)).toEqual(['region:R1']);
    expect(t.series.map((s) => s.ficheNumero)).toEqual([3, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 4]);
  });

  it('région sous le seuil au mois retenu : conservée (effectif insuffisant), ordre par effectif à ce mois', async () => {
    // CAB Y : R1 compte 6 évaluations en janvier ; R2 en compte 2 en février puis 10 en mars.
    const r = (region: string, evalDate: string) => mkRow({ finessGeo: g(), cabinet: 'CAB Y', region, evalDate });
    const dsY = mkDataset([
      ...Array.from({ length: 6 }, () => r('R1', '2024-01-10')),
      ...Array.from({ length: 2 }, () => r('R2', '2024-02-10')),
      ...Array.from({ length: 8 }, () => r('R2', '2024-03-10')),
    ]);
    const all = (await computePositioningHistory(dsY, 0.05))!;
    const complet = all.byCabinet.get('CAB Y')!;
    expect(complet.series.filter((s) => s.kind === 'region').map((s) => s.seriesId)).toEqual(['region:R2', 'region:R1']);
    const t = tronquerHistorique(complet, '2024-02');
    const regions = t.series.filter((s) => s.kind === 'region');
    expect(regions.map((s) => s.seriesId)).toEqual(['region:R1', 'region:R2']);
    expect(regions[1].points.map((p) => p.cabinet)).toEqual([null, null]);
    expect(regions[1].points[1].effectifs).toEqual([2]);
  });
});

const DATA_REEL = join(__dirname, '..', 'data', 'generated');
describe.skipIf(!existsSync(join(DATA_REEL, 'meta.json')))('jeu réel', () => {
  let reel: Dataset;
  let all: PositioningHistoryAll;
  let dureeMs = 0;
  beforeAll(async () => {
    reel = await loadDataset(DATA_REEL);
    const t0 = Date.now();
    all = (await computePositioningHistory(reel, 0.05))!;
    dureeMs = Date.now() - t0;
  }, 60_000);

  it('dernier point = profil as-of du dernier mois (5 cabinets de plus grand effectif), en moins de 20 s', () => {
    expect(dureeMs).toBeLessThan(20_000);
    const dernier = all.months[all.months.length - 1];
    const lignes = extractRows(asOfDataset(reel, dernier));
    const profils = buildCabinetProfiles(lignes, 0.05);
    const rang = sortMetaRanking(profils);
    // Cabinets de plus grand effectif : leurs séries portent des valeurs tracées.
    const testes = [...profils].sort((a, b) => b.n - a.n).slice(0, 5);
    for (const p of testes) {
      const h = all.byCabinet.get(p.cabinet)!;
      const notes = lignes.filter((r) => r.cabinet === p.cabinet).map((r) => Number(r.score));
      const niveau = h.series.find((x) => x.seriesId === 'niveau')!;
      const dernierNiveau = niveau.points[niveau.points.length - 1];
      expect(dernierNiveau.effectifs).toEqual([notes.length]);
      if (notes.length >= SEUIL_POINT) {
        expect(dernierNiveau.cabinet).toBeCloseTo(notes.reduce((s, x) => s + x, 0) / notes.length, 9);
      } else {
        expect(dernierNiveau.cabinet).toBeNull();
      }
      for (const ax of p.axes) {
        const s = h.series.find((x) => x.seriesId === ax.axisId)!;
        const last = s.points[s.points.length - 1];
        const attendu = ax.nUnexposed >= 5 && ax.nExposed >= 5 ? ax.gap : null;
        expect(last.cabinet).toBe(attendu);
      }
      const hhi = h.series.find((x) => x.seriesId === 'hhi')!;
      expect(hhi.points[hhi.points.length - 1].cabinet).toBe(p.n >= 5 ? p.portfolio.hhi : null);
      const r = h.series.find((x) => x.seriesId === 'rang')!;
      expect(r.points[r.points.length - 1].cabinet).toBe(rang.findIndex((x) => x.cabinet === p.cabinet) + 1);
    }
  });

  it('le seuil alpha passé en paramètre est celui du classement', async () => {
    const all01 = (await computePositioningHistory(reel, 0.01))!;
    const dernier = all01.months[all01.months.length - 1];
    const profils01 = buildCabinetProfiles(extractRows(asOfDataset(reel, dernier)), 0.01);
    const rang01 = sortMetaRanking(profils01);
    let differences = 0;
    for (const [cabinet, h01] of all01.byCabinet) {
      const r01 = h01.series.find((x) => x.seriesId === 'rang')!;
      const r05 = all.byCabinet.get(cabinet)!.series.find((x) => x.seriesId === 'rang')!;
      const d01 = r01.points[r01.points.length - 1];
      const d05 = r05.points[r05.points.length - 1];
      const i = rang01.findIndex((x) => x.cabinet === cabinet);
      if (i >= 0) {
        expect(d01.cabinet).toBe(i + 1);
        expect(d01.axesSignales).toBe(rang01[i].nSignificantAxes);
      }
      if (d01.cabinet !== d05.cabinet || d01.axesSignales !== d05.axesSignales) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  }, 60_000);
});
