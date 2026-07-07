/**
 * Analyse PAR CABINET d’un axe binaire.
 *
 * Pour un axe donné (ex. mono/multi), révèle la pratique de CHAQUE cabinet
 * évaluateur (`oe_nom`, champ public de l'open data HAS) : son écart sur l'axe,
 * sa fiabilité, sa significativité, et sa position vs la norme nationale.
 *
 * Reproduit la méthodologie V1.3 (classement de référence) :
 *   - M1  écart brut sous-groupe : gap = moy_exposé − moy_non-exposé
 *   - M2  palier de fiabilité    : 🟢≥30/30, 🟡≥10/10, sinon 🔴
 *   - M3  significativité        : Cohen's d (pooled), IC au niveau de confiance
 *                                  courant (Welch ±z·se — cf. significance.ts),
 *                                  p (test de Welch, df Welch-Satterthwaite)
 * Le registre est EXTENSIBLE : `extraMethods` exécute des méthodes supplémentaires
 * (ex. M4 multiniveau) dont les indicateurs sont empilés sans toucher au cœur.
 *
 * Convention : `exposed = true` = groupe "exposé" (multi) ; le gap est compté
 * exposé − non-exposé (multi − mono), comme la note de référence.
 */

import { studentTTwoSidedP, invNorm } from './ols';
import { confidenceLevel } from './significance';

export type Reliability = 'fiable' | 'tendance' | 'descriptif';

export interface CabinetAxisRow {
  cabinet: string;
  score: number;
  exposed: boolean;
}

export interface CabinetIndicator {
  methodId: string;
  label: string;
  value: number | string | null;
  guideRef: string;
}

export interface CabinetMethodContext {
  cabinet: string;
  exposedScores: number[];
  unexposedScores: number[];
  gap: number | null;
  nationalGap: number | null;
}

export type CabinetMethod = (ctx: CabinetMethodContext) => CabinetIndicator;

export interface CabinetAxisResult {
  cabinet: string;
  nTotal: number;
  nUnexposed: number;
  nExposed: number;
  meanUnexposed: number | null;
  meanExposed: number | null;
  gap: number | null; // M1
  reliability: Reliability; // M2
  cohensD: number | null; // M3
  ciLow: number | null; // M3
  ciHigh: number | null; // M3
  p: number | null; // M3
  deltaVsNational: number | null;
  rank: number;
  /** Indicateurs des méthodes additionnelles (extensibilité du registre). */
  indicators: CabinetIndicator[];
}

export interface AnalyzeByCabinetOpts {
  /** Écart national de référence pour Δ vs national. */
  nationalGap?: number | null;
  /** Méthodes additionnelles (M4+, futures) — registre extensible. */
  extraMethods?: CabinetMethod[];
}

function mean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

/** Écart-type d'échantillon (ddof=1), comme pandas .std(). */
function sampleStd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  const ss = xs.reduce((s, v) => s + (v - m) * (v - m), 0);
  return Math.sqrt(ss / (xs.length - 1));
}

/** M2 — palier de fiabilité selon les effectifs (seuils V1.3). */
export function reliabilityTier(nUnexposed: number, nExposed: number): Reliability {
  if (nUnexposed >= 30 && nExposed >= 30) return 'fiable';
  if (nUnexposed >= 10 && nExposed >= 10) return 'tendance';
  return 'descriptif';
}

interface Significance {
  cohensD: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  p: number | null;
}

/** M3 — Cohen's d (pooled), IC au niveau de confiance courant (Welch ±z·se), p (test de Welch). */
function significance(unexposed: number[], exposed: number[], gap: number | null): Significance {
  const nU = unexposed.length;
  const nE = exposed.length;
  if (nU < 2 || nE < 2 || gap === null) {
    return { cohensD: null, ciLow: null, ciHigh: null, p: null };
  }
  const sU = sampleStd(unexposed);
  const sE = sampleStd(exposed);
  const pooled = Math.sqrt(((nU - 1) * sU * sU + (nE - 1) * sE * sE) / (nU + nE - 2));
  const cohensD = pooled > 0 ? gap / pooled : null;

  const se = Math.sqrt((sU * sU) / nU + (sE * sE) / nE);
  if (!(se > 0)) return { cohensD, ciLow: null, ciHigh: null, p: null };
  const z = invNorm((1 + confidenceLevel()) / 2); // 0,05→95 %≈1,96 ; 0,01→99 %≈2,576
  const ciLow = gap - z * se;
  const ciHigh = gap + z * se;

  // Test de Welch : t = gap/se, df Welch-Satterthwaite.
  const t = gap / se;
  const vU = (sU * sU) / nU;
  const vE = (sE * sE) / nE;
  const df = (vU + vE) ** 2 / (vU ** 2 / (nU - 1) + vE ** 2 / (nE - 1));
  const p = studentTTwoSidedP(t, df);

  return { cohensD, ciLow, ciHigh, p };
}

export function analyzeAxisByCabinet(
  rows: CabinetAxisRow[],
  opts: AnalyzeByCabinetOpts = {},
): CabinetAxisResult[] {
  const nationalGap = opts.nationalGap ?? null;
  const extraMethods = opts.extraMethods ?? [];

  const byCabinet = new Map<string, { exposed: number[]; unexposed: number[] }>();
  for (const r of rows) {
    let g = byCabinet.get(r.cabinet);
    if (!g) {
      g = { exposed: [], unexposed: [] };
      byCabinet.set(r.cabinet, g);
    }
    (r.exposed ? g.exposed : g.unexposed).push(r.score);
  }

  const results: CabinetAxisResult[] = [];
  for (const [cabinet, g] of byCabinet) {
    const nExposed = g.exposed.length;
    const nUnexposed = g.unexposed.length;
    const meanExposed = nExposed > 0 ? mean(g.exposed) : null;
    const meanUnexposed = nUnexposed > 0 ? mean(g.unexposed) : null;
    const gap = meanExposed !== null && meanUnexposed !== null ? meanExposed - meanUnexposed : null;
    const sig = significance(g.unexposed, g.exposed, gap);

    const ctx: CabinetMethodContext = {
      cabinet,
      exposedScores: g.exposed,
      unexposedScores: g.unexposed,
      gap,
      nationalGap,
    };
    const indicators = extraMethods.map((m) => m(ctx));

    results.push({
      cabinet,
      nTotal: nExposed + nUnexposed,
      nUnexposed,
      nExposed,
      meanUnexposed,
      meanExposed,
      gap,
      reliability: reliabilityTier(nUnexposed, nExposed),
      cohensD: sig.cohensD,
      ciLow: sig.ciLow,
      ciHigh: sig.ciHigh,
      p: sig.p,
      deltaVsNational: gap !== null && nationalGap !== null ? gap - nationalGap : null,
      rank: 0,
      indicators,
    });
  }

  // Classement par écart décroissant (NA en dernier), comme V1.3.
  results.sort((a, b) => {
    if (a.gap === null && b.gap === null) return 0;
    if (a.gap === null) return 1;
    if (b.gap === null) return -1;
    return b.gap - a.gap;
  });
  results.forEach((r, i) => {
    r.rank = i + 1;
  });
  return results;
}
