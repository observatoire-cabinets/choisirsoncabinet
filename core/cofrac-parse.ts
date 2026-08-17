/**
 * Extraction du relevé public COFRAC des suspensions, résiliations et retraits
 * d'accréditation (tableau HTML de https://tools.cofrac.fr/fr/easysearch/rrs.php).
 * Implémentation pure : string → lignes structurées, aucun I/O.
 * Seules les décisions de la section 3 (Inspection, numéro 3-\d{3,5}) sont
 * conservées. Extraction DÉFENSIVE : une page méconnaissable rend [] — une
 * concordance ne doit jamais naître d'un HTML inattendu.
 *
 * Découpage volontairement linéaire (split + indexOf) : la page vient d'un
 * serveur externe non maîtrisé, et une balise ouvrante jamais refermée rend un
 * découpage par regex à quantificateur paresseux (/<tr>...<\/tr>/) quadratique
 * sur de gros documents.
 */

export interface CofracRrsRow {
  /** Numéro d'accréditation (3-XXX à 3-XXXXX). */
  num: string;
  nom: string;
  /** Date affichée par la page (JJ/MM/AAAA), null si absente. */
  date: string | null;
  /** Texte libre restant (commentaire, transfert), nettoyé, null si vide. */
  commentaire: string | null;
}

const RE_TAG = /<[^>]+>/g;
const RE_NUM = /^3-\d{3,5}$/;
const RE_DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const RE_TR_OPEN = /<tr[^>]*>/i;
const RE_CELL_OPEN = /<t[dh][^>]*>/i;

const clean = (s: string): string =>
  s
    .replace(RE_TAG, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&') // décodé en dernier : évite un double décodage de « &amp;#039; ».
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Retire les commentaires HTML avant tout découpage, par balayage linéaire.
 * Une rangée neutralisée par <!-- --> n'est pas une décision publiée.
 */
function stripComments(s: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const start = s.indexOf('<!--', i);
    if (start === -1) {
      out += s.slice(i);
      return out;
    }
    out += s.slice(i, start);
    out += ' ';
    const end = s.indexOf('-->', start + 4);
    if (end === -1) return out; // commentaire non refermé : tronque jusqu'à la fin.
    i = end + 3;
  }
}

/** Découpe une rangée en cellules nettoyées par split linéaire sur les balises ouvrantes. */
function extractCells(corps: string): string[] {
  const pieces = corps.split(RE_CELL_OPEN);
  const cells: string[] = [];
  for (let j = 1; j < pieces.length; j++) {
    const piece = pieces[j];
    const closeIdx = piece.indexOf('</t');
    const raw = closeIdx === -1 ? piece : piece.slice(0, closeIdx);
    cells.push(clean(raw));
  }
  return cells;
}

export function parseCofracRrsHtml(htmlContent: string): CofracRrsRow[] {
  const rows: CofracRrsRow[] = [];
  const sansCommentaires = stripComments(htmlContent);
  const chunks = sansCommentaires.split(RE_TR_OPEN);
  for (let k = 1; k < chunks.length; k++) {
    const chunk = chunks[k];
    const fin = chunk.indexOf('</tr>');
    const corps = fin === -1 ? chunk : chunk.slice(0, fin);
    const cells = extractCells(corps);
    if (cells.length < 2) continue;
    // La cellule numéro peut ne pas être la première (colonne d'icône avant) : on la cherche.
    const numIdx = cells.findIndex((c) => RE_NUM.test(c));
    if (numIdx === -1) continue;
    const num = cells[numIdx];
    const nom = cells[numIdx + 1] ?? '';
    if (!nom) continue;
    const date = cells.find((c) => RE_DATE.test(c)) ?? null;
    const commentaire =
      cells
        .filter((_, i) => i !== numIdx && i !== numIdx + 1)
        .filter((c) => c && !RE_DATE.test(c))
        .join(' · ') || null;
    rows.push({ num, nom, date, commentaire });
  }
  return rows;
}
