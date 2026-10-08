// Contrat typé exposé au renderer via contextBridge. Imports `type` uniquement →
// entièrement effacés au build (aucun couplage runtime avec le processus principal).
import type { GenerateArgs, GenerateResult, PositioningHistoryState } from '../main/engine';
import type { Settings } from '../main/settings';
import type { AppUpdateState } from '../main/app-update';
import type { MiseAJourDonneesResultat } from '../main/autoupdate';
import type { DatasetMeta } from '../../../store/types';
import type { CabinetDetail } from '../../../store/cabinet-detail';
import type { CabinetLifeline } from '../../../store/registry';
import type { FICHE_CALENDAR } from '../../../core/fiche-calendar';
import type { CotationCabinetRow, CotationCabinetProfile } from '../../../core/cotations';
import type { FicheCabinetData } from '../../../core/cabinet-fiche';
import type { FicheCabinetHistory } from '../../../core/cabinet-fiche-history';
import type { AccreditationsView } from '../../../core/accreditations';

export type FicheEntry = (typeof FICHE_CALENDAR)[number];

export interface RefreshSummary {
  meta: DatasetMeta;
  archivedPrevious: string | null;
  finessFreshness: unknown;
  capacityFreshness: unknown;
}

export interface ObsApi {
  getMeta(): Promise<DatasetMeta>;
  fiches(): Promise<FicheEntry[]>;
  listCabinets(): Promise<string[]>;
  cabinetDetail(cabinet: string): Promise<CabinetDetail | null>;
  registry(): Promise<CabinetLifeline[]>;
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<void>;
  pickOutputDir(): Promise<string | null>;
  generateFiches(a: GenerateArgs): Promise<GenerateResult>;
  /** Exporte la liste complète des structures d'un cabinet en PDF ; renvoie le chemin écrit. */
  exportCabinetRanking(cabinet: string, outDir: string): Promise<string>;
  refresh(): Promise<RefreshSummary>;
  onRefreshProgress(cb: (msg: string) => void): void;
  /** Mise à jour manuelle : collecte du jour (liste HAS + COFRAC) puis données Synaé/FINESS. */
  miseAJourDonnees(): Promise<MiseAJourDonneesResultat>;
  /** Vrai tant qu'une mise à jour manuelle est en cours (lancée depuis n'importe quel écran). */
  miseAJourDonneesEnCours(): Promise<boolean>;
  /** Issue de la mise à jour manuelle en cours, sans en lancer une ; null si aucune n'est en cours. */
  rejoindreMiseAJourDonnees(): Promise<MiseAJourDonneesResultat | null>;
  /** Appelé après chaque rafraîchissement réussi des données (automatique ou manuel). */
  onDonneesRechargees(cb: () => void): void;
  cotationGeneralView(): Promise<CotationCabinetRow[]>;
  cotationCabinetProfile(cabinet: string): Promise<CotationCabinetProfile | null>;
  exportCotationsGeneral(outDir: string, format: 'csv' | 'pdf'): Promise<string>;
  exportCotationCabinet(cabinet: string, outDir: string, format: 'csv' | 'pdf'): Promise<string>;
  ficheCabinet(cabinet: string): Promise<FicheCabinetData | null>;
  ficheCabinetHistory(cabinet: string): Promise<FicheCabinetHistory | null>;
  /** Historique du positionnement (calcul en arrière-plan : interroger jusqu'à 'pret' ou 'echec'). */
  positioningHistory(cabinet: string): Promise<PositioningHistoryState>;
  /** Fiche courante si asOfMonth omis ; fiche du mois 'YYYY-MM' sinon. Renvoie le chemin écrit. */
  exportFicheCabinet(cabinet: string, outDir: string, asOfMonth?: string): Promise<string>;
  accreditations(): Promise<AccreditationsView>;
  exportAccreditations(
    volet: 'statuts' | 'chronologie' | 'sorties' | 'synthese',
    outDir: string,
    format: 'csv' | 'pdf',
  ): Promise<string>;
  appUpdateState(): Promise<AppUpdateState>;
}

declare global {
  interface Window {
    api: ObsApi;
  }
}
