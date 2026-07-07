/**
 * Calcul mono/multi (fiche n°001) à partir d'un dataset déjà extrait.
 *
 * Reproduit le modèle de référence (statsmodels) : OLS de `moy_objectifs_100`
 * sur `is_multi` + effets fixes (région, statut juridique, catégorie FINESS),
 * erreurs-standards robustes. Validé golden contre les données HAS réelles
 * (cf. mono-multi-analysis.test.ts).
 *
 * SE : on utilise HC0 (et non HC3) car certaines catégories FINESS n'ont qu'une
 * observation → levier hᵢᵢ≈1 → HC3 (eᵢ/(1−hᵢᵢ)) dégénère en 0/0 (NaN). À
 * N≈18 800 et leviers négligeables, HC0 ≈ HC1 ≈ HC3 ; HC0 reproduit l'IC publié
 * [3,40 ; 4,72]. (hc3SE reste dispo dans le moteur pour les designs sans singleton.)
 *
 * Pur (pas d'I/O) : l'extraction depuis les tables sources est faite en amont.
 */

import { ols, hc0SE, normalTwoSidedP, invNorm } from './ols';
import { confidenceLevel } from './significance';

export interface MonoMultiRow {
  score: number; // moy_objectifs_100 (0-100)
  isMulti: boolean;
  region: string;
  statut: string;
  categ: string;
}

export interface MonoMultiResult {
  n: number;
  nMono: number;
  nMulti: number;
  meanMono: number;
  meanMulti: number;
  sdMono: number; // écart-type d'échantillon (ddof=1) des scores mono ; NaN si nMono<2
  sdMulti: number; // écart-type d'échantillon (ddof=1) des scores multi ; NaN si nMulti<2
  gapRaw: number; // meanMulti - meanMono
  betaAdj: number; // coefficient is_multi après contrôles
  se: number;
  t: number;
  p: number;
  ciLow: number;
  ciHigh: number;
  ciLevel: number;
  k: number; // nombre de colonnes du design
}

/** Niveaux distincts triés (ordre déterministe), 1er = référence (drop). */
function levels(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function mean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

/** Écart-type d'échantillon (ddof=1, comme pandas `.std()`). NaN si moins de 2 valeurs. */
function sampleStd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  const ss = xs.reduce((s, v) => s + (v - m) * (v - m), 0);
  return Math.sqrt(ss / (xs.length - 1));
}

export function analyzeMonoMulti(rows: MonoMultiRow[], ciLevel = confidenceLevel()): MonoMultiResult {
  if (rows.length === 0) throw new Error('analyzeMonoMulti: dataset vide');

  const regionLevels = levels(rows.map((r) => r.region));
  const statutLevels = levels(rows.map((r) => r.statut));
  const categLevels = levels(rows.map((r) => r.categ));

  // index des dummies (drop premier niveau = référence)
  const regIdx = new Map(regionLevels.slice(1).map((l, i) => [l, i]));
  const staIdx = new Map(statutLevels.slice(1).map((l, i) => [l, i]));
  const catIdx = new Map(categLevels.slice(1).map((l, i) => [l, i]));
  const nReg = regionLevels.length - 1;
  const nSta = statutLevels.length - 1;
  const nCat = categLevels.length - 1;

  const X: number[][] = new Array(rows.length);
  const y: number[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = new Array<number>(2 + nReg + nSta + nCat).fill(0);
    row[0] = 1; // intercept
    row[1] = r.isMulti ? 1 : 0;
    const rg = regIdx.get(r.region);
    if (rg !== undefined) row[2 + rg] = 1;
    const st = staIdx.get(r.statut);
    if (st !== undefined) row[2 + nReg + st] = 1;
    const ct = catIdx.get(r.categ);
    if (ct !== undefined) row[2 + nReg + nSta + ct] = 1;
    X[i] = row;
    y[i] = r.score;
  }

  const fit = ols(X, y);
  const se = hc0SE(X, fit.residuals, fit.XtXinv);
  const j = 1; // is_multi
  const beta = fit.beta[j];
  const sej = se[j];
  const t = beta / sej;
  const z = invNorm((1 + ciLevel) / 2);

  const monoScores = rows.filter((r) => !r.isMulti).map((r) => r.score);
  const multiScores = rows.filter((r) => r.isMulti).map((r) => r.score);
  const meanMono = monoScores.length ? mean(monoScores) : NaN;
  const meanMulti = multiScores.length ? mean(multiScores) : NaN;
  const sdMono = sampleStd(monoScores);
  const sdMulti = sampleStd(multiScores);

  return {
    n: rows.length,
    nMono: monoScores.length,
    nMulti: multiScores.length,
    meanMono,
    meanMulti,
    sdMono,
    sdMulti,
    gapRaw: meanMulti - meanMono,
    betaAdj: beta,
    se: sej,
    t,
    p: normalTwoSidedP(t),
    ciLow: beta - z * sej,
    ciHigh: beta + z * sej,
    ciLevel,
    k: X[0].length,
  };
}
