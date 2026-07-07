/**
 * Gap de contraste AJUSTÉ (Observatoire — la « vraie » correction des axes
 * catégoriels). Les gaps NATIONAUX bruts (`nationalContrastGap`) sont confondus
 * par la composition : selon l'axe, contrôler secteur/statut/région/capacité
 * change l'ampleur, voire INVERSE le signe (cf. fiche 9 étab/service, fiche 5
 * secteur). On estime donc l'effet propre du contraste par OLS du score sur
 * l'indicateur « cible » + des covariables de contrôle, avec SE robustes (HC0,
 * cohérent avec `analyzeMonoMulti`).
 *
 * Générique : `analyzeMonoMulti` est le cas particulier (cible = is_multi,
 * contrôles = région/statut/catégorie) — vérifié en golden.
 */

import { ols, hc0SE, normalTwoSidedP, invNorm } from './ols';
import { confidenceLevel } from './significance';

export interface AdjustedContrastRow {
  score: number;
  /** true = groupe cible, false = groupe référence (lignes hors contraste exclues en amont). */
  isTarget: boolean;
  /** Valeurs des contrôles catégoriels (une par dimension ; dummies drop-first). */
  catControls: string[];
  /** Valeurs des contrôles continus (ex. capacité), alignées entre lignes. */
  numControls?: number[];
}

export interface AdjustedGapResult {
  /** Coefficient ajusté sur l'indicateur cible = gap propre cible − référence. */
  gap: number;
  se: number;
  ciLow: number;
  ciHigh: number;
  p: number;
  n: number;
  nTarget: number;
  nReference: number;
  /** Nombre de colonnes du design (intercept + cible + dummies + continus). */
  k: number;
}

/** Niveaux distincts triés (ordre déterministe), 1er = référence droppée. */
function levels(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export function adjustedContrastGap(
  rows: AdjustedContrastRow[],
  ciLevel = confidenceLevel(),
): AdjustedGapResult | null {
  const nTarget = rows.filter((r) => r.isTarget).length;
  const nReference = rows.length - nTarget;
  // Dégénéré : un seul groupe observé → pas de contraste estimable.
  if (nTarget === 0 || nReference === 0) return null;

  const nCatDims = rows[0]?.catControls.length ?? 0;
  const nNumDims = rows[0]?.numControls?.length ?? 0;

  // Dummies drop-first par dimension catégorielle.
  const dimIdx: Map<string, number>[] = [];
  const dummyCounts: number[] = [];
  for (let d = 0; d < nCatDims; d++) {
    const lv = levels(rows.map((r) => r.catControls[d]));
    dimIdx.push(new Map(lv.slice(1).map((l, i) => [l, i])));
    dummyCounts.push(Math.max(0, lv.length - 1));
  }
  const dummyOffsets: number[] = [];
  let acc = 2; // [intercept, cible]
  for (let d = 0; d < nCatDims; d++) {
    dummyOffsets.push(acc);
    acc += dummyCounts[d];
  }
  const numOffset = acc;
  const k = numOffset + nNumDims;

  const X: number[][] = new Array(rows.length);
  const y: number[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = new Array<number>(k).fill(0);
    row[0] = 1; // intercept
    row[1] = r.isTarget ? 1 : 0;
    for (let d = 0; d < nCatDims; d++) {
      const idx = dimIdx[d].get(r.catControls[d]);
      if (idx !== undefined) row[dummyOffsets[d] + idx] = 1;
    }
    for (let n = 0; n < nNumDims; n++) row[numOffset + n] = r.numControls?.[n] ?? 0;
    X[i] = row;
    y[i] = r.score;
  }

  let beta: number;
  let sej: number;
  try {
    const fit = ols(X, y);
    const se = hc0SE(X, fit.residuals, fit.XtXinv);
    beta = fit.beta[1]; // indicateur cible
    sej = se[1];
  } catch {
    // Design SINGULIER (un contrôle colinéaire avec la cible, fréquent sur une
    // strate à faible effectif) : `ols`/Cholesky lève. On renvoie null — ce
    // contraste/strate est simplement omis — plutôt que de laisser l'exception
    // remonter et faire perdre TOUS les chiffres ajustés de la fiche.
    return null;
  }
  // Pivot quasi nul non capté par Cholesky → coefficients Inf/NaN : on écarte
  // (sinon « NaN pts » s'afficherait dans la fiche).
  if (!Number.isFinite(beta) || !Number.isFinite(sej)) return null;

  const t = beta / sej;
  const z = invNorm((1 + ciLevel) / 2);

  return {
    gap: beta,
    se: sej,
    ciLow: beta - z * sej,
    ciHigh: beta + z * sej,
    p: normalTwoSidedP(t),
    n: rows.length,
    nTarget,
    nReference,
    k,
  };
}
