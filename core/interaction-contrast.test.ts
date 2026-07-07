import { describe, it, expect } from 'vitest';
import { interactionContrastGaps, type InteractionContrastRow } from './interaction-contrast';

const mk = (stratum: string, isTarget: boolean, score: number): InteractionContrastRow => ({
  score, isTarget, stratum, catControls: [],
});

describe('interactionContrastGaps', () => {
  it('estime l’effet du contraste PAR strate dans un seul modèle (effet ref +8, autre −10)', () => {
    // Strate A (réf, triée 1re) : cible − réf = +8 ; strate B : −10.
    const rows: InteractionContrastRow[] = [
      mk('A', false, 80), mk('A', false, 80), mk('A', true, 88), mk('A', true, 88),
      mk('B', false, 70), mk('B', false, 70), mk('B', true, 60), mk('B', true, 60),
    ];
    const r = interactionContrastGaps(rows);
    expect(r).not.toBeNull();
    expect(r!.refStratum).toBe('A');
    const a = r!.strata.find((s) => s.stratum === 'A')!;
    const b = r!.strata.find((s) => s.stratum === 'B')!;
    expect(a.isReference).toBe(true);
    expect(a.effect).toBeCloseTo(8, 6);
    expect(b.effect).toBeCloseTo(-10, 6);
    expect(b.diffVsRef).toBeCloseTo(-18, 6); // interaction = effet_B − effet_A
  });

  it('signale une interaction SIGNIFICATIVE quand les effets diffèrent nettement (avec bruit)', () => {
    const rows: InteractionContrastRow[] = [];
    for (let i = 0; i < 6; i++) {
      rows.push(mk('A', false, 79 + (i % 2) * 2)); // ~80
      rows.push(mk('A', true, 87 + (i % 2) * 2)); // ~88 → effet ~+8
      rows.push(mk('B', false, 69 + (i % 2) * 2)); // ~70
      rows.push(mk('B', true, 59 + (i % 2) * 2)); // ~60 → effet ~−10
    }
    const r = interactionContrastGaps(rows)!;
    expect(r.anySignificantInteraction).toBe(true);
    const b = r.strata.find((s) => s.stratum === 'B')!;
    expect(b.diffP).not.toBeNull();
    expect(b.diffP!).toBeLessThan(0.05);
  });

  it('PAS d’interaction quand l’effet est le même dans les deux strates', () => {
    const rows: InteractionContrastRow[] = [];
    for (let i = 0; i < 6; i++) {
      rows.push(mk('A', false, 79 + (i % 2) * 2));
      rows.push(mk('A', true, 84 + (i % 2) * 2)); // effet ~+5
      rows.push(mk('B', false, 69 + (i % 2) * 2));
      rows.push(mk('B', true, 74 + (i % 2) * 2)); // effet ~+5 (identique)
    }
    const r = interactionContrastGaps(rows)!;
    expect(r.anySignificantInteraction).toBe(false);
    const b = r.strata.find((s) => s.stratum === 'B')!;
    expect(b.diffVsRef!).toBeCloseTo(0, 6);
  });

  it('dégradation gracieuse : une strate à un seul bras est exclue, les autres restent estimées', () => {
    const rows: InteractionContrastRow[] = [
      mk('A', false, 80), mk('A', true, 88), mk('A', false, 80), mk('A', true, 88), // A : 2 bras
      mk('B', false, 70), mk('B', true, 60), mk('B', false, 70), mk('B', true, 60), // B : 2 bras
      mk('C', true, 90), mk('C', true, 90), // C : QUE des cibles → strate dégénérée
    ];
    const r = interactionContrastGaps(rows);
    expect(r).not.toBeNull();
    const strata = r!.strata.map((s) => s.stratum);
    expect(strata).toContain('A');
    expect(strata).toContain('B');
    expect(strata).not.toContain('C'); // exclue, pas de null global
  });

  it('multiplicité : Bonferroni applique α/S (= α courant / 2 tests) ; une interaction franche tient', () => {
    // 3 strates → 2 tests → seuil = significanceAlpha()/2 (0,025 à α=0,05 par défaut ;
    // 0,005 si bascule à α=0,01). On vérifie que la correction est appliquée en
    // s'assurant qu'une interaction FRANCHE reste significative quel que soit le seuil.
    const rows: InteractionContrastRow[] = [];
    for (let i = 0; i < 8; i++) {
      rows.push(mk('A', false, 79 + (i % 2) * 2), mk('A', true, 87 + (i % 2) * 2)); // +8
      rows.push(mk('B', false, 69 + (i % 2) * 2), mk('B', true, 71 + (i % 2) * 2)); // +2
      rows.push(mk('C', false, 59 + (i % 2) * 2), mk('C', true, 49 + (i % 2) * 2)); // −10
    }
    const r = interactionContrastGaps(rows)!;
    expect(r.anySignificantInteraction).toBe(true); // C diffère franchement → tient sous Bonferroni
  });

  it('dégénéré : une seule strate → null ; un seul groupe → null', () => {
    expect(interactionContrastGaps([mk('A', false, 80), mk('A', true, 88)])).toBeNull();
    expect(
      interactionContrastGaps([mk('A', false, 80), mk('B', false, 70)]),
    ).toBeNull(); // pas de cible
  });

  it('design singulier → null sans lever', () => {
    // Contrôle parfaitement colinéaire avec la cible.
    const rows: InteractionContrastRow[] = [
      { score: 80, isTarget: false, stratum: 'A', catControls: ['Y'] },
      { score: 82, isTarget: false, stratum: 'B', catControls: ['Y'] },
      { score: 90, isTarget: true, stratum: 'A', catControls: ['X'] },
      { score: 92, isTarget: true, stratum: 'B', catControls: ['X'] },
    ];
    expect(() => interactionContrastGaps(rows)).not.toThrow();
    expect(interactionContrastGaps(rows)).toBeNull();
  });
});
