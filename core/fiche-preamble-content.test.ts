// core/fiche-preamble-content.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { COMMENT_LIRE, glossaire } from './fiche-preamble-content';
import { setSignificanceAlpha } from './significance';

afterEach(() => setSignificanceAlpha(0.05));

describe('fiche-preamble-content', () => {
  it('COMMENT_LIRE a un titre et un corps non vides', () => {
    expect(COMMENT_LIRE.heading.trim().length).toBeGreaterThan(0);
    expect(COMMENT_LIRE.body.trim().length).toBeGreaterThan(40);
  });

  it('COMMENT_LIRE nomme les 3 niveaux de lecture', () => {
    expect(COMMENT_LIRE.body).toContain("L'essentiel");
    expect(COMMENT_LIRE.body).toContain('Pour comprendre');
    expect(COMMENT_LIRE.body).toContain('Pour vérifier');
  });

  it('glossaire() couvre les termes clés (méthodo + domaine), chaque entrée non vide', () => {
    const g = glossaire();
    expect(g.length).toBeGreaterThanOrEqual(8);
    for (const e of g) {
      expect(e.terme.trim().length, `terme vide`).toBeGreaterThan(0);
      expect(e.definition.trim().length, `def de ${e.terme}`).toBeGreaterThan(10);
    }
    const termes = g.map((e) => e.terme);
    for (const t of ['HAS', 'ESSMS', 'FINESS', 'EHPAD']) {
      expect(termes, `glossaire manque ${t}`).toContain(t);
    }
  });

  it('entrée Significativité : défaut IC 95 %/α=0,05 ; bascule IC 99 %/α=0,01', () => {
    const entryDefault = glossaire().find((e) => e.terme === 'Significativité');
    expect(entryDefault?.definition).toContain('95 %');
    expect(entryDefault?.definition).toContain('0,05');
    setSignificanceAlpha(0.01);
    const entry01 = glossaire().find((e) => e.terme === 'Significativité');
    expect(entry01?.definition).toContain('99 %');
    expect(entry01?.definition).toContain('0,01');
  });

  it('aucun emoji (rendu pdf-lib WinAnsi)', () => {
    const all = COMMENT_LIRE.body + glossaire().map((e) => e.terme + e.definition).join('');
    expect(all).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
