import { describe, it, expect } from 'vitest';
import {
  collectVerificationText,
  buildTwoGroupVerification,
  type TwoGroupVerification,
  type MetaVerification,
  type ContrastVerifInput,
} from './fiche-verification';

describe('buildTwoGroupVerification', () => {
  const base: ContrastVerifInput = {
    label: 'Privé commercial vs Public',
    gap: -4.0,
    gapAdj: -1.0,
    ciLow: -2.0,
    ciHigh: 0.0,
    p: 0.2,
    n: 4500,
    verif: { nReference: 3000, nTarget: 1500, meanReference: 76.0, meanTarget: 72.0, sdReference: 14.2, sdTarget: 16.1, se: 0.51, t: -1.96, k: 18, ciLevel: 0.95 },
  };

  it('groupes [référence, cible] depuis « Cible vs Référence » ; réconciliation écart brut', () => {
    const v = buildTwoGroupVerification([base], { controls: 'secteur et région', sources: [{ libelle: 'HAS', date: null }] })!;
    expect(v.kind).toBe('two-group');
    const c = v.contrasts[0];
    expect(c.groups[0].label).toBe('Public'); // référence (après « vs »)
    expect(c.groups[1].label).toBe('Privé commercial'); // cible (avant « vs »)
    expect(c.groups[0]).toMatchObject({ n: 3000, mean: 76.0, sd: 14.2 });
    expect(c.groups[1]).toMatchObject({ n: 1500, mean: 72.0, sd: 16.1 });
    expect(c.ecartBrut).toBe(-4.0);
    // INVARIANT : écart brut == moyenne(cible) − moyenne(référence)
    expect(c.ecartBrut).toBeCloseTo((c.groups[1].mean ?? 0) - (c.groups[0].mean ?? 0), 9);
  });

  it('bloc ajusté : β/SE/t/ddl=n−k/contrôles/HC0 ; ddl = 4500 − 18', () => {
    const a = buildTwoGroupVerification([base], { controls: 'secteur et région', sources: [] })!.contrasts[0].ajuste!;
    expect(a).toMatchObject({ beta: -1.0, se: 0.51, t: -1.96, ciLow: -2.0, ciHigh: 0.0, pMethod: 'normale', seType: 'HC0', controls: 'secteur et région', k: 18 });
    expect(a.ddl).toBe(4500 - 18);
  });

  it('pas de bloc ajusté si l’OLS n’a pas convergé (gapAdj/se null)', () => {
    const noAdj: ContrastVerifInput = { ...base, gapAdj: null, ciLow: null, ciHigh: null, p: null, verif: { ...base.verif!, se: null, t: null, k: null } };
    const c = buildTwoGroupVerification([noAdj], { controls: 'x', sources: [] })!.contrasts[0];
    expect(c.ajuste).toBeUndefined();
    expect(c.ecartBrut).toBe(-4.0); // la table brute reste
  });

  it('omet un contraste sans `verif` ; undefined si aucun contraste exploitable', () => {
    const noVerif: ContrastVerifInput = { label: 'A vs B', gap: 1, verif: undefined };
    expect(buildTwoGroupVerification([noVerif], { controls: 'x', sources: [] })).toBeUndefined();
    const v = buildTwoGroupVerification([noVerif, base], { controls: 'x', sources: [] })!;
    expect(v.contrasts).toHaveLength(1); // seul `base` (avec verif) retenu
  });
});

const TWO_GROUP: TwoGroupVerification = {
  kind: 'two-group',
  contrasts: [
    {
      label: 'Multi vs Mono',
      groups: [
        { label: 'Mono (référence)', n: 3214, mean: 76.2, sd: 18.2 },
        { label: 'Multi (cible)', n: 15581, mean: 81.4, sd: 13.9 },
      ],
      ecartBrut: 5.2,
      ajuste: {
        beta: 4.06, se: 0.34, t: 11.9, ddl: 18765, ciLow: 3.4, ciHigh: 4.7,
        ciLevel: 0.95, p: 5.8e-33, pMethod: 'normale', seType: 'HC0',
        controls: 'région, statut, catégorie', k: 30,
      },
    },
  ],
  sources: [{ libelle: 'HAS / Synaé open_data_par_essms (ODbL)', date: '01/07/2026' }],
  note: 'Détail par cabinet : voir le fichier joint.',
};

const META: MetaVerification = {
  kind: 'meta',
  regle: 'Axe non conforme = écart fiable (n ≥ 30/30) ET significatif.',
  renvoi: 'Classement complet : voir le fichier joint.',
  sources: [{ libelle: 'HAS / Synaé (ODbL)', date: '01/07/2026' }],
};

describe('collectVerificationText', () => {
  it('two-group : remonte labels, groupes, contrôles, sources, note', () => {
    const txt = collectVerificationText(TWO_GROUP);
    expect(txt).toContain('Multi vs Mono');
    expect(txt).toContain('Mono (référence)');
    expect(txt).toContain('Multi (cible)');
    expect(txt).toContain('région, statut, catégorie');
    expect(txt.some((t) => t.includes('Synaé'))).toBe(true);
    expect(txt).toContain('Détail par cabinet : voir le fichier joint.');
  });

  it('meta : remonte règle, renvoi, sources', () => {
    const txt = collectVerificationText(META);
    expect(txt.some((t) => t.includes('non conforme'))).toBe(true);
    expect(txt.some((t) => t.includes('Classement complet'))).toBe(true);
    expect(txt.some((t) => t.includes('Synaé'))).toBe(true);
  });
});
