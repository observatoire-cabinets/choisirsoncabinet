/**
 * FINESS national répertoire — resolve the latest downloadable CSV from a
 * data.gouv.fr dataset by its STABLE dataset ID (never a dated URL).
 *
 * Résolveur autonome — aucune dépendance Prisma/réseau. Les URLs de ressources
 * sont datées et republiées mensuellement ;
 * on lit la liste des ressources du jeu et on choisit la plus récente.
 *
 * Slugs stables :
 *   - `finess-extraction-du-fichier-des-etablissements` (répertoire, geo→EJ)
 *   - `finess-extraction-des-equipements-sociaux-et-medico-sociaux` (capacité)
 */

export const FINESS_DATASET_API =
  'https://www.data.gouv.fr/api/1/datasets/finess-extraction-du-fichier-des-etablissements/';

export interface FinessResource {
  title?: string | null;
  format?: string | null;
  url?: string | null;
  last_modified?: string | null;
}

// Matches "...Etablissements au DD/MM/YYYY" but NOT "...géolocalisés au ...".
// Accent-tolerant on the leading É and case-insensitive.
const STOCK_TITLE_RE = /[eé]tablissements\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/i;

function titleDate(title: string): number {
  const m = STOCK_TITLE_RE.exec(title);
  if (!m) return 0;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

/**
 * Pick the latest non-geolocated "Établissements" stock CSV. Returns null when
 * no candidate matches (caller should treat that as a hard sync failure).
 */
export function pickLatestStockResource(
  resources: FinessResource[],
): FinessResource | null {
  const candidates = resources.filter((r) => {
    const title = (r.title ?? '').trim();
    const fmt = (r.format ?? '').toLowerCase();
    if (fmt !== 'csv') return false;
    if (!r.url) return false;
    if (/g[ée]olocalis/i.test(title)) return false;
    return STOCK_TITLE_RE.test(title);
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const da = titleDate(a.title ?? '');
    const db = titleDate(b.title ?? '');
    if (db !== da) return db - da;
    // Tie-break on last_modified when titles share a date.
    const ma = a.last_modified ? Date.parse(a.last_modified) : 0;
    const mb = b.last_modified ? Date.parse(b.last_modified) : 0;
    return mb - ma;
  });
  return candidates[0];
}

// ─── Capacité (FINESS cs1100505 — équipements sociaux et médico-sociaux) ──────

export const FINESS_CAPACITY_DATASET_API =
  'https://www.data.gouv.fr/api/1/datasets/finess-extraction-des-equipements-sociaux-et-medico-sociaux/';

const CAPACITY_TITLE_RE = /[ée]quipements\s+sociaux/i;

/** Date "au JJ/MM/AAAA" depuis un titre (tolérant établissements/équipements). */
function dateFromTitle(title: string): number {
  const m = /au\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(title);
  if (!m) return 0;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

/** Dernière ressource CSV « équipements sociaux et médico-sociaux » (capacité). */
export function pickLatestCapacityResource(
  resources: FinessResource[],
): FinessResource | null {
  const candidates = resources.filter((r) => {
    if ((r.format ?? '').toLowerCase() !== 'csv') return false;
    if (!r.url) return false;
    return CAPACITY_TITLE_RE.test((r.title ?? '').trim());
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const da = dateFromTitle(a.title ?? '');
    const db = dateFromTitle(b.title ?? '');
    if (db !== da) return db - da;
    const ma = a.last_modified ? Date.parse(a.last_modified) : 0;
    const mb = b.last_modified ? Date.parse(b.last_modified) : 0;
    return mb - ma;
  });
  return candidates[0];
}
