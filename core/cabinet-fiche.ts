/**
 * Fiche cabinet — portrait de synthèse MONO-CABINET à une borne de date (« as-of »).
 *
 * N'invente AUCUN calcul : oriente les moteurs existants (buildCabinetProfiles,
 * cotationCabinetProfile, cabinetDetail) vers un cabinet + une borne de mois.
 * Purement calculatoire (charte anti-dénigrement) : l'écran et le PDF portent
 * la formulation.
 *
 * As-of : borne = FIN de mois, par comparaison de clés 'YYYY-MM' (lexicographique,
 * sans arithmétique de fuseau). asOfMonth = null → données courantes, évaluations
 * non datées INCLUSES (parité avec les onglets existants) ; à une borne, les
 * non datées sont exclues (impossible de les situer dans le temps).
 *
 * Limite documentée : le jeu essms ne conserve que la DERNIÈRE évaluation par
 * structure — la reconstitution d'un mois passé est approchée pour les rares
 * structures réévaluées.
 */

import type { Dataset } from '../store/types';
import { extractRows } from '../store/extract';
import { cabinetDetail } from '../store/cabinet-detail';
import {
  buildCabinetProfiles,
  type CabinetProfile,
  type AxisHeadline,
  type CabinetPortfolio,
} from './cabinet-profile';
import { cotationCabinetProfile, type CotationCabinetRow } from './cotations';
import { reliabilityTier, type Reliability } from './cabinet-axis';

/**
 * Contrat : la fiche juxtapose DEUX univers de comptage, volontairement distincts.
 *
 * - `n` / `niveauGlobal` / `axes` / `nSignificantAxes` / `portfolio` : univers du
 *   moteur 7 axes — extraction avec INNER JOIN EJ as-of (une structure sans
 *   snapshot EJ en sort).
 * - `periodStart`/`periodEnd` / `cotations` / `nStructures` : univers essms
 *   scorées (sans jointure EJ), légèrement plus large.
 *
 * `nStructures` répète volontairement `cotations.nStructures` : il survit si
 * `cotations` est null (branche défensive).
 */
export interface FicheCabinetData {
  cabinet: string;
  /** 'YYYY-MM' (fin de mois) — null = données courantes. */
  asOfMonth: string | null;
  /** Évaluations analysées (univers du moteur 7 axes : INNER JOIN EJ as-of). */
  n: number;
  reliability: Reliability;
  /** Bornes des évaluations DATÉES du cabinet (ISO AAAA-MM-JJ), null si aucune. */
  periodStart: string | null;
  periodEnd: string | null;
  /** Écart brut de notation au national (points), non ajusté. */
  niveauGlobal: number | null;
  axes: AxisHeadline[];
  nSignificantAxes: number;
  portfolio: CabinetPortfolio;
  /** Résumé cotations (univers structures scorées) — renvoi onglet Cotations. */
  cotations: CotationCabinetRow | null;
  /** Structures listées dans « Cabinet choisi » (univers essms scorées). */
  nStructures: number;
}

/**
 * Dataset restreint aux évaluations closes <= fin du mois `asOfMonth` ('YYYY-MM').
 * `asOfMonth` DOIT être zéro-paddé ('YYYY-MM') : la borne est une comparaison
 * lexicographique — un '2023-2' non paddé fausserait le filtre en silence
 * (la validation de format est faite par la couche applicative).
 * Les snapshots EJ/capacité ne sont PAS filtrés : la sélection as-of du LATERAL
 * étant par date de clôture, un snapshot postérieur à la borne n'est jamais choisi
 * (clôture <= borne ⇒ snapshot retenu <= borne), hors repli documenté.
 */
export function asOfDataset(ds: Dataset, asOfMonth: string | null): Dataset {
  if (!asOfMonth) return ds;
  return {
    ...ds,
    essms: ds.essms.filter((e) => e.evalDate !== null && e.evalDate.slice(0, 7) <= asOfMonth),
  };
}

/**
 * Construit la fiche d'un cabinet. `asOfMonth` DOIT être au format 'YYYY-MM'
 * zéro-paddé (cf. asOfDataset — comparaison lexicographique). `profiles`
 * (optionnel) court-circuite le recalcul de buildCabinetProfiles — UNIQUEMENT
 * valable pour asOfMonth = null (le cache appelant est invalidé au changement
 * de dataset ou d'alpha).
 */
export function buildFicheCabinet(
  ds: Dataset,
  cabinet: string,
  asOfMonth: string | null = null,
  profiles?: CabinetProfile[],
): FicheCabinetData | null {
  const dsAsOf = asOfDataset(ds, asOfMonth);
  const all = asOfMonth === null && profiles ? profiles : buildCabinetProfiles(extractRows(dsAsOf));
  const profile = all.find((p) => p.cabinet === cabinet);
  if (!profile) return null;

  const detail = cabinetDetail(dsAsOf, cabinet);
  const cot = cotationCabinetProfile(dsAsOf, cabinet);
  const dates = dsAsOf.essms
    .filter((e) => e.cabinet === cabinet && e.score !== null && e.evalDate !== null)
    .map((e) => e.evalDate!.slice(0, 10))
    .sort();

  return {
    cabinet,
    asOfMonth,
    n: profile.n,
    reliability: reliabilityTier(profile.n, profile.n),
    periodStart: dates[0] ?? null,
    periodEnd: dates.length ? dates[dates.length - 1] : null,
    niveauGlobal: profile.niveauGlobal,
    axes: profile.axes,
    nSignificantAxes: profile.nSignificantAxes,
    portfolio: profile.portfolio,
    cotations: cot
      ? {
          cabinet: cot.cabinet,
          nStructures: cot.nStructures,
          reliability: cot.reliability,
          gradeShare: cot.gradeShare,
          chapterMeans: cot.chapterMeans,
          imperativeSummary: cot.imperativeSummary,
        }
      : null,
    nStructures: detail?.nEvaluations ?? 0,
  };
}
