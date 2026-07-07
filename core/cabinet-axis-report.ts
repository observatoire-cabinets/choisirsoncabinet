/**
 * Restitution de l'analyse par cabinet.
 *
 * - `summarizeCabinetAxis` : agrégats pour la SYNTHÈSE de la fiche (paliers,
 *   directions, distribution des écarts).
 * - `cabinetAxisToCsv` : le classement COMPLET nominatif (pièce jointe CSV,
 *   exploitable, séparée du PDF narratif).
 */

import type { CabinetAxisResult, Reliability } from './cabinet-axis';

/**
 * Restitution d'un contraste : libellé + synthèse + classement nominatif complet
 * (résultats structurés). Le rendu final est un PDF lisible (`fiche-ranking-pdf`,
 * le CSV était illisible). `cabinetAxisToCsv` reste
 * disponible comme utilitaire d'export tableur.
 */
export interface ContrastReport {
  id: string;
  label: string;
  summary: CabinetAxisSummary;
  results: CabinetAxisResult[];
}

export interface CabinetAxisSummary {
  totalCabinets: number;
  nFiable: number;
  nTendance: number;
  nDescriptif: number;
  proMulti: number; // écart > 0
  proMono: number; // écart < 0
  neutre: number; // écart == 0
  medianGap: number | null;
  q1Gap: number | null;
  q3Gap: number | null;
  minGap: number | null;
  maxGap: number | null;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarizeCabinetAxis(results: CabinetAxisResult[]): CabinetAxisSummary {
  const tier = (t: Reliability) => results.filter((r) => r.reliability === t).length;
  const gaps = results
    .map((r) => r.gap)
    .filter((g): g is number => g !== null)
    .sort((a, b) => a - b);

  return {
    totalCabinets: results.length,
    nFiable: tier('fiable'),
    nTendance: tier('tendance'),
    nDescriptif: tier('descriptif'),
    proMulti: gaps.filter((g) => g > 0).length,
    proMono: gaps.filter((g) => g < 0).length,
    neutre: gaps.filter((g) => g === 0).length,
    medianGap: gaps.length ? quantile(gaps, 0.5) : null,
    q1Gap: gaps.length ? quantile(gaps, 0.25) : null,
    q3Gap: gaps.length ? quantile(gaps, 0.75) : null,
    minGap: gaps.length ? gaps[0] : null,
    maxGap: gaps.length ? gaps[gaps.length - 1] : null,
  };
}

const TIER_LABEL: Record<Reliability, string> = {
  fiable: 'Fiable',
  tendance: 'Tendance',
  descriptif: 'Descriptif',
};

function num(v: number | null, decimals: number): string {
  return v === null || Number.isNaN(v) ? '' : v.toFixed(decimals);
}

function csvField(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER =
  'Rang,Cabinet,N_total,N_mono,N_multi,Moy_mono,Moy_multi,Écart,Cohen_d,p_value,IC_95_lower,IC_95_upper,Delta_national,Fiabilité';

/** Classement complet nominatif au format CSV (point décimal, séparateur virgule). */
export function cabinetAxisToCsv(results: CabinetAxisResult[]): string {
  const lines = [CSV_HEADER];
  for (const r of results) {
    lines.push(
      [
        r.rank,
        csvField(r.cabinet),
        r.nTotal,
        r.nUnexposed,
        r.nExposed,
        num(r.meanUnexposed, 2),
        num(r.meanExposed, 2),
        num(r.gap, 2),
        num(r.cohensD, 3),
        num(r.p, 4),
        num(r.ciLow, 2),
        num(r.ciHigh, 2),
        num(r.deltaVsNational, 2),
        TIER_LABEL[r.reliability],
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}
