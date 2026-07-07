import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDataset } from '../../../store/load';
import { refreshDataset } from '../../../store/refresh';
import { makeStoreProxy } from '../../../store/proxy';
import { listCabinets, cabinetDetail } from '../../../store/cabinet-detail';
import { cabinetRegistry } from '../../../store/registry';
import { generateFiche } from '../../../core/generate';
import { setSignificanceAlpha } from '../../../core/significance';
import { FICHE_CALENDAR } from '../../../core/fiche-calendar';
import type { Dataset } from '../../../store/types';

export interface GenerateArgs {
  numeros: number[];
  outDir: string;
  alpha: 0.05 | 0.01;
}
export interface GenerateResult {
  written: string[];
  warnings: string[];
}

/**
 * Détient le Dataset (~40 Mo) en mémoire côté processus principal et expose des
 * opérations dérivées PETITES via l'IPC — le Dataset ne traverse jamais l'IPC.
 */
export class EngineService {
  private ds: Dataset | null = null;
  private proxy: ReturnType<typeof makeStoreProxy> | null = null;
  private generating = false;

  async load(dir: string): Promise<void> {
    this.ds = await loadDataset(dir);
    this.proxy = makeStoreProxy(this.ds);
  }

  private req(): Dataset {
    if (!this.ds) throw new Error('dataset non chargé');
    return this.ds;
  }

  getMeta() {
    return this.req().meta;
  }
  fiches() {
    return FICHE_CALENDAR;
  }
  listCabinets() {
    return listCabinets(this.req());
  }
  cabinetDetail(cabinet: string) {
    return cabinetDetail(this.req(), cabinet);
  }
  registry() {
    return cabinetRegistry(this.req().evalHistory);
  }

  /** Sérialisé : alpha est un état global module — jamais muter pendant une génération. */
  async generateFiches(args: GenerateArgs): Promise<GenerateResult> {
    if (this.generating) throw new Error('génération déjà en cours');
    this.generating = true;
    try {
      setSignificanceAlpha(args.alpha);
      const ds = this.req();
      const written: string[] = [];
      const warnings: string[] = [];
      for (const numero of args.numeros) {
        const res = await generateFiche(ds, numero, undefined, this.proxy!);
        for (const f of res.files) {
          const p = join(args.outDir, f.filename);
          await writeFile(p, f.content);
          written.push(p);
        }
        warnings.push(...res.warnings);
      }
      return { written, warnings };
    } finally {
      this.generating = false;
    }
  }

  async refresh(currentDir: string, archiveRoot: string) {
    const r = await refreshDataset({ currentDir, archiveRoot });
    this.ds = r.dataset;
    this.proxy = makeStoreProxy(this.ds);
    return {
      meta: this.ds.meta,
      archivedPrevious: r.archivedPrevious,
      finessFreshness: r.finessFreshness,
      capacityFreshness: r.capacityFreshness,
    };
  }
}
