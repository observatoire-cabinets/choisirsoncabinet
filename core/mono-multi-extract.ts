/**
 * Mono/multi extraction — natif.
 *
 * Builds the analysis dataset (`MonoMultiRow[]`) directly from the source
 * tables, then feeds `analyzeMonoMulti`. Reproduces the V1.0 reference derivation
 * (golden β=+4,06, N=18 795) without any offline file:
 *   - `moy_objectifs_100` + `essms_statut_juridique` come from `has_essms_open.raw`
 *     (parquet columns not promoted to first-class).
 *   - region/catégorie are first-class columns on `has_essms_open`.
 *   - `is_multi` = opérateur C: INNER JOIN on `finess_ej_mapping` (latest dated
 *     snapshot) requiring a national finess_ej, then `ej_size >= 2`.
 *   - rows without `moy_objectifs_100` are dropped (the 153 "lost at merge").
 *
 * finess_geo is LPAD-ed to 9 on both sides: the parquet drops leading zeros for
 * some codes, the FINESS répertoire keeps them.
 */

import { analyzeMonoMulti, type MonoMultiRow, type MonoMultiResult } from './mono-multi-analysis';
import { confidenceLevel } from './significance';
import {
  analyzeAxisByCabinet,
  type CabinetAxisRow,
  type CabinetAxisResult,
  type CabinetMethod,
} from './cabinet-axis';
import {
  analyzeContrastByCabinet,
  nationalContrastGap,
  type AxisContrast,
  type CategoricalRow,
} from './cabinet-axis-categorical';

// AS-OF : chaque éval est appariée au snapshot FINESS le plus récent ANTÉRIEUR
// ou égal à sa date de clôture (e.eval_date_cloture_tech), au lieu du snapshot courant
// plaqué sur tout (ancien `= (SELECT MAX(snapshot_date) …)`). Repli documenté : si aucun
// snapshot n'est <= la clôture (éval avant le 1er backfill, ou clôture NULL), on prend le
// PLUS ANCIEN snapshot (ordre final `… ASC`) — garde l'éval. Sémantique = pickAsOfSnapshot
// (cf. asof.ts), implémentée ici en-DB. lpad préservé des deux côtés.
export const MONO_MULTI_EXTRACT_SQL = `
  SELECT
    (e.raw->>'moy_objectifs_100')::float8           AS score,
    (m.ej_size >= 2)                                AS is_multi,
    m.ej_size                                       AS ej_size,
    COALESCE(e.region_libelle, '')                  AS region,
    COALESCE(e.raw->>'essms_statut_juridique', '')  AS statut,
    COALESCE(e.essms_categ_finess_libelle, '')      AS categ,
    COALESCE(e.essms_categ_finess_code, '')         AS code,
    COALESCE(e.departement_code, '')                AS departement,
    e.eval_date_cloture_tech                        AS eval_date,
    c.capacity_installed                            AS capacity,
    e.oe_nom                                        AS cabinet
  FROM has_essms_open e
  JOIN LATERAL (
    SELECT mm.ej_size
    FROM finess_ej_mapping mm
    WHERE lpad(mm.finess_geo, 9, '0') = lpad(e.finess_geo, 9, '0')
    ORDER BY
      (e.eval_date_cloture_tech IS NOT NULL
        AND mm.snapshot_date <= e.eval_date_cloture_tech::date)                 DESC,
      CASE WHEN e.eval_date_cloture_tech IS NOT NULL
                AND mm.snapshot_date <= e.eval_date_cloture_tech::date
           THEN mm.snapshot_date END                                           DESC NULLS LAST,
      mm.snapshot_date ASC
    LIMIT 1
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT cc.capacity_installed
    FROM finess_capacity cc
    WHERE lpad(cc.finess_geo, 9, '0') = lpad(e.finess_geo, 9, '0')
    ORDER BY
      (e.eval_date_cloture_tech IS NOT NULL
        AND cc.snapshot_date <= e.eval_date_cloture_tech::date)                 DESC,
      CASE WHEN e.eval_date_cloture_tech IS NOT NULL
                AND cc.snapshot_date <= e.eval_date_cloture_tech::date
           THEN cc.snapshot_date END                                           DESC NULLS LAST,
      cc.snapshot_date ASC
    LIMIT 1
  ) c ON true
  WHERE e.raw->>'moy_objectifs_100' IS NOT NULL
`;

// TRANSITOIRE (verrou (a)) : l'ancien join "snapshot courant pour tous". Conservé
// UNIQUEMENT comme garde anti-régression testée (comparaison legacy-MAX vs as-of).
// À SUPPRIMER une fois l'as-of validé et canonique (méthode unique, pas de double-mode).
export const MONO_MULTI_EXTRACT_SQL_LEGACY_MAX = `
  SELECT
    (e.raw->>'moy_objectifs_100')::float8           AS score,
    (m.ej_size >= 2)                                AS is_multi,
    m.ej_size                                       AS ej_size,
    COALESCE(e.region_libelle, '')                  AS region,
    COALESCE(e.raw->>'essms_statut_juridique', '')  AS statut,
    COALESCE(e.essms_categ_finess_libelle, '')      AS categ,
    COALESCE(e.essms_categ_finess_code, '')         AS code,
    COALESCE(e.departement_code, '')                AS departement,
    e.eval_date_cloture_tech                        AS eval_date,
    c.capacity_installed                            AS capacity,
    e.oe_nom                                        AS cabinet
  FROM has_essms_open e
  JOIN finess_ej_mapping m
    ON m.snapshot_date = (SELECT MAX(snapshot_date) FROM finess_ej_mapping)
   AND lpad(m.finess_geo, 9, '0') = lpad(e.finess_geo, 9, '0')
  LEFT JOIN finess_capacity c
    ON c.snapshot_date = (SELECT MAX(snapshot_date) FROM finess_capacity)
   AND lpad(c.finess_geo, 9, '0') = lpad(e.finess_geo, 9, '0')
  WHERE e.raw->>'moy_objectifs_100' IS NOT NULL
`;

export interface RawMonoMultiExtractRow {
  score: number | string;
  is_multi: boolean | string | number;
  region: string | null;
  statut: string | null;
  categ: string | null;
  /** oe_nom (cabinet évaluateur) — présent depuis l'extraction par-cabinet. */
  cabinet?: string | null;
  /** essms_categ_finess_code — pour les axes secteur (fiche 5) et étab/service (fiche 9). */
  code?: string | null;
  /** departement_code — pour l'axe DROM vs métropole (fiche 11). */
  departement?: string | null;
  /** eval_date_cloture_tech — pour l'axe temporel S1/S2 (fiche 8). */
  eval_date?: Date | string | null;
  /** capacity_installed (LEFT JOIN finess_capacity) — pour l'axe capacité (fiche 6). */
  capacity?: number | string | null;
  /** ej_size — taille réelle de l'entité juridique (fiche 7, proxy groupe lucratif). */
  ej_size?: number | string | null;
}

export interface MonoMultiExtractPrisma {
  $queryRawUnsafe: (sql: string) => Promise<RawMonoMultiExtractRow[]>;
}

/** Coerce a raw SQL row into a typed `MonoMultiRow` (driver-agnostic). */
export function mapExtractedRow(row: RawMonoMultiExtractRow): MonoMultiRow {
  const isMulti =
    row.is_multi === true || row.is_multi === 't' || row.is_multi === 1 || row.is_multi === '1';
  return {
    score: Number(row.score),
    isMulti,
    region: row.region ?? '',
    statut: row.statut ?? '',
    categ: row.categ ?? '',
  };
}

export async function extractRaw(
  prisma: MonoMultiExtractPrisma,
  sql: string = MONO_MULTI_EXTRACT_SQL,
): Promise<RawMonoMultiExtractRow[]> {
  const rows = await prisma.$queryRawUnsafe(sql);
  if (rows.length === 0) {
    throw new Error(
      'extractMonoMultiRows: empty dataset — has_essms_open or finess_ej_mapping (no as-of snapshot) not populated',
    );
  }
  return rows;
}

/** Extract the mono/multi analysis dataset from the source tables. */
export async function extractMonoMultiRows(
  prisma: MonoMultiExtractPrisma,
  sql: string = MONO_MULTI_EXTRACT_SQL,
): Promise<MonoMultiRow[]> {
  return (await extractRaw(prisma, sql)).map(mapExtractedRow);
}

/** Extract from the source tables then run the OLS mono/multi analysis. */
export async function analyzeMonoMultiFromProd(
  prisma: MonoMultiExtractPrisma,
  sql: string = MONO_MULTI_EXTRACT_SQL,
  ciLevel = confidenceLevel(),
): Promise<MonoMultiResult> {
  const rows = await extractMonoMultiRows(prisma, sql);
  return analyzeMonoMulti(rows, ciLevel);
}

/** Coerce a raw row into a CabinetAxisRow, or null when no cabinet (oe_nom). */
export function mapCabinetAxisRow(row: RawMonoMultiExtractRow): CabinetAxisRow | null {
  const cabinet = row.cabinet ?? null;
  if (!cabinet) return null;
  const exposed =
    row.is_multi === true || row.is_multi === 't' || row.is_multi === 1 || row.is_multi === '1';
  return { cabinet, score: Number(row.score), exposed };
}

/** Extract per-cabinet rows (mono/multi axis) — drops rows w/o cabinet. */
export async function extractCabinetAxisRows(
  prisma: MonoMultiExtractPrisma,
): Promise<CabinetAxisRow[]> {
  return (await extractRaw(prisma))
    .map(mapCabinetAxisRow)
    .filter((r): r is CabinetAxisRow => r !== null);
}

/**
 * Per-cabinet mono/multi analysis: ranks every cabinet on the axis,
 * with Δ vs the national raw gap. One extraction shared for national + cabinets.
 */
export async function analyzeMonoMultiByCabinetFromProd(
  prisma: MonoMultiExtractPrisma,
  opts: { extraMethods?: CabinetMethod[] } = {},
): Promise<CabinetAxisResult[]> {
  const raw = await extractRaw(prisma);
  const national = analyzeMonoMulti(raw.map(mapExtractedRow));
  const cabinetRows = raw
    .map(mapCabinetAxisRow)
    .filter((r): r is CabinetAxisRow => r !== null);
  return analyzeAxisByCabinet(cabinetRows, {
    nationalGap: national.gapRaw,
    extraMethods: opts.extraMethods,
  });
}

// ─── Axe STATUT JURIDIQUE (fiche n°002) — catégoriel via contrastes vs Public ──

/** Contrastes du statut juridique : chaque privé comparé au public (référence). */
export const STATUT_CONTRASTS: AxisContrast[] = [
  {
    id: 'nonlucratif_vs_public',
    label: 'Privé à but non lucratif vs Public',
    reference: 'Public',
    target: 'Privé à but non lucratif',
  },
  {
    id: 'commercial_vs_public',
    label: 'Privé commercial vs Public',
    reference: 'Public',
    target: 'Privé commercial',
  },
];

/** Mappe une ligne brute en ligne catégorielle statut (drop si cabinet/statut absent). */
export function mapStatutCategoricalRow(row: RawMonoMultiExtractRow): CategoricalRow | null {
  const cabinet = row.cabinet ?? null;
  // Trim aligné sur le national (deriveStatut) : sinon « Public » ≠ « Public »
  // et le head ajusté et le classement par cabinet porteraient sur des jeux
  // de lignes différents.
  const category = (row.statut ?? '').trim() || null;
  if (!cabinet || !category) return null;
  return { cabinet, score: Number(row.score), category };
}

export async function extractStatutAxisRows(
  prisma: MonoMultiExtractPrisma,
): Promise<CategoricalRow[]> {
  return (await extractRaw(prisma))
    .map(mapStatutCategoricalRow)
    .filter((r): r is CategoricalRow => r !== null);
}

export interface StatutContrastReport {
  contrast: AxisContrast;
  nationalGap: number | null;
  results: CabinetAxisResult[];
}

/** Analyse par cabinet de l'axe statut : un rapport par contraste vs Public. */
export async function analyzeStatutByCabinetFromProd(
  prisma: MonoMultiExtractPrisma,
  opts: { extraMethods?: CabinetMethod[] } = {},
): Promise<StatutContrastReport[]> {
  const rows = await extractStatutAxisRows(prisma);
  return STATUT_CONTRASTS.map((contrast) => ({
    contrast,
    nationalGap: nationalContrastGap(rows, contrast),
    results: analyzeContrastByCabinet(rows, contrast, { extraMethods: opts.extraMethods }),
  }));
}
