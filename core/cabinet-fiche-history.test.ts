import { describe, it, expect } from 'vitest';
import type { Dataset, EssmsRow } from '../store/types';
import { cabinetFicheHistory } from './cabinet-fiche-history';
import { buildFicheCabinet } from './cabinet-fiche';

function mkRow(p: Partial<EssmsRow> & { finessGeo: string }): EssmsRow {
  return {
    finessGeo: p.finessGeo,
    score: p.score === undefined ? 80 : p.score,
    cabinet: p.cabinet === undefined ? 'CAB A' : p.cabinet,
    raisonSociale: null, region: 'R1',
    statut: 'Public', categ: '', categCode: '500', departement: '75',
    evalDate: p.evalDate === undefined ? '2023-05-10' : p.evalDate,
    grade: p.grade ?? null, chapters: [null, null, null],
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

// CAB A : janv (80, A), mars (90, C), + 1 non datée ; CAB B : févr (60).
const ds = mkDataset([
  mkRow({ finessGeo: '000000001', score: 80, evalDate: '2023-01-15', grade: 'A' }),
  mkRow({ finessGeo: '000000002', score: 90, evalDate: '2023-03-20', grade: 'C' }),
  mkRow({ finessGeo: '000000003', score: 70, evalDate: null }),
  mkRow({ finessGeo: '000000004', score: 60, evalDate: '2023-02-10', cabinet: 'CAB B' }),
]);

describe('cabinetFicheHistory', () => {
  it('série mensuelle du 1er mois du cabinet au dernier mois du jeu, cumulative', () => {
    const h = cabinetFicheHistory(ds, 'CAB A');
    expect(h).not.toBeNull();
    expect(h!.rows.map((r) => r.month)).toEqual(['2023-01', '2023-02', '2023-03']);
    // n cumulatif (évals datées du cabinet, univers moteur 7 axes)
    expect(h!.rows.map((r) => r.n)).toEqual([1, 1, 2]);
    // niveau global par mois : moyenne cabinet - moyenne des lignes avec cabinet, à la borne
    expect(h!.rows[0].niveauGlobal).toBeCloseTo(0, 6);        // 80 - 80
    expect(h!.rows[1].niveauGlobal).toBeCloseTo(10, 6);       // 80 - (80+60)/2
    expect(h!.rows[2].niveauGlobal).toBeCloseTo(85 - 230 / 3, 6);
    // % grade A parmi les gradées du cabinet, à la borne
    expect(h!.rows[0].gradeAShare).toBeCloseTo(1, 6);
    expect(h!.rows[2].gradeAShare).toBeCloseTo(0.5, 6);
    // L'éval non datée est exclue de l'historique et comptée
    expect(h!.nUndated).toBe(1);
  });

  it('cabinet inconnu → null', () => {
    expect(cabinetFicheHistory(ds, 'INCONNU')).toBeNull();
  });

  it('parité avec la fiche du même mois : mêmes n et niveau global', () => {
    const h = cabinetFicheHistory(ds, 'CAB A')!;
    const f = buildFicheCabinet(ds, 'CAB A', '2023-03');
    expect(f).not.toBeNull();
    expect(h.rows[2].n).toBe(f!.n);
    expect(h.rows[2].niveauGlobal).toBeCloseTo(f!.niveauGlobal!, 10);
  });

  it('cabinet connu mais sans aucune éval datée → rows vides + nUndated', () => {
    const dsC = mkDataset([
      mkRow({ finessGeo: '000000010', cabinet: 'CAB C', evalDate: null }),
      mkRow({ finessGeo: '000000011', cabinet: 'CAB C', evalDate: null }),
    ]);
    const h = cabinetFicheHistory(dsC, 'CAB C');
    expect(h).not.toBeNull();
    expect(h!.cabinet).toBe('CAB C');
    expect(h!.rows).toHaveLength(0);
    expect(h!.nUndated).toBe(2);
  });

  it('gradeAShare null si aucune éval gradée du cabinet', () => {
    // CAB D : une éval datée mais SANS grade (grade null par défaut dans mkRow).
    const dsD = mkDataset([
      mkRow({ finessGeo: '000000020', cabinet: 'CAB D', score: 72, evalDate: '2023-04-05' }),
    ]);
    const h = cabinetFicheHistory(dsD, 'CAB D')!;
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].gradeAShare).toBeNull();
  });

  it('cabinet à un seul mois (première = dernière éval datée du jeu) → une seule ligne', () => {
    const dsE = mkDataset([
      mkRow({ finessGeo: '000000030', cabinet: 'CAB E', score: 75, evalDate: '2024-06-12', grade: 'A' }),
      mkRow({ finessGeo: '000000031', cabinet: 'CAB F', score: 65, evalDate: '2024-06-03' }),
    ]);
    const h = cabinetFicheHistory(dsE, 'CAB E')!;
    expect(h.rows.map((r) => r.month)).toEqual(['2024-06']);
    expect(h.rows[0].n).toBe(1);
    expect(h.rows[0].niveauGlobal).toBeCloseTo(75 - 70, 6); // 75 - (75+65)/2
    expect(h.nUndated).toBe(0);
  });
});
