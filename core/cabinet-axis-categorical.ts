/**
 * Axes CATÉGORIELS via contrastes (cadre réutilisable).
 *
 * Un axe à K niveaux (ex. statut juridique : Public / Privé non lucratif / Privé
 * commercial) est décomposé en (K−1) contrastes binaires contre un niveau de
 * référence. Chaque contraste RÉUTILISE le moteur binaire M1/M2/M3
 * (`analyzeAxisByCabinet`), reste vérifiable à la main, et s'applique tel quel
 * aux fiches région/secteur.
 */

import {
  analyzeAxisByCabinet,
  type CabinetAxisRow,
  type CabinetAxisResult,
  type CabinetMethod,
} from './cabinet-axis';

export interface CategoricalRow {
  cabinet: string;
  score: number;
  category: string;
}

export interface AxisContrast {
  id: string;
  label: string;
  reference: string;
  target: string;
}

/** Restreint aux niveaux référence/cible ; exposed = appartenance à la cible. */
export function toContrastRows(rows: CategoricalRow[], c: AxisContrast): CabinetAxisRow[] {
  const out: CabinetAxisRow[] = [];
  for (const r of rows) {
    if (r.category === c.target) out.push({ cabinet: r.cabinet, score: r.score, exposed: true });
    else if (r.category === c.reference)
      out.push({ cabinet: r.cabinet, score: r.score, exposed: false });
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

/** Écart national brut du contraste : moyenne(cible) − moyenne(référence). */
export function nationalContrastGap(rows: CategoricalRow[], c: AxisContrast): number | null {
  const target = rows.filter((r) => r.category === c.target).map((r) => r.score);
  const reference = rows.filter((r) => r.category === c.reference).map((r) => r.score);
  if (target.length === 0 || reference.length === 0) return null;
  return mean(target) - mean(reference);
}

/** Analyse par cabinet d'un contraste catégoriel (réutilise le moteur binaire). */
export function analyzeContrastByCabinet(
  rows: CategoricalRow[],
  c: AxisContrast,
  opts: { extraMethods?: CabinetMethod[] } = {},
): CabinetAxisResult[] {
  return analyzeAxisByCabinet(toContrastRows(rows, c), {
    nationalGap: nationalContrastGap(rows, c),
    extraMethods: opts.extraMethods,
  });
}
