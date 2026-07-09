import { describe, it, expect, afterEach } from 'vitest';
import { buildFiche012Content } from './fiche-012-content';
import { buildFiche003Content } from './fiche-003-content';
import { buildFiche010Content } from './fiche-010-content';
import { setSignificanceAlpha } from './significance';

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

  it('verdict : méta-classement anonyme en rang + chiffre clé (dimensions/p<0,05 par défaut), pas un verdict qualité', () => {
    const v = buildFiche012Content().blocs.verdict ?? '';
    // Affirmation clé : pluralité de dimensions + significativité.
    expect(v.toLowerCase()).toMatch(/dimension/);
    expect(v).toContain('p < 0,05'); // défaut α=0,05 (cf. significance.ts)
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

  it('verdict : bascule sur p < 0,01 en setSignificanceAlpha(0.01) explicite', () => {
    setSignificanceAlpha(0.01);
    const v = buildFiche012Content().blocs.verdict ?? '';
    expect(v).toContain('p < 0,01');
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
