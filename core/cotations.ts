/**
 * Moteur d'agrégation des COTATIONS par cabinet (données publiques HAS).
 * Purement calculatoire : ne produit que des chiffres (aucun qualificatif —
 * charte anti-dénigrement) ; l'écran et le PDF portent la formulation.
 */
import type { Dataset, EssmsRow } from '../store/types';
import { reliabilityTier, type Reliability } from './cabinet-axis';
import { listCabinets } from '../store/cabinet-detail';

export interface CotationCabinetRow {
  cabinet: string;
  nStructures: number;
  reliability: Reliability;
  gradeShare: { A: number; B: number; C: number; D: number };
  chapterMeans: (number | null)[];
  imperativeSummary: { meanEvaluated: number | null; metRate: number | null; above35Rate: number | null };
}

/** Effectif unique → mêmes seuils que M2 (≥30 fiable, ≥10 tendance, sinon descriptif). */
export function cotationReliability(n: number): Reliability {
  return reliabilityTier(n, n);
}

export function reliabilityLabel(r: Reliability): string {
  return r === 'fiable' ? 'suffisante' : r === 'tendance' ? 'à confirmer' : 'limitée';
}

const meanOf = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Structures scorées, groupées par cabinet (même univers que listCabinets). */
function scoredByCabinet(ds: Dataset): Map<string, EssmsRow[]> {
  const by = new Map<string, EssmsRow[]>();
  for (const e of ds.essms) {
    if (e.score === null || !e.cabinet) continue;
    const arr = by.get(e.cabinet) ?? [];
    arr.push(e);
    by.set(e.cabinet, arr);
  }
  return by;
}

function aggregateRow(cabinet: string, rows: EssmsRow[]): CotationCabinetRow {
  const graded = rows.filter((r) => r.grade !== null);
  const gCount = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of graded) gCount[r.grade as 'A' | 'B' | 'C' | 'D']++;
  const gd = graded.length || 1;
  const gradeShare = graded.length
    ? { A: gCount.A / gd, B: gCount.B / gd, C: gCount.C / gd, D: gCount.D / gd }
    : { A: 0, B: 0, C: 0, D: 0 };

  const chapterMeans = [0, 1, 2].map((i) =>
    meanOf(rows.map((r) => r.chapters[i]).filter((v): v is number => v !== null)),
  );

  const evals = rows.map((r) => r.ciEvaluated).filter((v): v is number => v !== null);
  let sumEval = 0, sumMet = 0, sumAbove = 0;
  for (const r of rows) {
    if (r.ciEvaluated === null) continue;
    sumEval += r.ciEvaluated;
    if (r.ciMet !== null) sumMet += r.ciMet;
    if (r.ciAbove35 !== null) sumAbove += r.ciAbove35;
  }
  const imperativeSummary = {
    meanEvaluated: meanOf(evals),
    metRate: sumEval > 0 ? sumMet / sumEval : null,
    above35Rate: sumEval > 0 ? sumAbove / sumEval : null,
  };

  return {
    cabinet, nStructures: rows.length, reliability: cotationReliability(rows.length),
    gradeShare, chapterMeans, imperativeSummary,
  };
}

export function cotationGeneralView(ds: Dataset): CotationCabinetRow[] {
  const by = scoredByCabinet(ds);
  return listCabinets(ds).map((cabinet) => aggregateRow(cabinet, by.get(cabinet) ?? []));
}

export interface ImperativeDetail { code: string; mean: number; nStructures: number; }
export interface CotationEstablishment {
  finessGeo: string; name: string; commune: string;
  grade: 'A' | 'B' | 'C' | 'D' | null; chapters: (number | null)[];
}
export interface CotationCabinetProfile extends CotationCabinetRow {
  imperatives: ImperativeDetail[];
  establishments: CotationEstablishment[];
}

function imperativeDetails(rows: EssmsRow[]): ImperativeDetail[] {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    for (const { code, value } of r.imperatives) {
      const a = acc.get(code) ?? { sum: 0, n: 0 };
      a.sum += value; a.n += 1; acc.set(code, a);
    }
  }
  return [...acc.entries()]
    .map(([code, a]) => ({ code, mean: a.sum / a.n, nStructures: a.n }))
    .sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
}

export function cotationCabinetProfile(ds: Dataset, cabinet: string): CotationCabinetProfile | null {
  const rows = scoredByCabinet(ds).get(cabinet);
  if (!rows || rows.length === 0) return null;
  const docByGeo = new Map(ds.baseDoc.map((b) => [b.finessGeo, b]));
  const establishments: CotationEstablishment[] = [...rows]
    .sort((a, b) => (a.score! - b.score!) || (a.evalDate ?? '').localeCompare(b.evalDate ?? ''))
    .map((e) => {
      const doc = docByGeo.get(e.finessGeo);
      return {
        finessGeo: e.finessGeo,
        name: doc?.officialLabel || e.raisonSociale || `FINESS ${e.finessGeo}`,
        commune: doc?.commune ?? '',
        grade: e.grade, chapters: e.chapters,
      };
    });
  return { ...aggregateRow(cabinet, rows), imperatives: imperativeDetails(rows), establishments };
}

export interface CotationCoverage {
  nScored: number;
  gradedRate: number;      // fraction des structures scorées ayant un grade
  chapterRate: number;     // fraction ayant ≥1 cotation de chapitre
  imperativeRate: number;  // fraction ayant ≥1 critère impératif
}
export function cotationCoverage(ds: Dataset): CotationCoverage {
  const scored = ds.essms.filter((e) => e.score !== null && !!e.cabinet);
  const n = scored.length || 1;
  const graded = scored.filter((e) => e.grade !== null).length;
  const chap = scored.filter((e) => e.chapters.some((c) => c !== null)).length;
  const imp = scored.filter((e) => e.imperatives.length > 0).length;
  return { nScored: scored.length, gradedRate: graded / n, chapterRate: chap / n, imperativeRate: imp / n };
}
