/**
 * Modèle à INTERACTIONS (Observatoire — version rigoureuse de la stratification).
 *
 * Au lieu d'estimer l'effet du contraste par des régressions SÉPARÉES dans chaque
 * strate (variance non partagée, pas de test formel), on ajuste UN SEUL OLS avec
 * des termes d'interaction `cible × strate` :
 *
 *   score ~ cible + strate(dummies) + cible×strate(dummies) + contrôles
 *
 * - le coefficient `cible` = effet du contraste dans la strate de RÉFÉRENCE ;
 * - chaque coef `cible×strate_s` = ÉCART d'effet de la strate s vs la référence
 *   (= test formel d'effet-modification, avec SE robustes HC0) ;
 * - l'effet dans la strate s = cible + cible×strate_s, dont la variance utilise
 *   les termes HORS diagonale de la covariance (d'où `hc0Cov`).
 *
 * Renvoie null sur design dégénéré/singulier (cohérent avec `adjustedContrastGap`).
 */

import { ols, hc0Cov, normalTwoSidedP, type Matrix, type Vector } from './ols';
import { significanceAlpha } from './significance';

export interface InteractionContrastRow {
  score: number;
  isTarget: boolean;
  /** Modalité de la variable modératrice (ex. statut juridique). */
  stratum: string;
  /** Autres contrôles (HORS strate), dummies drop-first par dimension. */
  catControls: string[];
}

export interface StratumEffect {
  stratum: string;
  isReference: boolean;
  /** Effet du contraste dans cette strate. */
  effect: number | null;
  effectSe: number | null;
  /** p de « effet ≠ 0 » dans la strate. */
  effectP: number | null;
  /** Écart d'effet vs la référence (coef d'interaction) ; null pour la référence. */
  diffVsRef: number | null;
  diffSe: number | null;
  /** p de l'INTERACTION (effet de la strate ≠ effet de référence). */
  diffP: number | null;
}

export interface InteractionResult {
  refStratum: string;
  strata: StratumEffect[];
  /** true si au moins une strate diffère significativement (p<α/S, Bonferroni) de la référence. */
  anySignificantInteraction: boolean;
  n: number;
}

function levels(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export function interactionContrastGaps(rows: InteractionContrastRow[]): InteractionResult | null {
  // Dégradation gracieuse : ne garder que les strates où le contraste a SES DEUX
  // bras (cible ET référence). Une strate à un seul bras rend la colonne
  // d'interaction colinéaire → modèle singulier, donc PERTE de toute la ventilation.
  // On exclut ces strates ; les autres restent estimables.
  const arms = new Map<string, { t: boolean; r: boolean }>();
  for (const r of rows) {
    const a = arms.get(r.stratum) ?? { t: false, r: false };
    if (r.isTarget) a.t = true;
    else a.r = true;
    arms.set(r.stratum, a);
  }
  const valid = new Set([...arms].filter(([, a]) => a.t && a.r).map(([s]) => s));
  const data = rows.filter((r) => valid.has(r.stratum));

  const nTarget = data.filter((r) => r.isTarget).length;
  if (nTarget === 0 || nTarget === data.length) return null; // pas de contraste

  const strata = levels(data.map((r) => r.stratum));
  if (strata.length < 2) return null; // pas d'interaction possible (≥2 strates valides)
  const refStratum = strata[0];
  const otherStrata = strata.slice(1);
  const stratumIdx = new Map(otherStrata.map((s, i) => [s, i])); // drop-first
  const S = otherStrata.length;

  const nCatDims = data[0]?.catControls.length ?? 0;
  const ctrlIdx: Map<string, number>[] = [];
  const ctrlCounts: number[] = [];
  for (let d = 0; d < nCatDims; d++) {
    const lv = levels(data.map((r) => r.catControls[d]));
    ctrlIdx.push(new Map(lv.slice(1).map((l, i) => [l, i])));
    ctrlCounts.push(Math.max(0, lv.length - 1));
  }

  // Colonnes : [intercept, cible, strate(S), cible×strate(S), contrôles...]
  const cTarget = 1;
  const cStratum = 2;
  const cInter = 2 + S;
  let acc = 2 + 2 * S;
  const ctrlOffsets: number[] = [];
  for (let d = 0; d < nCatDims; d++) {
    ctrlOffsets.push(acc);
    acc += ctrlCounts[d];
  }
  const k = acc;

  const X: number[][] = [];
  const y: number[] = [];
  for (const r of data) {
    const row = new Array<number>(k).fill(0);
    row[0] = 1;
    const tgt = r.isTarget ? 1 : 0;
    row[cTarget] = tgt;
    const sj = stratumIdx.get(r.stratum);
    if (sj !== undefined) {
      row[cStratum + sj] = 1;
      row[cInter + sj] = tgt;
    }
    for (let d = 0; d < nCatDims; d++) {
      const ci = ctrlIdx[d].get(r.catControls[d]);
      if (ci !== undefined) row[ctrlOffsets[d] + ci] = 1;
    }
    X.push(row);
    y.push(r.score);
  }

  let beta: Vector;
  let V: Matrix;
  try {
    const fit = ols(X, y);
    V = hc0Cov(X, fit.residuals, fit.XtXinv);
    beta = fit.beta;
  } catch {
    return null; // design singulier (colinéarité)
  }

  const ok = (x: number) => Number.isFinite(x);
  const pOf = (est: number, se: number) => (se > 0 && ok(est) && ok(se) ? normalTwoSidedP(est / se) : null);

  const bRef = beta[cTarget];
  const vRef = V[cTarget][cTarget];
  const seRef = Math.sqrt(vRef);

  const out: StratumEffect[] = [
    {
      stratum: refStratum,
      isReference: true,
      effect: ok(bRef) ? bRef : null,
      effectSe: ok(seRef) ? seRef : null,
      effectP: pOf(bRef, seRef),
      diffVsRef: null,
      diffSe: null,
      diffP: null,
    },
  ];

  // Seuil BONFERRONI : on teste S strates contre la référence → on divise le
  // risque α par le nombre de tests, pour contrôler le taux de faux positifs
  // familial (sinon ~1−(1−α)^S de fausses « interactions significatives »).
  const alpha = significanceAlpha() / S;
  let anySig = false;
  for (const s of otherStrata) {
    const ij = cInter + stratumIdx.get(s)!;
    const bInt = beta[ij];
    const seInt = Math.sqrt(V[ij][ij]);
    const eff = bRef + bInt;
    // var(effet_strate) = var(cible) + var(interaction) + 2·cov(cible, interaction)
    const effSe = Math.sqrt(vRef + V[ij][ij] + 2 * V[cTarget][ij]);
    const dP = pOf(bInt, seInt);
    if (dP !== null && dP < alpha) anySig = true;
    out.push({
      stratum: s,
      isReference: false,
      // On n'affiche pas un effet dont la SE est inestimable (design quasi singulier).
      effect: ok(eff) && ok(effSe) ? eff : null,
      effectSe: ok(effSe) ? effSe : null,
      effectP: pOf(eff, effSe),
      diffVsRef: ok(bInt) ? bInt : null,
      diffSe: ok(seInt) ? seInt : null,
      diffP: dP,
    });
  }

  return { refStratum, strata: out, anySignificantInteraction: anySig, n: data.length };
}
