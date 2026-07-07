/**
 * HAS Open Data — parquet + JSONL → shapes du STORE.
 *
 * Partie PARSING (parse-essms, parse, base-doc-parse) produisant directement
 * les shapes `Dataset` (types.ts) plutôt que des inputs Prisma. Deux
 * désenchevêtrements assumés :
 *
 *  1. Un parseur exhaustif rangerait TOUTES les colonnes non promues dans
 *     un objet `raw` (≈160 cols × 19 735 lignes). Le store n'a besoin que de
 *     ~10 champs → `essmsRowFromRaw` lit directement les colonnes du parquet
 *     brut, à l'identique de ce que l'export SQL SÉLECTIONNE :
 *     `raw->>'moy_objectifs_100'`
 *     ::float8, `raw->>'essms_statut_juridique'`, COALESCE '' des libellés, etc.
 *  2. Conserver `rawJson: raw` serait INTENABLE en mémoire sur le
 *     JSONL national ~308 Mo. `parseBaseDocJsonlLine` extrait UNIQUEMENT le
 *     sous-ensemble store (nom officiel + adresse coordonnees[0]) — équivalent au
 *     SELECT `has_official_label`, `raw_json->'coordonnees'->0->>'adresse_...'`,
 *     `postal_code`, `commune` de l'export.
 *
 * hyparquet est ESM-only → `await import('hyparquet')` (import dynamique).
 */

import type { EssmsRow, EvalHistoryRow, BaseDocRow } from '../store/types';

/** Objet brut tel que rendu par hyparquet pour une ligne (par_essms / par_eval). */
export type RawParquetRow = Record<string, unknown>;

// URLs miroir des mirrors HAS.
export const HAS_ESSMS_URL =
  'https://minio.data.has-sante.fr/synae/data/prod/open_data/open_data_par_essms.parquet';
export const HAS_EVAL_URL =
  'https://minio.data.has-sante.fr/synae/data/prod/open_data/open_data_par_eval.parquet';
export const HAS_BASE_DOC_URL =
  'https://minio.data.has-sante.fr/synae/data/prod/open_data/base_document_essms.jsonl';

// ─── Coercions ──────────────────────────────────────────────────────────────

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  return String(v);
}

function asDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * YYYY-MM-DD en UTC. Miroir de `to_char((ts AT TIME ZONE 'UTC')::date,'YYYY-MM-DD')`
 * de l'export : les valeurs DATE du parquet sont décodées à minuit UTC par
 * hyparquet, donc formater les composantes UTC reproduit exactement l'export.
 */
export function toUtcDateString(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── par_essms → EssmsRow ────────────────────────────────────────────────────────

/**
 * Une ligne brute par_essms → `EssmsRow`. Reproduit clause pour clause le SELECT
 * de l'export sur has_essms_open (finess_geo brut ; score = moy_objectifs_100
 * ::float8, null si absent ; COALESCE '' pour region/statut/categ/categCode/
 * departement ; oe_nom SANS coalesce ; evalDate = ::date UTC).
 */
export function essmsRowFromRaw(raw: RawParquetRow): EssmsRow {
  const finessGeo = asString(raw.finess_geo);
  if (!finessGeo) throw new Error('essmsRowFromRaw: finess_geo requis mais absent');
  const moy = raw.moy_objectifs_100;
  const score = moy === null || moy === undefined ? null : Number(moy as number | string);
  return {
    finessGeo,
    score: score !== null && Number.isFinite(score) ? score : null,
    cabinet: asString(raw.oe_nom), // oe_nom : PAS de COALESCE (null passe tel quel)
    raisonSociale: asString(raw.raison_sociale),
    region: asString(raw.region_libelle) ?? '',
    statut: asString(raw.essms_statut_juridique) ?? '',
    categ: asString(raw.essms_categ_finess_libelle) ?? '',
    categCode: asString(raw.essms_categ_finess_code) ?? '',
    departement: asString(raw.departement_code) ?? '',
    evalDate: toUtcDateString(asDate(raw.eval_date_cloture_tech)),
  };
}

/** par_essms → EssmsRow[], dédupliqué par finess_geo (dernier gagne = upsert PK). */
export function essmsRowsToStore(rows: RawParquetRow[]): EssmsRow[] {
  const byGeo = new Map<string, EssmsRow>();
  for (const raw of rows) {
    const r = essmsRowFromRaw(raw);
    byGeo.set(r.finessGeo, r);
  }
  return [...byGeo.values()];
}

// ─── par_eval → EvalHistoryRow ───────────────────────────────────────────────────

/** Une ligne brute par_eval → `EvalHistoryRow` (eval_code requis = PK, cf. mapRow). */
export function evalHistoryRowFromRaw(raw: RawParquetRow): EvalHistoryRow {
  const evalCode = asString(raw.eval_code);
  if (!evalCode) throw new Error('evalHistoryRowFromRaw: eval_code requis mais absent');
  return {
    evalCode,
    cabinet: asString(raw.oe_nom),
    dateCloture: toUtcDateString(asDate(raw.eval_date_cloture_tech)),
    region: asString(raw.region_libelle),
  };
}

/** par_eval → EvalHistoryRow[], dédupliqué par eval_code (dernier gagne = upsert PK). */
export function evalHistoryRowsToStore(rows: RawParquetRow[]): EvalHistoryRow[] {
  const byCode = new Map<string, EvalHistoryRow>();
  for (const raw of rows) {
    const r = evalHistoryRowFromRaw(raw);
    byCode.set(r.evalCode, r);
  }
  return [...byCode.values()];
}

// ─── base_document_essms.jsonl → BaseDocRow ─────────────────────────────────────

interface RawBaseDocCoord {
  adresse_postale_ligne_1?: string | null;
  adresse_postale_ligne_2?: string | null;
  code_postal?: string | null;
  libelle_commune?: string | null;
}
interface RawBaseDoc {
  finess_geo?: string | null;
  identification?: { raison_sociale_et?: string | null } | null;
  coordonnees?: RawBaseDocCoord[] | null;
}

/** Objet base-doc déjà parsé → BaseDocRow, ou null si finess_geo manquant. */
export function baseDocRowFromObject(obj: RawBaseDoc): BaseDocRow | null {
  const finessGeo = asString(obj.finess_geo);
  if (!finessGeo) return null;
  const coord = obj.coordonnees && obj.coordonnees.length > 0 ? obj.coordonnees[0] : null;
  const id = obj.identification ?? null;
  return {
    finessGeo,
    officialLabel: asString(id?.raison_sociale_et),
    addressLine1: asString(coord?.adresse_postale_ligne_1),
    addressLine2: asString(coord?.adresse_postale_ligne_2),
    postalCode: asString(coord?.code_postal),
    commune: asString(coord?.libelle_commune),
  };
}

/**
 * Une ligne JSONL → BaseDocRow, ou null (ligne vide, JSON malformé, ou
 * finess_geo manquant). Miroir de `parseBaseDocLine` (src), sans conserver rawJson.
 */
export function parseBaseDocJsonlLine(line: string): BaseDocRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj: RawBaseDoc;
  try {
    obj = JSON.parse(trimmed) as RawBaseDoc;
  } catch {
    return null;
  }
  return baseDocRowFromObject(obj);
}

// ─── Lecture parquet (hyparquet, import dynamique ESM) ──────────────────────────

/**
 * Lit un buffer parquet HAS (par_eval OU par_essms) → lignes brutes. Copie de
 * `parseHasParquet` (src) : matérialise un ArrayBuffer neuf (exigence AsyncBuffer
 * hyparquet : ni SharedArrayBuffer ni Buffer).
 */
export async function readParquet(buffer: ArrayBuffer | Buffer): Promise<RawParquetRow[]> {
  const view = new Uint8Array(buffer);
  const file = new ArrayBuffer(view.byteLength);
  new Uint8Array(file).set(view);
  const { parquetReadObjects } = await import('hyparquet');
  return (await parquetReadObjects({ file })) as RawParquetRow[];
}
