import { describe, it, expect, afterEach } from 'vitest';
import { guideMethodesSections } from './guide-methodes-content';
import { setSignificanceAlpha } from './significance';

afterEach(() => setSignificanceAlpha(0.05));

describe('guideMethodesSections', () => {
  it('est une liste non vide de sections (titre + corps)', () => {
    const sections = guideMethodesSections();
    expect(sections.length).toBeGreaterThan(3);
    for (const s of sections) {
      expect(s.heading.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it('couvre M1/M2/M3, les paliers et Welch', () => {
    const text = guideMethodesSections().map((s) => `${s.heading} ${s.body}`).join(' ');
    for (const token of ['M1', 'M2', 'M3', 'Welch', 'Cohen', 'Fiable', 'descriptif', 'causalité']) {
      expect(text).toContain(token);
    }
  });

  it('défaut : cite le seuil 0,05 / IC 95 % ; bascule 0,01 / IC 99 % sur setSignificanceAlpha', () => {
    const textDefault = guideMethodesSections().map((s) => s.body).join(' ');
    expect(textDefault).toContain('p < 0,05');
    expect(textDefault).toContain('95 %');
    setSignificanceAlpha(0.01);
    const text01 = guideMethodesSections().map((s) => s.body).join(' ');
    expect(text01).toContain('p < 0,01');
    expect(text01).toContain('99 %');
  });

  it('aucun glyphe strippé par WinAnsi (α/β grecs, − U+2212, ≠ U+2260) — le PDF perdrait le caractère', () => {
    // sanitizeForWinAnsi SUPPRIME (sans translittérer) α, β, − et ≠ : « cible − moyenne »
    // rendait « cible moyenne » et « Association ≠ causalité » rendait « Association
    // causalité » — sens INVERSÉ. Δ/≥/≤/→ restent permis (translittérés).
    const text = guideMethodesSections().map((s) => `${s.heading} ${s.body}`).join(' ');
    expect(text).not.toMatch(/[αβ−≠]/);
    expect(text).toContain('cible - moyenne du groupe de référence');
    expect(text).toContain('écart du cabinet - écart national brut');
    expect(text).toContain('Une association n’est pas une causalité');
  });
});
