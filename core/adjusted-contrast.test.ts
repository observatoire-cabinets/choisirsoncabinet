import { describe, it, expect } from 'vitest';
import { adjustedContrastGap, type AdjustedContrastRow } from './adjusted-contrast';
import { analyzeMonoMulti, type MonoMultiRow } from './mono-multi-analysis';

describe('adjustedContrastGap', () => {
  it('sans contrôle → le gap ajusté égale la différence brute des moyennes', () => {
    const rows: AdjustedContrastRow[] = [
      { score: 80, isTarget: false, catControls: [] },
      { score: 84, isTarget: false, catControls: [] },
      { score: 90, isTarget: true, catControls: [] },
      { score: 96, isTarget: true, catControls: [] },
    ];
    // brut : moyenne cible (93) − moyenne référence (82) = +11
    const r = adjustedContrastGap(rows);
    expect(r).not.toBeNull();
    expect(r!.gap).toBeCloseTo(11, 6);
    expect(r!.nReference).toBe(2);
    expect(r!.nTarget).toBe(2);
  });

  it('dé-confond : le gap ajusté récupère l’effet intra-strate là où le brut s’inverse', () => {
    // Effet vrai homogène = +2 dans chaque strate. Mais la référence est
    // concentrée dans la strate haute (90) et la cible dans la strate basse (70)
    // → le brut s’inverse à −8. Contrôler la strate doit récupérer +2.
    const rows: AdjustedContrastRow[] = [
      { score: 90, isTarget: false, catControls: ['H'] },
      { score: 90, isTarget: false, catControls: ['H'] },
      { score: 90, isTarget: false, catControls: ['H'] },
      { score: 70, isTarget: false, catControls: ['L'] },
      { score: 92, isTarget: true, catControls: ['H'] },
      { score: 72, isTarget: true, catControls: ['L'] },
      { score: 72, isTarget: true, catControls: ['L'] },
      { score: 72, isTarget: true, catControls: ['L'] },
    ];
    // brut : cible (92+72+72+72)/4 = 77 ; référence (90·3+70)/4 = 85 → −8
    const raw = adjustedContrastGap(rows.map((r) => ({ ...r, catControls: [] })));
    expect(raw!.gap).toBeCloseTo(-8, 6);
    // ajusté sur la strate → +2 (et inversion de signe vs brut)
    const adj = adjustedContrastGap(rows);
    expect(adj!.gap).toBeCloseTo(2, 6);
  });

  it('dégénéré : un groupe vide → null', () => {
    const rows: AdjustedContrastRow[] = [
      { score: 80, isTarget: false, catControls: [] },
      { score: 84, isTarget: false, catControls: [] },
    ];
    expect(adjustedContrastGap(rows)).toBeNull();
  });

  it('design SINGULIER (contrôle colinéaire avec la cible) → null, sans lever d’exception', () => {
    // Le contrôle catégoriel sépare parfaitement les groupes (toutes les cibles
    // dans une modalité, toutes les références dans l’autre) → XtX non inversible.
    const rows: AdjustedContrastRow[] = [
      { score: 80, isTarget: false, catControls: ['Y'] },
      { score: 82, isTarget: false, catControls: ['Y'] },
      { score: 90, isTarget: true, catControls: ['X'] },
      { score: 92, isTarget: true, catControls: ['X'] },
    ];
    expect(() => adjustedContrastGap(rows)).not.toThrow();
    expect(adjustedContrastGap(rows)).toBeNull();
  });

  it('contrôle continu : neutralise un covariable numérique confondant', () => {
    // score = 1*x ; cible a un x plus bas → brut négatif, mais à x égal aucun effet propre.
    const mk = (x: number, isTarget: boolean): AdjustedContrastRow => ({
      score: x, isTarget, catControls: [], numControls: [x],
    });
    const rows = [mk(100, false), mk(98, false), mk(40, true), mk(38, true)];
    const adj = adjustedContrastGap(rows);
    // à x contrôlé, l’effet propre de la cible est ~0
    expect(adj!.gap).toBeCloseTo(0, 4);
  });

  it('golden : reproduit le β ajusté de analyzeMonoMulti (même design)', () => {
    const mm: MonoMultiRow[] = [
      { score: 78, isMulti: false, region: 'A', statut: 'Pub', categ: 'X' },
      { score: 82, isMulti: false, region: 'A', statut: 'Com', categ: 'Y' },
      { score: 75, isMulti: false, region: 'B', statut: 'Pub', categ: 'X' },
      { score: 80, isMulti: false, region: 'B', statut: 'Com', categ: 'Y' },
      { score: 85, isMulti: true, region: 'A', statut: 'Pub', categ: 'Y' },
      { score: 88, isMulti: true, region: 'A', statut: 'Com', categ: 'X' },
      { score: 83, isMulti: true, region: 'B', statut: 'Pub', categ: 'Y' },
      { score: 90, isMulti: true, region: 'B', statut: 'Com', categ: 'X' },
    ];
    const ref = analyzeMonoMulti(mm);
    const rows: AdjustedContrastRow[] = mm.map((r) => ({
      score: r.score,
      isTarget: r.isMulti,
      catControls: [r.region, r.statut, r.categ],
    }));
    const adj = adjustedContrastGap(rows);
    expect(adj!.gap).toBeCloseTo(ref.betaAdj, 6);
    expect(adj!.se).toBeCloseTo(ref.se, 6);
  });
});
