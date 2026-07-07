import { describe, it, expect } from 'vitest';
import {
  buildFiche001Content,
  serializeFicheContent,
  type FicheContent,
} from './fiche-001-content';
import type { MonoMultiResult } from './mono-multi-analysis';

describe('buildFiche001Content', () => {
  const fiche: FicheContent = buildFiche001Content();

  it('expose les 9 blocs éditoriaux, tous non vides', () => {
    const b = fiche.blocs;
    const keys = [
      'enClair',
      'question',
      'methode',
      'resultats',
      'interpretation',
      'limites',
      'misePerspective',
      'implications',
      'annexe',
    ] as const;
    for (const k of keys) {
      expect(b[k], `bloc ${k}`).toBeTruthy();
      expect(b[k].trim().length, `bloc ${k} non vide`).toBeGreaterThan(0);
    }
  });

  it('métadonnées : fiche n°001, famille A. Taille', () => {
    expect(fiche.numero).toBe(1);
    expect(fiche.famille).toMatch(/A\.\s*Taille/i);
    expect(fiche.titre.toLowerCase()).toContain('mono');
    expect(fiche.titre.toLowerCase()).toContain('multi');
  });

  it('porte les chiffres clés réels de la V1.3', () => {
    const all = serializeFicheContent(fiche);
    expect(all).toContain('18 795'); // N
    expect(all).toContain('+4,1'); // écart ajusté
    expect(all).toContain('+5,3'); // écart brut
    expect(all).toContain('5,8'); // p = 5,8e-33
    expect(all).toMatch(/IC\s*95/i);
    expect(all).toContain('0,21'); // R²
  });

  it('serializeFicheContent inclut titre + tous les blocs', () => {
    const all = serializeFicheContent(fiche);
    expect(all).toContain(fiche.titre);
    expect(all).toContain(fiche.blocs.enClair);
    expect(all).toContain(fiche.blocs.annexe);
  });
});

describe('buildFiche001Content — chiffres dynamiques', () => {
  const DYN: MonoMultiResult = {
    n: 20000,
    nMono: 4000,
    nMulti: 16000,
    meanMono: 70,
    meanMulti: 85,
    sdMono: 12,
    sdMulti: 9,
    gapRaw: 15,
    betaAdj: 12.5,
    se: 0.5,
    t: 25,
    p: 0, // underflow, comme en cas réel
    ciLow: 11.5,
    ciHigh: 13.5,
    ciLevel: 0.95,
    k: 30,
  };

  it('injecte N, %, moyennes, écart, β, IC et dates depuis les stats', () => {
    const all = serializeFicheContent(
      buildFiche001Content({ stats: DYN, hasSourceLabel: '01/07/2026', finessSourceLabel: '01/06/2026' }),
    );
    expect(all).toContain('20 000'); // N
    expect(all).toContain('85,0'); // moyenne multi
    expect(all).toContain('70,0'); // moyenne mono
    expect(all).toContain('+15,0'); // écart brut
    expect(all).toContain('+12,5'); // β ajusté
    expect(all).toContain('+11,5'); // IC bas
    expect(all).toContain('+13,5'); // IC haut
    expect(all).toContain('80,0 %'); // % multi
    expect(all).toContain('20,0 %'); // % mono
    expect(all).toContain('01/07/2026'); // source HAS
    expect(all).toContain('01/06/2026'); // source FINESS
  });

  it('formate p=0 (underflow) en borne défendable — jamais "p = 0" ni NaN', () => {
    const all = serializeFicheContent(buildFiche001Content({ stats: DYN }));
    expect(all).toContain('10^-16');
    expect(all).not.toMatch(/p\s*=\s*0\b/);
    expect(all).not.toContain('NaN');
  });

  it('signale la provenance mixte (chiffres de tête recalculés vs étude de référence)', () => {
    const all = serializeFicheContent(buildFiche001Content({ stats: DYN })).toLowerCase();
    expect(all).toContain('recalcul');
  });

  it('libellé SE = HC0 en mode dynamique (recalcul), jamais HC3', () => {
    // Le recalcul utilise HC0 (HC3 dégénère sur strates FINESS singleton).
    // Le texte méthode/annexe doit donc dire HC0, pas HC3, en mode dynamique.
    const b = buildFiche001Content({ stats: DYN }).blocs;
    expect(b.methode).toContain('HC0');
    expect(b.annexe).toContain('HC0');
    expect(b.methode).not.toContain('HC3');
    expect(b.annexe).not.toContain('HC3');
  });

  it('libellé SE = HC3 sur les chiffres de référence (étude d’origine Python)', () => {
    const b = buildFiche001Content().blocs;
    expect(b.methode).toContain('HC3');
    expect(b.annexe).toContain('HC3');
    expect(b.methode).not.toContain('HC0');
    expect(b.annexe).not.toContain('HC0');
  });

  it('garde les 9 blocs non vides en mode dynamique', () => {
    const b = buildFiche001Content({ stats: DYN }).blocs;
    for (const k of Object.keys(b) as (keyof typeof b)[]) {
      expect((b[k] ?? '').trim().length, `bloc ${k}`).toBeGreaterThan(0);
    }
  });

  it('sans argument : sortie V1.0 inchangée (back-compat)', () => {
    const all = serializeFicheContent(buildFiche001Content());
    expect(all).toContain('18 795');
    expect(all).toContain('5,8 × 10^-33');
    expect(all.toLowerCase()).not.toContain('recalcul');
  });
});

describe('buildFiche001Content — synthèse par cabinet (PR cabinet)', () => {
  const SUMMARY = {
    totalCabinets: 139,
    nFiable: 36,
    nTendance: 44,
    nDescriptif: 59,
    proMulti: 102,
    proMono: 26,
    neutre: 11,
    medianGap: 6.26,
    q1Gap: 2.1,
    q3Gap: 10.4,
    minGap: -32,
    maxGap: 42,
  };

  it('ajoute un bloc « cabinets » avec les agrégats quand cabinetSummary est fourni', () => {
    const fiche = buildFiche001Content({}, [{ label: 'Mono vs multi', summary: SUMMARY }]);
    expect(fiche.blocs.cabinets).toBeTruthy();
    const c = fiche.blocs.cabinets!;
    expect(c).toContain('139'); // total
    expect(c).toContain('36'); // fiables
    expect(c).toContain('102'); // pro-multi
    expect(c).toContain('6,26'); // médiane
  });

  it('réconcilie la ligne « Direction » : explicite les cabinets à écart non calculable', () => {
    const partial = { ...SUMMARY, totalCabinets: 140, proMulti: 68, proMono: 60, neutre: 0 }; // 128 calculables, 12 non
    const c = buildFiche001Content({}, [{ label: 'Mono vs multi', summary: partial }]).blocs.cabinets!;
    expect(c).toContain('140'); // total annoncé
    expect(c).toContain('128'); // cabinets à écart calculable (68+60+0)
    expect(c).toMatch(/12 cabinet\(s\) à écart non calculable/);
  });

  it('n’émet aucun emoji de palier dans le texte (sinon stripé au rendu WinAnsi)', () => {
    const c = buildFiche001Content({}, [{ label: 'Mono vs multi', summary: SUMMARY }]).blocs.cabinets!;
    expect(c).not.toMatch(/🟢|🟡|🔴/);
  });

  it('inclut un encart « comment lire » renvoyant au guide + au fichier joint', () => {
    const c = buildFiche001Content({}, [{ label: 'Mono vs multi', summary: SUMMARY }]).blocs.cabinets!.toLowerCase();
    expect(c).toMatch(/comment lire|guide/);
    expect(c).toMatch(/csv|pièce jointe|classement complet/);
  });

  it('sans cabinetSummary : pas de bloc cabinets (back-compat)', () => {
    expect(buildFiche001Content().blocs.cabinets).toBeUndefined();
  });
});

describe('buildFiche001Content — données de calcul et vérification', () => {
  const DYN: MonoMultiResult = {
    n: 20000, nMono: 4000, nMulti: 16000, meanMono: 70, meanMulti: 85,
    sdMono: 12, sdMulti: 9, gapRaw: 15, betaAdj: 12.5, se: 0.5, t: 25, p: 1e-40,
    ciLow: 11.5, ciHigh: 13.5, ciLevel: 0.95, k: 30,
  };

  it('sans stats : pas de section vérification (dégradé propre, back-compat)', () => {
    expect(buildFiche001Content().verification).toBeUndefined();
  });

  it('avec stats : section two-group à 1 contraste, groupes [référence, cible]', () => {
    const v = buildFiche001Content({ stats: DYN }).verification;
    expect(v?.kind).toBe('two-group');
    if (v?.kind !== 'two-group') throw new Error('attendu two-group');
    expect(v.contrasts).toHaveLength(1);
    const [ref, tgt] = v.contrasts[0].groups;
    expect(ref).toMatchObject({ n: 4000, mean: 70, sd: 12 });
    expect(tgt).toMatchObject({ n: 16000, mean: 85, sd: 9 });
  });

  it('INVARIANT DE RÉCONCILIATION : écart brut == moyenne(cible) − moyenne(référence) == gapRaw', () => {
    const v = buildFiche001Content({ stats: DYN }).verification;
    if (v?.kind !== 'two-group') throw new Error('attendu two-group');
    const c = v.contrasts[0];
    expect(c.ecartBrut).toBe(DYN.gapRaw); // == 15
    expect(c.ecartBrut).toBeCloseTo((c.groups[1].mean ?? 0) - (c.groups[0].mean ?? 0), 9); // 85 − 70
  });

  it('bloc ajusté : β, ddl=n−k, IC, p, méthode normale, SE HC0', () => {
    const v = buildFiche001Content({ stats: DYN }).verification;
    if (v?.kind !== 'two-group') throw new Error('attendu two-group');
    const a = v.contrasts[0].ajuste!;
    expect(a.beta).toBe(12.5);
    expect(a.ddl).toBe(20000 - 30);
    expect(a.ciLow).toBe(11.5);
    expect(a.ciHigh).toBe(13.5);
    expect(a.pMethod).toBe('normale');
    expect(a.seType).toBe('HC0');
  });

  it('sd null si un groupe a moins de 2 obs (NaN moteur → null table)', () => {
    const v = buildFiche001Content({ stats: { ...DYN, sdMono: NaN } }).verification;
    if (v?.kind !== 'two-group') throw new Error('attendu two-group');
    expect(v.contrasts[0].groups[0].sd).toBeNull();
  });

  it('serializeFicheContent IGNORE le champ verification (hash/anonymat stables)', () => {
    const base = buildFiche001Content({ stats: DYN });
    const stripped: FicheContent = { ...base, verification: undefined };
    expect(serializeFicheContent(base)).toBe(serializeFicheContent(stripped));
  });
});
