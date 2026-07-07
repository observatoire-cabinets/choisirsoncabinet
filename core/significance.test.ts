import { describe, it, expect, afterEach } from 'vitest';
import {
  significanceAlpha,
  confidenceLevel,
  setSignificanceAlpha,
  ciLabel,
  alphaLabel,
  alphaValueLabel,
  ciPercentLabel,
} from './significance';

afterEach(() => setSignificanceAlpha(0.05));

describe('significance config', () => {
  it('défaut = 0,05 / IC 95 %', () => {
    expect(significanceAlpha()).toBe(0.05);
    expect(confidenceLevel()).toBeCloseTo(0.95, 12);
    expect(ciLabel()).toBe('IC 95 %');
  });
  it('bascule 0,01 / IC 99 %', () => {
    setSignificanceAlpha(0.01);
    expect(confidenceLevel()).toBeCloseTo(0.99, 12);
    expect(ciLabel()).toBe('IC 99 %');
  });
  it('rejette un alpha hors {0.05, 0.01}', () => {
    expect(() => setSignificanceAlpha(0.2 as never)).toThrow();
  });
  // « alpha » épelé (pas le glyphe grec α) : ces libellés partent dans des PDF
  // WinAnsi (StandardFonts) où sanitizeForWinAnsi SUPPRIME α (hors 0x20-0xFF),
  // ce qui rendait « seuil  = 0,05 » (double espace orphelin).
  it('libellés dérivés au défaut 0,05 : alphaLabel / alphaValueLabel / ciPercentLabel', () => {
    expect(alphaLabel()).toBe('alpha = 0,05');
    expect(alphaValueLabel()).toBe('0,05');
    expect(ciPercentLabel()).toBe('95 %');
  });
  it('libellés dérivés à la bascule 0,01 : alphaLabel / alphaValueLabel / ciPercentLabel', () => {
    setSignificanceAlpha(0.01);
    expect(alphaLabel()).toBe('alpha = 0,01');
    expect(alphaValueLabel()).toBe('0,01');
    expect(ciPercentLabel()).toBe('99 %');
  });
  it('alphaLabel est WinAnsi-safe (aucun caractère hors plage, pas de glyphe grec)', () => {
    for (const a of [0.05, 0.01] as const) {
      setSignificanceAlpha(a);
      expect(alphaLabel()).not.toMatch(/[^\x20-\x7E\xA0-\xFF]/);
    }
  });
});
