/**
 * Vue « cabinet choisi » : comparaison nationale + la liste COMPLÈTE des
 * structures évaluées par ce cabinet (nom officiel + adresse, données publiques
 * HAS/FINESS), triée alphabétiquement par nom. Le score par établissement n'est
 * PAS exposé (fragile et non vérifiable depuis l'open data). Présentation
 * STRICTEMENT factuelle — aucun qualificatif dans la structure produite (charte
 * anti-dénigrement) : le consommateur (écran/PDF) porte la formulation, pas ce
 * module.
 */

import type { Dataset, BaseDocRow } from './types';

export interface EvaluatedEstablishment {
  finessGeo: string;
  name: string;
  address: string;
  evalDate: string | null;
}

export interface CabinetDetail {
  cabinet: string;
  nEvaluations: number;
  meanCabinet: number;
  meanNational: number;
  gapVsNational: number;
  /** Toutes les structures évaluées par ce cabinet, triées alphabétiquement par nom. */
  establishments: EvaluatedEstablishment[];
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
  const establishments = mine
    .map((e) => {
      const doc = docByGeo.get(e.finessGeo);
      return {
        finessGeo: e.finessGeo,
        name: doc?.officialLabel || e.raisonSociale || `FINESS ${e.finessGeo}`,
        address: fmtAddress(doc),
        evalDate: e.evalDate,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return {
    cabinet,
    nEvaluations: mine.length,
    meanCabinet,
    meanNational,
    gapVsNational: meanCabinet - meanNational,
    establishments,
  };
}
