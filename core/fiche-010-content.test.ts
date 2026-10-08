import { describe, it, expect } from 'vitest';
import { buildFiche010Content } from './fiche-010-content';
import { FICHE_CALENDAR } from './fiche-calendar';

describe('buildFiche010Content', () => {
  it('numéro 10, 9 blocs non vides, statut Relue', () => {
    const f = buildFiche010Content();
    expect(f.numero).toBe(10);
    expect(f.statut).toBe('Relue');
    for (const k of ['enClair', 'question', 'methode', 'resultats', 'interpretation', 'limites', 'misePerspective', 'implications', 'annexe'] as const) {
      expect((f.blocs[k] ?? '').length).toBeGreaterThan(0);
    }
  });

  it('expose verdict / pourquoi / ceQueNeDitPas non vides', () => {
    const f = buildFiche010Content();
    for (const k of ['verdict', 'pourquoi', 'ceQueNeDitPas'] as const) {
      expect((f.blocs[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('verdict reflète le constat descriptif (seuil 60 %, un cabinet = un point, non causal)', () => {
    const { verdict } = buildFiche010Content().blocs;
    expect(verdict).toContain('60 %');
    expect(verdict).toMatch(/descriptif/i);
    expect(verdict).toMatch(/sp[ée]cialis/i);
    // Aucune sur-affirmation : la fiche ne prouve pas un effet causal.
    expect(verdict).toMatch(/pas une preuve/i);
  });

  it('ceQueNeDitPas borne la portée (un point, non ajusté, conformité ≠ qualité) sans répéter interpretation mot pour mot', () => {
    const { ceQueNeDitPas, interpretation } = buildFiche010Content().blocs;
    expect(ceQueNeDitPas).toMatch(/UN point/);
    expect(ceQueNeDitPas).toMatch(/non ajust|brute/i);
    expect(ceQueNeDitPas).toMatch(/satisfaction des exigences du référentiel/i);
    expect(ceQueNeDitPas).toMatch(/pas la qualit[ée] r[ée]elle des soins/i);
    // Dé-doublonnage : ceQueNeDitPas ne recopie pas une phrase entière d'interpretation.
    expect(ceQueNeDitPas).not.toContain(interpretation ?? '###');
  });

  it('aucun glyphe strippé par WinAnsi (α/β grecs, − U+2212, ≠ U+2260) dans les blocs rendus', () => {
    // « association ≠ causalité » rendait « association causalité » dans le PDF — sens INVERSÉ.
    const f = buildFiche010Content();
    const all = Object.values(f.blocs).filter(Boolean).join(' ');
    expect(all).not.toMatch(/[αβ−≠]/);
    expect(f.blocs.limites).toContain('association sans preuve de causalité');
  });
});

describe('fiche 10 — ne décrit que ce qui est imprimé (portefeuilles cabinet par cabinet)', () => {
  const textes = () => {
    const f = buildFiche010Content();
    const v = f.verification;
    const meta = v?.kind === 'meta' ? `${v.regle} ${v.renvoi}` : '';
    return { f, all: `${meta} ${Object.values(f.blocs).filter(Boolean).join(' ')}` };
  };

  it('n’annonce aucune synthèse comparative ni moyenne par groupe', () => {
    const { all } = textes();
    expect(all).not.toMatch(/synthèse comparative/i);
    expect(all).not.toMatch(/niveau global moyen/i);
    expect(all).not.toMatch(/nombre moyen d’axes/i);
    expect(all).not.toMatch(/notent en moyenne/i);
    expect(all).not.toMatch(/comparaison (descriptive )?spécialisés/i);
  });

  it('décrit le fichier joint : profil et niveau global, cabinet par cabinet, sans moyenne par groupe', () => {
    const { f } = textes();
    expect(f.blocs.resultats).toMatch(/cabinet par cabinet/);
    expect(f.blocs.resultats).toMatch(/HHI/);
    expect(f.blocs.resultats).toMatch(/niveau global/);
    expect(f.blocs.methode).toMatch(/aucune moyenne par groupe/i);
    const v = f.verification;
    expect(v?.kind === 'meta' ? v.regle : '').toMatch(/aucune moyenne par groupe/i);
  });
});

describe('fiche 10 — titres sans annonce d’un effet non calculé', () => {
  it('le titre imprimé décrit les portefeuilles et le niveau, sans « effet sur la notation »', () => {
    const { titre } = buildFiche010Content();
    expect(titre).not.toMatch(/effet sur la notation/i);
    expect(titre).not.toMatch(/\beffet\b/i);
    expect(titre).toMatch(/portefeuilles/);
    expect(titre).toMatch(/niveau de notation/);
  });

  it('le titre court du calendrier ne parle pas d’effet de la spécialisation', () => {
    const e = FICHE_CALENDAR.find((x) => x.numero === 10);
    expect(e?.titre).toBe('Spécialisation sectorielle du cabinet (portefeuilles)');
    expect(e?.titre).not.toMatch(/\beffet\b/i);
  });

  it('la règle situe le minimum du HHI à 0,25 (quatre secteurs), pas à 0', () => {
    const v = buildFiche010Content().verification;
    const regle = v?.kind === 'meta' ? v.regle : '';
    expect(regle).toContain('0,25 = réparti également entre les 4 secteurs, 1 = mono-secteur');
    expect(regle).not.toContain('0 = diversifié');
  });
});
