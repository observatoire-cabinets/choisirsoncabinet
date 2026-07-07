import { describe, it, expect } from 'vitest';
import { buildFiche002Content } from './fiche-002-content';
import { serializeFicheContent } from './fiche-001-content';

const GAPS = [
  { label: 'Privé à but non lucratif vs Public', gap: 6.1 },
  { label: 'Privé commercial vs Public', gap: -2.3 },
];

const CABINETS = [
  {
    label: 'Privé à but non lucratif vs Public',
    summary: { totalCabinets: 130, nFiable: 30, nTendance: 40, nDescriptif: 60, proMulti: 80, proMono: 40, neutre: 10, medianGap: 5, q1Gap: 1, q3Gap: 9, minGap: -20, maxGap: 30 },
  },
  {
    label: 'Privé commercial vs Public',
    summary: { totalCabinets: 120, nFiable: 10, nTendance: 20, nDescriptif: 90, proMulti: 44, proMono: 54, neutre: 22, medianGap: -2, q1Gap: -6, q3Gap: 4, minGap: -25, maxGap: 28 },
  },
];

describe('buildFiche002Content', () => {
  it('métadonnées : fiche n°002, famille B. Statut, titre statut', () => {
    const f = buildFiche002Content();
    expect(f.numero).toBe(2);
    expect(f.famille).toMatch(/B\.\s*Statut/i);
    expect(f.titre.toLowerCase()).toContain('statut');
  });

  it('injecte les écarts nationaux par contraste (signés)', () => {
    const all = serializeFicheContent(buildFiche002Content({ statutNational: GAPS }));
    expect(all).toContain('+6,1');
    expect(all).toContain('-2,3');
  });

  it('présente le gap AJUSTÉ (+ IC) en tête et le brut en contexte quand disponible', () => {
    const f = buildFiche002Content({
      statutNational: [
        { label: 'Privé à but non lucratif vs Public', gap: 6.1, gapAdj: 4.0, ciLow: 2.5, ciHigh: 5.5, p: 0.001, n: 5000 },
        { label: 'Privé commercial vs Public', gap: -2.3, gapAdj: -1.0, ciLow: -2.0, ciHigh: 0.0, p: 0.05, n: 2000 },
      ],
    });
    expect(f.blocs.enClair).toMatch(/ajusté/i);
    expect(f.blocs.enClair).toMatch(/\+4,0/); // ajusté en tête
    expect(f.blocs.enClair).toMatch(/\+2,5 à \+5,5/); // IC
    expect(f.blocs.enClair).toMatch(/brut/i); // brut en contexte
    expect(f.blocs.methode).toMatch(/ajust/i);
    expect(f.blocs.limites).not.toMatch(/prévue/i);
  });

  it('expose les 9 blocs non vides', () => {
    const b = buildFiche002Content({ statutNational: GAPS }).blocs;
    const keys = ['enClair', 'question', 'methode', 'resultats', 'interpretation', 'limites', 'misePerspective', 'implications', 'annexe'] as const;
    for (const k of keys) expect((b[k] ?? '').trim().length, `bloc ${k}`).toBeGreaterThan(0);
  });

  it('expose verdict / pourquoi / ceQueNeDitPas non vides', () => {
    const b = buildFiche002Content({ statutNational: GAPS }, CABINETS).blocs;
    for (const k of ['verdict', 'pourquoi', 'ceQueNeDitPas'] as const) {
      expect((b[k] ?? '').trim().length, `bloc ${k}`).toBeGreaterThan(0);
    }
  });

  it('verdict : synthèse couvrant les 2 contrastes, avec direction conforme au signe', () => {
    // non lucratif +6,1 (supérieur) ; commercial -2,3 (inférieur)
    const v = buildFiche002Content({ statutNational: GAPS }).blocs.verdict!;
    expect(v).toMatch(/non lucratif/i);
    expect(v).toMatch(/commercial/i);
    expect(v).toMatch(/sup[ée]rieur/i); // non lucratif > public
    expect(v).toMatch(/inf[ée]rieur/i); // commercial < public
    expect(v).toMatch(/6,1/); // ampleur non lucratif
    expect(v).toMatch(/2,3/); // ampleur commercial
    // message central = hétérogénéité entre cabinets
    expect(v).toMatch(/cabinet/i);
    // pas de sur-affirmation causale
    expect(v).toMatch(/pas une preuve causale/i);
  });

  it('verdict : ajusté quand dispo, signale le non-significatif, dégrade proprement sinon', () => {
    const adj = buildFiche002Content({
      statutNational: [
        { label: 'Privé à but non lucratif vs Public', gap: 6.1, gapAdj: 4.0, ciLow: 2.5, ciHigh: 5.5, p: 0.001, n: 5000 },
        { label: 'Privé commercial vs Public', gap: -2.3, gapAdj: -1.0, ciLow: -2.0, ciHigh: 0.0, p: 0.2, n: 2000 },
      ],
    }).blocs.verdict!;
    expect(adj).toMatch(/ajust/i); // mention de l'ajustement
    expect(adj).toMatch(/4,0/); // valeur de tête = ajustée, pas le brut
    expect(adj).toMatch(/non significatif/i); // commercial p=0,2

    // Sans données : pas de plantage, mention « non chiffrable » (tournure non boiteuse).
    const none = buildFiche002Content().blocs.verdict!;
    expect(none.trim().length).toBeGreaterThan(0);
    expect(none).toMatch(/non chiffrable/i);
    expect(none).not.toMatch(/obtient :/); // plus de « obtient : écart… » boiteux
  });

  it('cas MIXTE (un contraste ajusté, l’autre non) : un brut n’est JAMAIS étiqueté « ajusté »', () => {
    // commercial : design singulier → gapAdj null → retombe sur le BRUT.
    const v = buildFiche002Content({
      statutNational: [
        { label: 'Privé à but non lucratif vs Public', gap: 6.0, gapAdj: 3.0, ciLow: 1.5, ciHigh: 4.5, p: 0.01, n: 5000 },
        { label: 'Privé commercial vs Public', gap: -4.0, gapAdj: null, p: null, n: 50 },
      ],
    }).blocs.verdict!;
    expect(v).toMatch(/4,0 pts? \(écart brut\)/); // valeur de tête commercial = brut, étiquetée
    expect(v).not.toMatch(/écarts nationaux ajustés/); // pas de qualificatif global « ajustés »
  });

  it('ceQueNeDitPas ne répète pas mot pour mot le « ne montre pas » de interpretation', () => {
    const b = buildFiche002Content({ statutNational: GAPS }).blocs;
    // dé-doublonnage : interpretation ne porte plus la phrase « Ce qu’il ne montre pas »
    expect(b.interpretation).not.toMatch(/ne montre pas/i);
    // portée (causalité, qualité) déplacée dans ceQueNeDitPas
    expect(b.ceQueNeDitPas).toMatch(/cause à effet/i);
    expect(b.ceQueNeDitPas).toMatch(/qualité réelle des soins/i);
  });

  it('rend la synthèse par cabinet des 2 contrastes (libellés affichés)', () => {
    const c = buildFiche002Content({ statutNational: GAPS }, CABINETS).blocs.cabinets!;
    expect(c).toContain('Privé à but non lucratif vs Public');
    expect(c).toContain('Privé commercial vs Public');
  });

  it('peuple la table de vérification (2 contrastes) quand le moteur expose `verif`', () => {
    const f = buildFiche002Content({
      statutNational: [
        { label: 'Privé à but non lucratif vs Public', gap: 6.1, gapAdj: 4.0, ciLow: 2.5, ciHigh: 5.5, p: 0.001, n: 5000, verif: { nReference: 3000, nTarget: 2000, meanReference: 76.0, meanTarget: 82.1, sdReference: 14.2, sdTarget: 12.9, se: 0.77, t: 5.2, k: 18, ciLevel: 0.95 } },
        { label: 'Privé commercial vs Public', gap: -2.3, gapAdj: -1.0, ciLow: -2.0, ciHigh: 0.0, p: 0.2, n: 4500, verif: { nReference: 3000, nTarget: 1500, meanReference: 76.0, meanTarget: 73.7, sdReference: 14.2, sdTarget: 16.1, se: 0.51, t: -1.96, k: 18, ciLevel: 0.95 } },
      ],
    });
    expect(f.verification?.kind).toBe('two-group');
    if (f.verification?.kind !== 'two-group') throw new Error('attendu two-group');
    expect(f.verification.contrasts).toHaveLength(2);
    const c0 = f.verification.contrasts[0];
    expect(c0.groups[0]).toMatchObject({ label: 'Public', mean: 76.0 });
    expect(c0.groups[1]).toMatchObject({ label: 'Privé à but non lucratif', mean: 82.1 });
    expect(c0.ecartBrut).toBeCloseTo(6.1, 9); // == 82,1 − 76,0
  });

  it('pas de table de vérification sans `verif`', () => {
    expect(buildFiche002Content({ statutNational: GAPS }).verification).toBeUndefined();
  });
});
