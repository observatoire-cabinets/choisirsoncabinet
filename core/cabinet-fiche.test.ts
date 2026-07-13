import { describe, it, expect } from 'vitest';
import type { Dataset, EssmsRow } from '../store/types';
import { asOfDataset, buildFicheCabinet } from './cabinet-fiche';

function mkRow(p: Partial<EssmsRow> & { finessGeo: string }): EssmsRow {
  return {
    finessGeo: p.finessGeo,
    score: p.score === undefined ? 80 : p.score,
    cabinet: p.cabinet === undefined ? 'CAB A' : p.cabinet,
    raisonSociale: null, region: 'R1',
    statut: p.statut ?? 'Public', categ: '', categCode: p.categCode ?? '500',
    departement: '75',
    evalDate: p.evalDate === undefined ? '2023-05-10' : p.evalDate,
    grade: p.grade ?? null, chapters: p.chapters ?? [null, null, null],
    imperatives: [], ciEvaluated: null, ciMet: null, ciAbove35: null,
  };
}

/** Un snapshot EJ ancien par structure (ejSize=1) : l'INNER JOIN as-of garde toutes les lignes. */
function mkDataset(essms: EssmsRow[]): Dataset {
  return {
    meta: { builtAt: '', hasSyncedAt: '2026-07-01', finessSnapshotMax: '2026-06-01', sources: [] },
    essms,
    ejSnapshots: essms.map((e) => ({ snapshotDate: '2020-01-01', finessGeo: e.finessGeo, ejSize: 1 })),
    capacitySnapshots: [], baseDoc: [], evalHistory: [],
  };
}

// CAB A : 3 évals (2 datées + 1 sans date) ; CAB B : 1 éval datée.
function sampleDataset(): Dataset {
  return mkDataset([
    mkRow({ finessGeo: '000000001', score: 80, evalDate: '2023-01-15', grade: 'A' }),
    mkRow({ finessGeo: '000000002', score: 90, evalDate: '2023-03-20', grade: 'C' }),
    mkRow({ finessGeo: '000000003', score: 70, evalDate: null }),
    mkRow({ finessGeo: '000000004', score: 60, evalDate: '2023-02-10', cabinet: 'CAB B' }),
  ]);
}

describe('asOfDataset', () => {
  it('null → dataset inchangé (même référence)', () => {
    const ds = sampleDataset();
    expect(asOfDataset(ds, null)).toBe(ds);
  });
  it('borne de mois : garde les évals datées <= fin de mois, exclut les non datées', () => {
    const ds = sampleDataset();
    const cut = asOfDataset(ds, '2023-02');
    expect(cut.essms.map((e) => e.finessGeo)).toEqual(['000000001', '000000004']);
    // Les autres tables ne sont pas touchées (les snapshots restent per-éval as-of).
    expect(cut.ejSnapshots).toBe(ds.ejSnapshots);
  });
});

describe('buildFicheCabinet', () => {
  it('fiche courante : n, niveau global, 7 axes, portefeuille, résumé cotations, période', () => {
    const f = buildFicheCabinet(sampleDataset(), 'CAB A');
    expect(f).not.toBeNull();
    expect(f!.asOfMonth).toBeNull();
    expect(f!.n).toBe(3); // la fiche courante inclut l'éval non datée (parité onglets existants)
    // niveau global = moyenne CAB A (80) - moyenne des lignes avec cabinet (75)
    expect(f!.niveauGlobal).toBeCloseTo(5, 6);
    expect(f!.axes).toHaveLength(7);
    expect(f!.axes[0].axisId).toBe('mono_multi');
    expect(f!.nSignificantAxes).toBe(0); // effectifs minuscules : rien de « signalé »
    expect(f!.reliability).toBe('descriptif');
    expect(f!.periodStart).toBe('2023-01-15');
    expect(f!.periodEnd).toBe('2023-03-20');
    // Portefeuille : toutes les évals du cabinet comptées, un seul code catégorie
    const counts = Object.values(f!.portfolio.secteurCounts).reduce((s, x) => s + x, 0);
    expect(counts).toBe(3);
    expect(f!.portfolio.dominantShare).toBe(1);
    // Résumé cotations : 2 gradées sur 3 scorées → A 50 % / C 50 %
    expect(f!.cotations).not.toBeNull();
    expect(f!.cotations!.nStructures).toBe(3);
    expect(f!.cotations!.gradeShare.A).toBeCloseTo(0.5, 6);
    expect(f!.cotations!.gradeShare.C).toBeCloseTo(0.5, 6);
    expect(f!.nStructures).toBe(3);
  });

  it('fiche as-of : seules les évals closes <= fin de mois comptent', () => {
    const f = buildFicheCabinet(sampleDataset(), 'CAB A', '2023-02');
    expect(f!.asOfMonth).toBe('2023-02');
    expect(f!.n).toBe(1);
    // 80 - moyenne(80, 60) = +10
    expect(f!.niveauGlobal).toBeCloseTo(10, 6);
    expect(f!.periodStart).toBe('2023-01-15');
    expect(f!.periodEnd).toBe('2023-01-15');
  });

  it('cabinet absent à la borne, ou inconnu → null', () => {
    expect(buildFicheCabinet(sampleDataset(), 'CAB A', '2022-12')).toBeNull();
    expect(buildFicheCabinet(sampleDataset(), 'INCONNU')).toBeNull();
  });

  it('divergence des deux univers : une structure sans snapshot EJ sort du moteur 7 axes mais reste dans cotations/structures', () => {
    const ds = mkDataset([
      mkRow({ finessGeo: '000000001', score: 80, evalDate: '2023-01-15' }),
      mkRow({ finessGeo: '000000002', score: 90, evalDate: '2023-03-20' }),
      mkRow({ finessGeo: '000000003', score: 70, evalDate: '2023-02-10' }),
    ]);
    // L'INNER JOIN EJ as-of élimine la structure sans snapshot du seul univers 7 axes.
    ds.ejSnapshots = ds.ejSnapshots.filter((s) => s.finessGeo !== '000000003');
    const f = buildFicheCabinet(ds, 'CAB A');
    expect(f).not.toBeNull();
    expect(f!.n).toBe(2); // univers du moteur 7 axes (INNER JOIN EJ)
    expect(f!.nStructures).toBe(3); // univers essms scorées (sans jointure EJ)
    expect(f!.cotations!.nStructures).toBe(3);
    expect(f!.n).toBeLessThan(f!.nStructures);
  });

  it('dataset vide → null', () => {
    expect(buildFicheCabinet(mkDataset([]), 'X')).toBeNull();
  });
});
