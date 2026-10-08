/**
 * Sanitisation WinAnsi partagée : les polices standard de pdf-lib (Helvetica,
 * encodage Windows-1252) lèvent une exception sur tout caractère hors de cet
 * encodage (flèche, emoji, espace fine insécable…) ; cette garde translittère ou
 * retire ces caractères avant tout drawText.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeForWinAnsi, sanitizeForWinAnsiInsecable } from './winansi';

describe('sanitizeForWinAnsi', () => {
  it('normalise guillemets typographiques, tirets, points de suspension', () => {
    expect(sanitizeForWinAnsi('‘a’ “b”')).toBe("'a' \"b\"");
    expect(sanitizeForWinAnsi('a–b')).toBe('a-b'); // en-dash
    expect(sanitizeForWinAnsi('a—b')).toBe('a - b'); // em-dash
    expect(sanitizeForWinAnsi('a…')).toBe('a...'); // ellipsis
  });

  it('remplace l\'espace insécable et la ligature œ', () => {
    expect(sanitizeForWinAnsi('a b')).toBe('a b'); // nbsp → espace
    expect(sanitizeForWinAnsi('œuvre Œ')).toBe('oeuvre OE');
  });

  it('translittère les symboles fréquents hors WinAnsi (≥ ≤ → ← Δ)', () => {
    expect(sanitizeForWinAnsi('Fiable (≥ 30)')).toBe('Fiable (>= 30)');
    expect(sanitizeForWinAnsi('≤ 10')).toBe('<= 10');
    expect(sanitizeForWinAnsi('a→b')).toBe('a->b');
    expect(sanitizeForWinAnsi('a←b')).toBe('a<-b');
    expect(sanitizeForWinAnsi('Δ vs national')).toBe('Delta vs national');
  });

  it('SUPPRIME les caractères vraiment non translittérables (la cause du 500)', () => {
    expect(sanitizeForWinAnsi('ok🔴')).toBe('ok'); // emoji palier
    expect(sanitizeForWinAnsi('ok✅')).toBe('ok'); // emoji ✅
    expect(sanitizeForWinAnsi('中a')).toBe('a'); // CJK 中
    expect(sanitizeForWinAnsi('30 %')).toBe('30%'); // espace fine insécable
  });

  it('préserve les accents français WinAnsi-safe', () => {
    expect(sanitizeForWinAnsi('é è ç à ê î ô û')).toBe('é è ç à ê î ô û');
  });
});

describe('sanitizeForWinAnsiInsecable', () => {
  it('même assainissement, espaces insécables conservées', () => {
    expect(sanitizeForWinAnsiInsecable('n = 1\u00A0998 · a—b ≥ 2')).toBe('n = 1\u00A0998 · a - b >= 2');
    expect(sanitizeForWinAnsi('1\u00A0998')).toBe('1 998');
  });
});
