// Contrat typé exposé au renderer via contextBridge. Imports `type` uniquement →
// entièrement effacés au build (aucun couplage runtime avec le processus principal).
import type { GenerateArgs, GenerateResult } from '../main/engine';
import type { Settings } from '../main/settings';
import type { DatasetMeta } from '../../../store/types';
import type { CabinetDetail } from '../../../store/cabinet-detail';
import type { CabinetLifeline } from '../../../store/registry';
import type { FICHE_CALENDAR } from '../../../core/fiche-calendar';
import type { CotationCabinetRow, CotationCabinetProfile } from '../../../core/cotations';

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
  cotationGeneralView(): Promise<CotationCabinetRow[]>;
  cotationCabinetProfile(cabinet: string): Promise<CotationCabinetProfile | null>;
  exportCotationsGeneral(outDir: string, format: 'csv' | 'pdf'): Promise<string>;
  exportCotationCabinet(cabinet: string, outDir: string, format: 'csv' | 'pdf'): Promise<string>;
}

declare global {
  interface Window {
    api: ObsApi;
  }
}
