/**
 * Sanitisation WinAnsi partagée.
 *
 * createPdfFromText (text-formats) embarquait StandardFonts.Helvetica (encodage
 * WinAnsi/Windows-1252) sans aucune sanitisation, contrairement au générateur
 * frère pdf-generator. Un caractère hors Windows-1252 (flèche, emoji, espace
 * fine insécable…) émis par le LLM dans une lettre de recours faisait throw
 * pdf-lib → 500 non catché. On extrait le guard (verbatim) en util partagé.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeForWinAnsi } from './winansi';

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
