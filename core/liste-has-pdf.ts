/**
 * Extraction du texte du PDF de la liste HAS des organismes autorisés.
 * Implémentation pure : Buffer → string, pas d'I/O fichier ni réseau.
 * pdfjs-dist est ESM-only → import dynamique (même précédent que hyparquet
 * dans has-parse.ts) ; le build legacy fonctionne sous Node sans worker.
 */
import { Buffer } from 'node:buffer';

/**
 * Renvoie le texte du document, une entrée par item pdfjs, avec sauts de
 * ligne aux fins de ligne détectées (`hasEOL`) et entre pages. C'est CE
 * texte que l'analyseur (liste-has-parse.ts) découpe — les regex de
 * l'analyseur sont écrites pour cette forme précise.
 */
export async function extractListeHasText(pdf: Buffer): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdfjs mute le buffer reçu : copie défensive.
  const data = new Uint8Array(pdf.byteLength);
  data.set(pdf);
  const loadingTask = getDocument({ data, useSystemFonts: true });
  let doc: Awaited<typeof loadingTask.promise>;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    await loadingTask.destroy();
    throw err;
  }
  try {
    let out = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ('str' in item) {
          out += item.str;
          if (item.hasEOL) out += '\n';
        }
      }
      out += '\n';
    }
    return out;
  } finally {
    await doc.destroy();
  }
}
