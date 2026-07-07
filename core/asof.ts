// core/asof.ts

/**
 * Règle as-of FINESS (spécification exécutable du LATERAL de MONO_MULTI_EXTRACT_SQL) :
 * parmi `snapshots`, renvoie la plus récente <= `closeDate` ; si aucune n'est
 * antérieure ou égale (éval avant le plus ancien backfill, ou closeDate null),
 * repli documenté sur la snapshot la plus ANCIENNE. null si aucune snapshot.
 *
 * Le SQL fait cette même sélection en-DB (JOIN LATERAL ... ORDER BY ... LIMIT 1).
 * Cette fonction existe pour rendre la règle testable et auditable hors-DB.
 */
export function pickAsOfSnapshot(snapshots: Date[], closeDate: Date | null): Date | null {
  if (snapshots.length === 0) return null;
  const sorted = [...snapshots].sort((a, b) => a.getTime() - b.getTime());
  if (closeDate === null) return sorted[0];
  const onOrBefore = sorted.filter((s) => s.getTime() <= closeDate.getTime());
  if (onOrBefore.length > 0) return onOrBefore[onOrBefore.length - 1];
  return sorted[0];
}
