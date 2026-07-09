import { describe, it, expect } from 'vitest';
import type { Dataset, EssmsRow } from '../store/types';
import { cotationGeneralView, cotationReliability, cotationCabinetProfile, cotationCoverage } from './cotations';
import type { BaseDocRow } from '../store/types';

function mkRow(p: Partial<EssmsRow> & { finessGeo: string; cabinet: string }): EssmsRow {
  return {
    finessGeo: p.finessGeo, score: p.score === undefined ? 80 : p.score, cabinet: p.cabinet,
    raisonSociale: p.raisonSociale ?? null, region: '', statut: '', categ: '',
    categCode: '', departement: '', evalDate: p.evalDate ?? '2025-01-01',
    grade: p.grade ?? null, chapters: p.chapters ?? [null, null, null],
    imperatives: p.imperatives ?? [], ciEvaluated: p.ciEvaluated ?? null,
    ciMet: p.ciMet ?? null, ciAbove35: p.ciAbove35 ?? null,
  };
}
function mkDataset(essms: EssmsRow[]): Dataset {
  return { meta: { builtAt: '', hasSyncedAt: '', finessSnapshotMax: '', sources: [] },
    essms, ejSnapshots: [], capacitySnapshots: [], baseDoc: [], evalHistory: [] };
}

describe('cotationGeneralView', () => {
  it('parts A/B/C/D, moyennes de chapitre, synthèse CI, palier de fiabilité', () => {
    const ds = mkDataset([
      mkRow({ finessGeo: '1', cabinet: 'CAB A', grade: 'A', chapters: [3, 2, 2], ciEvaluated: 8, ciMet: 8, ciAbove35: 2 }),
      mkRow({ finessGeo: '2', cabinet: 'CAB A', grade: 'C', chapters: [1, null, 4], ciEvaluated: 2, ciMet: 1, ciAbove35: 0 }),
    ]);
    const [row] = cotationGeneralView(ds);
    expect(row.cabinet).toBe('CAB A');
    expect(row.nStructures).toBe(2);
    expect(row.gradeShare).toEqual({ A: 0.5, B: 0, C: 0.5, D: 0 });
    expect(row.chapterMeans[0]).toBe(2);        // (3+1)/2
    expect(row.chapterMeans[1]).toBe(2);        // seul 2 (l'autre null)
    expect(row.imperativeSummary.meanEvaluated).toBe(5);   // (8+2)/2
    expect(row.imperativeSummary.metRate).toBeCloseTo(9 / 10);
    expect(row.imperativeSummary.above35Rate).toBeCloseTo(2 / 10);
    expect(row.reliability).toBe('descriptif'); // n=2 < 10
  });
  it('exclut les cabinets sans structure scorée (cohérent avec listCabinets)', () => {
    const ds = mkDataset([mkRow({ finessGeo: '3', cabinet: 'CAB VIDE', score: null })]);
    expect(cotationGeneralView(ds)).toHaveLength(0);
  });
  it('cotationReliability applique les seuils 30/10', () => {
    expect(cotationReliability(30)).toBe('fiable');
    expect(cotationReliability(10)).toBe('tendance');
    expect(cotationReliability(9)).toBe('descriptif');
  });
});

describe('cotationCabinetProfile', () => {
  it('détail des critères impératifs (moyenne + effectif) et liste des structures', () => {
    const essms = [
      mkRow({ finessGeo: '100000001', cabinet: 'CAB A', score: 60, grade: 'C', chapters: [2, 2, 2],
        imperatives: [{ code: '2.2.1', value: 2 }, { code: '2.4.3', value: 3 }] }),
      mkRow({ finessGeo: '100000002', cabinet: 'CAB A', score: 90, grade: 'A', chapters: [4, 3, 3],
        imperatives: [{ code: '2.2.1', value: 4 }] }),
    ];
    const baseDoc: BaseDocRow[] = [{ finessGeo: '100000001', officialLabel: 'EHPAD X',
      addressLine1: null, addressLine2: null, postalCode: '75001', commune: 'Paris' }];
    const ds = mkDataset(essms);
    ds.baseDoc = baseDoc;
    const p = cotationCabinetProfile(ds, 'CAB A')!;
    expect(p.nStructures).toBe(2);
    // Critère 2.2.1 : présent 2 fois (moyenne 3) ; 2.4.3 : présent 1 fois (moyenne 3).
    expect(p.imperatives).toContainEqual({ code: '2.2.1', mean: 3, nStructures: 2 });
    expect(p.imperatives).toContainEqual({ code: '2.4.3', mean: 3, nStructures: 1 });
    // Structures triées par score croissant ; nom/commune depuis base-doc, repli FINESS sinon.
    expect(p.establishments[0].finessGeo).toBe('100000001');
    expect(p.establishments[0].name).toBe('EHPAD X');
    expect(p.establishments[0].commune).toBe('Paris');
    expect(p.establishments[1].name).toBe('FINESS 100000002');
    expect(p.establishments[1].commune).toBe('');
  });
  it('cabinet inconnu → null', () => {
    expect(cotationCabinetProfile(mkDataset([]), 'ABSENT')).toBeNull();
  });
});

describe('cotationCoverage', () => {
  it('mesure les taux de présence des cotations', () => {
    const ds = mkDataset([
      mkRow({ finessGeo: '1', cabinet: 'A', grade: 'A', chapters: [3, null, null], imperatives: [{ code: '2.2.1', value: 3 }] }),
      mkRow({ finessGeo: '2', cabinet: 'A' }), // aucune cotation
    ]);
    const c = cotationCoverage(ds);
    expect(c.nScored).toBe(2);
    expect(c.gradedRate).toBe(0.5);
    expect(c.chapterRate).toBe(0.5);
    expect(c.imperativeRate).toBe(0.5);
  });
});
