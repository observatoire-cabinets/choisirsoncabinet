import { describe, it, expect, afterEach } from 'vitest';
import { buildFiche012Content } from './fiche-012-content';
import { buildFiche003Content } from './fiche-003-content';
import { buildFiche010Content } from './fiche-010-content';
import { setSignificanceAlpha } from './significance';
import { axeNonConformeDefinition, axeNonConformeResume, holmParCabinetLabel } from './cabinet-non-conformite';

afterEach(() => setSignificanceAlpha(0.05));

describe('méta-fiches (3/10/12) — vérification « règle + renvoi »', () => {
  it('chaque méta-fiche porte une vérif kind=meta (règle + renvoi non vides)', () => {
    for (const f of [buildFiche003Content(), buildFiche010Content(), buildFiche012Content()]) {
      expect(f.verification?.kind).toBe('meta');
      if (f.verification?.kind !== 'meta') throw new Error('attendu meta');
      expect(f.verification.regle.length).toBeGreaterThan(20);
      expect(f.verification.renvoi.toLowerCase()).toMatch(/fichier joint/);
    }
  });
});

describe('buildFiche012Content', () => {
  it('numéro 12, 9 blocs non vides, statut Relue', () => {
    const f = buildFiche012Content();
    expect(f.numero).toBe(12);
    expect(f.statut).toBe('Relue');
    for (const k of ['enClair', 'question', 'methode', 'resultats', 'interpretation', 'limites', 'misePerspective', 'implications', 'annexe'] as const) {
      expect((f.blocs[k] ?? '').length).toBeGreaterThan(0);
    }
  });

  it('porte verdict / pourquoi / ceQueNeDitPas (synthèse N1+N2) non vides', () => {
    const b = buildFiche012Content().blocs;
    for (const k of ['verdict', 'pourquoi', 'ceQueNeDitPas'] as const) {
      expect((b[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('verdict : méta-classement anonyme en rang + chiffre clé (dimensions/seuil 0,05 par défaut), pas un verdict qualité', () => {
    const v = buildFiche012Content().blocs.verdict ?? '';
    // Affirmation clé : pluralité de dimensions + significativité.
    expect(v.toLowerCase()).toMatch(/dimension/);
    expect(v).toContain('seuil global de 0,05'); // défaut α=0,05 (cf. significance.ts)
    // Anonyme : on parle en rang, jamais en cabinet nommé.
    expect(v.toLowerCase()).toMatch(/rang/);
    // Portée : ce n'est PAS un jugement de qualité des soins.
    expect(v.toLowerCase()).toMatch(/qualité/);
    // Décompte EXACT : 7 dimensions phares (pas 8), sans « territoire » (DROM hors méta-classement,
    // cohérent avec le PDF joint « sur 7 » et le bloc limites « DROM non inclus »).
    expect(v.toLowerCase()).toContain('sept dimensions');
    expect(v.toLowerCase()).not.toContain('huit');
    expect(v.toLowerCase()).not.toContain('territoire');
  });

  it('verdict : bascule sur le seuil 0,01 en setSignificanceAlpha(0.01) explicite', () => {
    setSignificanceAlpha(0.01);
    const v = buildFiche012Content().blocs.verdict ?? '';
    expect(v).toContain('seuil global de 0,01');
  });

  it('ceQueNeDitPas : limites de portée (pas de causalité, conformité ≠ qualité, snapshot)', () => {
    const c = (buildFiche012Content().blocs.ceQueNeDitPas ?? '').toLowerCase();
    expect(c).toMatch(/causal|preuve causale/);
    expect(c).toMatch(/satisfaction des exigences du référentiel/);
    expect(c).toMatch(/snapshot|pluriannuel/);
  });

  it('aucun glyphe strippé par WinAnsi (α/β grecs, − U+2212, ≠ U+2260) dans les blocs rendus', () => {
    // « Association ≠ causalité » rendait « Association causalité » dans le PDF — sens INVERSÉ.
    const f = buildFiche012Content();
    const all = Object.values(f.blocs).filter(Boolean).join(' ');
    expect(all).not.toMatch(/[αβ−≠]/);
    expect(f.blocs.limites).toContain('Association sans preuve de causalité');
  });
});

describe('fiche 12 — correction de Holm et définition d’un axe « non conforme »', () => {
  const textes = () => {
    const f = buildFiche012Content();
    const regle = f.verification?.kind === 'meta' ? f.verification.regle : '';
    return { f, regle, all: `${regle} ${Object.values(f.blocs).filter(Boolean).join(' ')}` };
  };

  it('décrit la correction de Holm par cabinet, sur ses seuls axes au palier Fiable', () => {
    const { f, regle } = textes();
    for (const t of [regle, f.blocs.methode, f.blocs.annexe]) {
      expect(t).toContain('correction de Holm appliquée, pour chaque cabinet, à ses seuls axes au palier Fiable');
      expect(t).toContain(holmParCabinetLabel());
    }
  });

  it('n’annonce plus une correction « sur les 7 axes » ni « Holm-Bonferroni »', () => {
    const { all } = textes();
    expect(all).not.toMatch(/Holm[^.]*sur les 7 axes/);
    expect(all).not.toContain('Holm-Bonferroni');
  });

  it('règle, méthode et annexe reprennent la définition complète en quatre conditions', () => {
    const { f, regle } = textes();
    const def = axeNonConformeDefinition();
    for (const t of [regle, f.blocs.methode, f.blocs.annexe]) expect(t).toContain(def);
    expect(def).toContain('palier Fiable (≥ 30 évaluations par groupe)');
    expect(def).toContain('d de Cohen ≥ 0,2');
    expect(def).toContain('même sens que l’écart ajusté national');
    expect(def).toContain('au seuil global de 0,05');
  });

  it('la définition parle d’évaluations, de d de Cohen et d’un seuil global, sans abréviation ni p brute', () => {
    const def = axeNonConformeDefinition();
    expect(def).not.toMatch(/\bobs\b/);
    expect(def).not.toContain('Cohen d');
    expect(def).not.toMatch(/p < 0,0/);
  });

  it('le verdict renvoie à la définition par un résumé court des quatre conditions', () => {
    const { f } = textes();
    const v = f.blocs.verdict ?? '';
    expect(v).toContain(axeNonConformeResume());
    expect(v).not.toContain(axeNonConformeDefinition());
    expect(axeNonConformeResume()).toContain('quatre conditions');
    expect(axeNonConformeResume()).toContain('correction de Holm');
    expect(axeNonConformeResume()).toContain('Données et méthode');
    expect(v.split(/\s+/).length).toBeLessThan(100);
  });

  it('le seuil de la définition suit le seuil de significativité courant', () => {
    setSignificanceAlpha(0.01);
    expect(axeNonConformeDefinition()).toContain('seuil global de 0,01');
    expect(buildFiche012Content().blocs.verdict).toContain('seuil global de 0,01');
  });

  it('les résultats ne ramènent plus la définition à un « écart significatif »', () => {
    const { f } = textes();
    expect(f.blocs.resultats).not.toContain('(écart significatif)');
    expect(f.blocs.resultats).toContain('quatre conditions');
  });

  it('l’annexe ne renvoie plus au guide, qui ne décrit pas cette règle', () => {
    const { f } = textes();
    expect(f.blocs.annexe).not.toContain('cf. guide');
  });
});
