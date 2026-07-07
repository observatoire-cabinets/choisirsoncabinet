// Aide de test partagée — extraction du texte réellement dessiné dans un PDF
// pdf-lib (StandardFonts / WinAnsi). Pas de dépendance externe (pdf-parse…).
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';

/**
 * Extrait le texte « affiché » d'un PDF pdf-lib (StandardFonts, WinAnsi) : les
 * opérateurs Tj/TJ encodent le texte en chaînes hexadécimales à l'intérieur de
 * content streams compressés FlateDecode. On inflate chaque stream et on
 * décode chaque `<hex>` en latin1 (= octets WinAnsi) pour retrouver le texte
 * réellement dessiné, tel que produit après `sanitizeForWinAnsi`.
 *
 * ATTENTION : les drawText adjacents et les lignes wrappées sont concaténés
 * SANS séparateur (l'espace de fin de ligne disparaît au wrapping) — pour
 * matcher une phrase multi-lignes, utiliser une regex tolérante aux espaces
 * (ex. `/n'est ?pas ?une ?causalité/`) ou un fragment court d'une seule ligne.
 */
export function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  let out = '';
  while ((m = streamRe.exec(raw))) {
    let inflated: string;
    try {
      inflated = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue; // stream binaire non-Flate (police embarquée, etc.)
    }
    const hexRe = /<([0-9A-Fa-f]+)>/g;
    let hm: RegExpExecArray | null;
    while ((hm = hexRe.exec(inflated))) {
      if (hm[1].length % 2 !== 0) continue;
      out += Buffer.from(hm[1], 'hex').toString('latin1');
    }
  }
  return out;
}
