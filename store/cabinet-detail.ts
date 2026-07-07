/**
 * Vue « cabinet choisi » : comparaison nationale + les 5
 * établissements notés le plus bas par ce cabinet (nom officiel + adresse,
 * données publiques HAS/FINESS). Présentation STRICTEMENT factuelle — aucun
 * qualificatif dans la structure produite (charte anti-dénigrement) : le
 * consommateur (fiche/PDF) porte la formulation, pas ce module.
 */

import type { Dataset, BaseDocRow } from './types';

export interface LowScoredEstablishment {
  finessGeo: string;
  name: string;
  address: string;
  score: number;
  evalDate: string | null;
}

export interface CabinetDetail {
  cabinet: string;
  nEvaluations: number;
  meanCabinet: number;
  meanNational: number;
  gapVsNational: number;
  lowestScored: LowScoredEstablishment[]; // « les 5 scores les plus bas attribués par ce cabinet »
}

/** Égalité de contenu : trim, espaces multiples réduits, casse ignorée. */
const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Motif RÉEL base-doc : addressLine2 répète parfois « CP commune » (ex.
 * "95000 CERGY" alors que postalCode/commune sont déjà renseignés), ou répète
 * addressLine1. Déduplication par égalité normalisée UNIQUEMENT — pas de
 * parsing plus malin (YAGNI).
 */
const fmtAddress = (b: BaseDocRow | undefined): string => {
  if (!b) return '';
  const cpCommune = [b.postalCode, b.commune].filter(Boolean).join(' ');
  const parts: string[] = [];
  for (const line of [b.addressLine1, b.addressLine2]) {
    if (!line || !line.trim()) continue;
    if (cpCommune && normalize(line) === normalize(cpCommune)) continue; // line ≡ « CP commune »
    if (parts.some((p) => normalize(p) === normalize(line))) continue; // line2 ≡ line1
    parts.push(line);
  }
  if (cpCommune.trim()) parts.push(cpCommune);
  return parts.join(', ');
};

/** Ne liste que les cabinets avec ≥1 évaluation scorée ; cabinetDetail peut rester null pour un nom hors liste. */
export function listCabinets(ds: Dataset): string[] {
  return [
    ...new Set(
      ds.essms
        .filter((e) => e.score !== null)
        .map((e) => e.cabinet)
        .filter((c): c is string => !!c)
    ),
  ].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function cabinetDetail(ds: Dataset, cabinet: string): CabinetDetail | null {
  const scored = ds.essms.filter((e) => e.score !== null);
  const mine = scored.filter((e) => e.cabinet === cabinet);
  if (mine.length === 0) return null;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const meanCabinet = mean(mine.map((e) => e.score!));
  const meanNational = mean(scored.map((e) => e.score!));
  const docByGeo = new Map(ds.baseDoc.map((b) => [b.finessGeo, b]));
  const lowestScored = [...mine]
    .sort((a, b) => a.score! - b.score! || (a.evalDate ?? '').localeCompare(b.evalDate ?? ''))
    .slice(0, 5)
    .map((e) => {
      const doc = docByGeo.get(e.finessGeo);
      return {
        finessGeo: e.finessGeo,
        name: doc?.officialLabel || e.raisonSociale || `FINESS ${e.finessGeo}`,
        address: fmtAddress(doc),
        score: e.score!,
        evalDate: e.evalDate,
      };
    });
  return {
    cabinet,
    nEvaluations: mine.length,
    meanCabinet,
    meanNational,
    gapVsNational: meanCabinet - meanNational,
    lowestScored,
  };
}
