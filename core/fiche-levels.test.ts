// core/fiche-levels.test.ts
import { describe, it, expect } from 'vitest';
import { BLOC_LEVELS, NIVEAU_LABELS, groupBlocsByLevel } from './fiche-levels';
import type { FicheBlocs } from './fiche-001-content';

// Ordre de rendu (miroir de BLOCS dans fiche-pdf.ts) pour les tests. NB : heading
// 'Annexe' abrégé ici ; le vrai BLOCS porte 'Annexe — Métadonnées'. Sans impact :
// groupBlocsByLevel route par `key`, le `heading` est opaque.
const ORDER: ReadonlyArray<{ key: keyof FicheBlocs; heading: string }> = [
  { key: 'enClair', heading: 'En clair' },
  { key: 'question', heading: 'La question posée' },
  { key: 'methode', heading: 'Données et méthode' },
  { key: 'resultats', heading: 'Résultats' },
  { key: 'interpretation', heading: 'Interprétation' },
  { key: 'limites', heading: 'Limites' },
  { key: 'misePerspective', heading: 'Mise en perspective' },
  { key: 'implications', heading: 'Implications' },
  { key: 'cabinets', heading: 'Pratique par cabinet évaluateur' },
  { key: 'annexe', heading: 'Annexe' },
];

function fullBlocs(extra: Partial<FicheBlocs> = {}): FicheBlocs {
  return {
    enClair: 'e', question: 'q', methode: 'm', resultats: 'r', interpretation: 'i',
    limites: 'l', misePerspective: 'p', implications: 'im', annexe: 'a', ...extra,
  };
}

describe('BLOC_LEVELS', () => {
  it('mappe enClair sur essentiel, le bloc question sur pour-comprendre, limites sur pour-verifier', () => {
    expect(BLOC_LEVELS.enClair).toBe('essentiel');
    expect(BLOC_LEVELS.question).toBe('pour-comprendre');
    expect(BLOC_LEVELS.limites).toBe('pour-verifier');
    expect(BLOC_LEVELS.cabinets).toBe('pour-verifier');
  });

  it('aligne sur le modèle de référence : méthode + résultats en pour-verifier, implications en pour-comprendre', () => {
    expect(BLOC_LEVELS.methode).toBe('pour-verifier');
    expect(BLOC_LEVELS.resultats).toBe('pour-verifier');
    expect(BLOC_LEVELS.implications).toBe('pour-comprendre');
  });

  it('a un libellé « Niveau N — X » pour chaque niveau', () => {
    expect(NIVEAU_LABELS.essentiel).toBe("Niveau 1 — L'essentiel");
    expect(NIVEAU_LABELS['pour-comprendre']).toBe('Niveau 2 — Pour comprendre');
    expect(NIVEAU_LABELS['pour-verifier']).toBe('Niveau 3 — Pour vérifier');
  });

  it('pourquoi + verdict (synthèse de tête) sont en essentiel, devant En clair', () => {
    expect(BLOC_LEVELS.pourquoi).toBe('essentiel');
    expect(BLOC_LEVELS.verdict).toBe('essentiel');
    const order: ReadonlyArray<{ key: keyof FicheBlocs; heading: string }> = [
      { key: 'pourquoi', heading: 'Pourquoi cette fiche' },
      { key: 'verdict', heading: 'Verdict en une phrase' },
      ...ORDER,
    ];
    const groups = groupBlocsByLevel(fullBlocs({ pourquoi: 'p', verdict: 'v' }), order);
    expect(groups[0].blocs.map((b) => b.key)).toEqual(['pourquoi', 'verdict', 'enClair']);
  });
});

describe('groupBlocsByLevel', () => {
  it('regroupe une fiche complète (sans cabinets) en 3 niveaux ordonnés', () => {
    const groups = groupBlocsByLevel(fullBlocs(), ORDER);
    expect(groups.map((g) => g.niveau)).toEqual(['essentiel', 'pour-comprendre', 'pour-verifier']);
    expect(groups[0].blocs.map((b) => b.key)).toEqual(['enClair']);
    expect(groups[1].blocs.map((b) => b.key)).toEqual(['question', 'interpretation', 'implications']);
    expect(groups[2].blocs.map((b) => b.key)).toEqual(['methode', 'resultats', 'limites', 'misePerspective', 'annexe']);
  });

  it('place le bloc cabinets (présent) dans pour-verifier, dans l’ordre de ORDER', () => {
    const groups = groupBlocsByLevel(fullBlocs({ cabinets: 'c' }), ORDER);
    const verifier = groups.find((g) => g.niveau === 'pour-verifier')!;
    expect(verifier.blocs.map((b) => b.key)).toEqual(['methode', 'resultats', 'limites', 'misePerspective', 'cabinets', 'annexe']);
  });

  it('omet un bloc vide et un niveau entièrement vide', () => {
    const onlyEssentiel = { ...fullBlocs(), question: '', methode: '', resultats: '', interpretation: '', limites: '', misePerspective: '', implications: '', annexe: '' };
    const groups = groupBlocsByLevel(onlyEssentiel, ORDER);
    expect(groups.map((g) => g.niveau)).toEqual(['essentiel']);
    expect(groups[0].blocs.map((b) => b.key)).toEqual(['enClair']);
  });

  it('porte le heading de ORDER dans chaque bloc rendu', () => {
    const groups = groupBlocsByLevel(fullBlocs(), ORDER);
    expect(groups[1].blocs[0]).toEqual({ key: 'question', heading: 'La question posée', body: 'q' });
  });
});
