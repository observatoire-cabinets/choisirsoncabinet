import { describe, it, expect } from 'vitest';
import {
  buildContrastFicheContent,
  makeContrastFicheBuilder,
  CONTRAST_FICHE_CONFIGS,
  type ContrastFicheConfig,
} from './fiche-contrast-content';

const sampleCfg: ContrastFicheConfig = {
  numero: 99,
  titre: 'Titre de test',
  famille: 'X. Famille de test',
  axisNoun: 'la dimension de test',
  referenceLabel: 'le groupe de référence',
  questionSpecific: 'Enjeu spécifique de test.',
  methodeAxis: 'Axe à deux niveaux, un contraste vs la référence.',
  limitesExtra: ['Limite spécifique de test.'],
  implicationsSpecific: 'Implication de test.',
};

describe('buildContrastFicheContent', () => {
  it('produit une FicheContent avec numéro/titre/famille de la config', () => {
    const f = buildContrastFicheContent(sampleCfg, {});
    expect(f.numero).toBe(99);
    expect(f.titre).toBe('Titre de test');
    expect(f.famille).toBe('X. Famille de test');
  });

  it('a les 9 blocs éditoriaux', () => {
    const f = buildContrastFicheContent(sampleCfg, {});
    for (const k of [
      'enClair', 'question', 'methode', 'resultats',
      'interpretation', 'limites', 'misePerspective', 'implications', 'annexe',
    ] as const) {
      expect(typeof f.blocs[k]).toBe('string');
      expect(f.blocs[k]!.length).toBeGreaterThan(0);
    }
  });

  it('intègre les écarts nationaux formatés dans le bloc « en clair »', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [{ label: 'Cible vs référence', gap: 3.2 }],
    });
    expect(f.blocs.enClair).toMatch(/Cible vs référence/);
    expect(f.blocs.enClair).toMatch(/\+3,2/);
  });

  it('affiche un tiret quand l’écart national est indisponible', () => {
    const f = buildContrastFicheContent(sampleCfg, { nationalGaps: [{ label: 'C', gap: null }] });
    expect(f.blocs.resultats).toMatch(/—/);
  });

  it('présente le gap AJUSTÉ (+ IC) en tête et le brut en contexte quand disponible', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [
        { label: 'Cible vs référence', gap: -3.0, gapAdj: 2.0, ciLow: 0.5, ciHigh: 3.5, p: 0.01, n: 1000 },
      ],
    });
    expect(f.blocs.enClair).toMatch(/ajusté/i);
    expect(f.blocs.enClair).toMatch(/\+2,0/); // gap ajusté en tête
    expect(f.blocs.enClair).toMatch(/\+0,5 à \+3,5/); // IC 99 %
    expect(f.blocs.enClair).toMatch(/brut/i); // brut conservé en contexte
    expect(f.blocs.enClair).toMatch(/-3,0/);
    // méthode : national ajusté ; limites : on n'annonce plus l'ajustement comme « à venir »
    expect(f.blocs.methode).toMatch(/ajust/i);
    expect(f.blocs.limites).not.toMatch(/prévue/i);
    // le niveau cabinet reste explicitement brut
    expect(f.blocs.limites).toMatch(/cabinet/i);
  });

  it('affiche la ventilation « par statut » quand les strates divergent (interaction)', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [
        {
          label: 'Cible vs référence', gap: 1.0, gapAdj: 1.5, ciLow: 0.5, ciHigh: 2.5,
          byStatut: [
            { stratum: 'Public', gap: 7.9 },
            { stratum: 'Privé à but non lucratif', gap: 0.8 },
            { stratum: 'Privé commercial', gap: -10.6 },
          ],
        },
      ],
    });
    expect(f.blocs.enClair).toMatch(/par statut/i);
    expect(f.blocs.enClair).toMatch(/public \+7,9/i);
    expect(f.blocs.enClair).toMatch(/commercial -10,6/i);
  });

  it('le libellé des contrôles reflète l’axe (ne prétend pas neutraliser la variable d’axe)', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      adjustControls: 'statut et région',
      nationalGaps: [{ label: 'C', gap: 1, gapAdj: 1.2, ciLow: 0.5, ciHigh: 1.9 }],
    });
    expect(f.blocs.enClair).toMatch(/neutralisant statut et région/);
    expect(f.blocs.methode).toMatch(/neutralise statut et région/);
    expect(f.blocs.enClair).not.toMatch(/neutralisant secteur, statut et région/);
  });

  it('affiche la ventilation + « interaction significative » quand le test l’indique (même peu divergent)', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [
        {
          label: 'C', gap: 1.0, gapAdj: 1.0, ciLow: 0.5, ciHigh: 1.5,
          byStatut: [{ stratum: 'Public', gap: 1.0 }, { stratum: 'Privé commercial', gap: 2.2 }],
          byStatutSignificant: true,
        },
      ],
    });
    expect(f.blocs.enClair).toMatch(/par statut/i);
    expect(f.blocs.enClair).toMatch(/interaction significative/i);
  });

  it('masque la ventilation par statut quand les strates ne divergent pas', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [
        {
          label: 'C', gap: 1.0, gapAdj: 1.0, ciLow: 0.5, ciHigh: 1.5,
          byStatut: [{ stratum: 'Public', gap: 1.1 }, { stratum: 'Privé commercial', gap: 1.3 }],
        },
      ],
    });
    expect(f.blocs.enClair).not.toMatch(/par statut/i);
  });

  it('ajoute le bloc cabinets quand des synthèses sont fournies', () => {
    const f = buildContrastFicheContent(sampleCfg, {}, [
      {
        label: 'Cible vs référence',
        summary: {
          totalCabinets: 5, nFiable: 1, nTendance: 2, nDescriptif: 2,
          proMulti: 3, proMono: 2, neutre: 0,
          medianGap: 1.5, q1Gap: 0, q3Gap: 3, minGap: -2, maxGap: 5,
        },
      },
    ]);
    expect(f.blocs.cabinets).toBeDefined();
    expect(f.blocs.cabinets).toMatch(/5 cabinets/);
    // décision 1 : caveat renforcé — le classement par cabinet reste brut/non ajusté
    expect(f.blocs.cabinets).toMatch(/brut/i);
    expect(f.blocs.cabinets).toMatch(/non ajust/i);
  });

  it('peuple verdict/pourquoi/ceQueNeDitPas (présents, non vides)', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [{ label: 'Cible vs référence', gap: 3.2, gapAdj: 2.0, ciLow: 0.5, ciHigh: 3.5, p: 0.001 }],
    });
    for (const k of ['verdict', 'pourquoi', 'ceQueNeDitPas'] as const) {
      expect(typeof f.blocs[k]).toBe('string');
      expect(f.blocs[k]!.length).toBeGreaterThan(0);
    }
  });

  it('le verdict cite le CHIFFRE clé et le marque solide quand l’IC ajusté exclut 0', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [{ label: 'Cible vs référence', gap: 4.0, gapAdj: 3.0, ciLow: 1.5, ciHigh: 4.5, p: 0.001 }],
    });
    expect(f.blocs.verdict).toMatch(/3,0 point/); // chiffre ajusté, pas le brut
    expect(f.blocs.verdict).not.toMatch(/4,0/); // ne cite pas le brut
    expect(f.blocs.verdict).toMatch(/supérieur/);
    expect(f.blocs.verdict).toMatch(/solide/i);
  });

  it('verdict : cite l’AJUSTÉ même quand le brut est de SIGNE OPPOSÉ (effet composition, fiches 5/9)', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      // brut négatif, ajusté positif → le verdict doit refléter l'ajusté (positif)
      nationalGaps: [{ label: 'Cible vs référence', gap: -6.0, gapAdj: 2.5, ciLow: 1.0, ciHigh: 4.0, p: 0.01 }],
    });
    expect(f.blocs.verdict).toMatch(/supérieur/); // signe de l'AJUSTÉ
    expect(f.blocs.verdict).not.toMatch(/inférieur/);
    expect(f.blocs.verdict).toMatch(/2,5 point/);
  });

  it('verdict : marque NON significatif quand l’IC ajusté englobe 0', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [{ label: 'C', gap: 1.0, gapAdj: 1.2, ciLow: -0.5, ciHigh: 2.9 }],
    });
    expect(f.blocs.verdict).toMatch(/non significatif/i);
  });

  it('ceQueNeDitPas porte les 3 limites de portée (causalité, qualité de soin, mécanisme)', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [{ label: 'C', gap: 1, gapAdj: 1.2, ciLow: 0.5, ciHigh: 1.9 }],
    });
    expect(f.blocs.ceQueNeDitPas).toMatch(/cause à effet|causal/i);
    expect(f.blocs.ceQueNeDitPas).toMatch(/qualité réelle des soins/i);
    expect(f.blocs.ceQueNeDitPas).toMatch(/POURQUOI/);
  });

  it('ceQueNeDitPas reprend le caveat de portée de la config (ex. proxy « groupe »)', () => {
    const cfgCaveat: ContrastFicheConfig = {
      ...sampleCfg,
      caveatPortee: 'Le « groupe » est ici un PROXY (entité juridique FINESS).',
    };
    const f = buildContrastFicheContent(cfgCaveat, {
      nationalGaps: [{ label: 'C', gap: 1, gapAdj: 1.2, ciLow: 0.5, ciHigh: 1.9 }],
    });
    expect(f.blocs.ceQueNeDitPas).toMatch(/PROXY/);
  });

  it('dé-doublonnage : interpretation ne répète plus la phrase « ce qu’il ne montre pas »', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [{ label: 'C', gap: 1, gapAdj: 1.2, ciLow: 0.5, ciHigh: 1.9 }],
    });
    expect(f.blocs.interpretation).not.toMatch(/ce qu’il ne montre pas/i);
    // renvoie vers le bloc dédié au lieu de répéter
    expect(f.blocs.interpretation).toMatch(/ne dit pas/i);
  });

  it('verdict sans sur-affirmation causale', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      nationalGaps: [{ label: 'C', gap: 1, gapAdj: 1.2, ciLow: 0.5, ciHigh: 1.9 }],
    });
    expect(f.blocs.verdict).toMatch(/associé/i); // « associé », pas « cause »
  });

  it('verdict dégradé (aucun écart chiffrable) reste prudent', () => {
    const f = buildContrastFicheContent(sampleCfg, { nationalGaps: [{ label: 'C', gap: null }] });
    expect(f.blocs.verdict).toMatch(/descriptive|n’est pas chiffrable/i);
  });

  it('peuple la table de vérification (two-group) quand le moteur expose `verif` ; sign-flip exposé', () => {
    const f = buildContrastFicheContent(sampleCfg, {
      adjustControls: 'statut et région',
      hasSourceLabel: '01/07/2026',
      nationalGaps: [{
        label: 'Cible X vs référence Y', gap: 2.3, gapAdj: -1.5, ciLow: -2.2, ciHigh: -0.8, p: 0.001, n: 10000,
        verif: { nReference: 8000, nTarget: 2000, meanReference: 78.0, meanTarget: 80.3, sdReference: 12.3, sdTarget: 11.8, se: 0.36, t: -4.17, k: 25, ciLevel: 0.95 },
      }],
    });
    expect(f.verification?.kind).toBe('two-group');
    if (f.verification?.kind !== 'two-group') throw new Error('attendu two-group');
    const c = f.verification.contrasts[0];
    expect(c.groups[0]).toMatchObject({ label: 'référence Y', n: 8000, mean: 78.0 });
    expect(c.groups[1]).toMatchObject({ label: 'Cible X', n: 2000, mean: 80.3 });
    expect(c.ecartBrut).toBeCloseTo(2.3, 9);
    expect(c.ajuste?.beta).toBe(-1.5); // brut +2,3 mais AJUSTÉ −1,5 (les deux affichés)
  });

  it('pas de section vérification sans `verif` (dégradé propre)', () => {
    const f = buildContrastFicheContent(sampleCfg, { nationalGaps: [{ label: 'C vs D', gap: 1 }] });
    expect(f.verification).toBeUndefined();
  });

  it('verdict 7 (groupe, proxy) — la fiche réelle expose son caveat de portée', () => {
    const cfg7 = CONTRAST_FICHE_CONFIGS[7];
    const f = buildContrastFicheContent(cfg7, {
      adjustControls: 'région',
      nationalGaps: [{ label: 'Grand groupe vs indépendant', gap: 2.0, gapAdj: 1.8, ciLow: 0.4, ciHigh: 3.2, p: 0.02 }],
    });
    expect(f.blocs.ceQueNeDitPas).toMatch(/proxy/i);
  });

});

describe('CONTRAST_FICHE_CONFIGS — les 6 fiches saines', () => {
  it('couvre exactement les fiches 4, 5, 6, 8, 9, 11', () => {
    expect(Object.keys(CONTRAST_FICHE_CONFIGS).map(Number).sort((a, b) => a - b)).toEqual([
      4, 5, 6, 7, 8, 9, 11,
    ]);
  });

  it('chaque config a un numéro cohérent et construit une fiche', () => {
    for (const [numStr, cfg] of Object.entries(CONTRAST_FICHE_CONFIGS)) {
      expect(cfg.numero).toBe(Number(numStr));
      buildContrastFicheContent(cfg, {
        nationalGaps: [{ label: 'A vs B', gap: 2.0 }],
      });
    }
  });
});

describe('makeContrastFicheBuilder', () => {
  it('retourne un builder (opts, cabinets) → FicheContent', () => {
    const build = makeContrastFicheBuilder(sampleCfg);
    const f = build({ nationalGaps: [{ label: 'C', gap: 1 }] });
    expect(f.numero).toBe(99);
  });
});
