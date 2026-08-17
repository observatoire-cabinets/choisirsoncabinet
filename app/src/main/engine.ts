import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDataset } from '../../../store/load';
import { refreshDataset } from '../../../store/refresh';
import { makeStoreProxy } from '../../../store/proxy';
import { listCabinets, cabinetDetail } from '../../../store/cabinet-detail';
import { renderCabinetRankingPdf } from '../../../core/cabinet-ranking-pdf';
import { cotationGeneralView, cotationCabinetProfile } from '../../../core/cotations';
import { buildGeneralCsv, buildCabinetCsv } from '../../../core/cotations-csv';
import { renderCotationsGeneralPdf, renderCotationCabinetPdf } from '../../../core/cotations-pdf';
import { cabinetRegistry } from '../../../store/registry';
import { generateFiche } from '../../../core/generate';
import { setSignificanceAlpha, alphaLabelFor } from '../../../core/significance';
import { FICHE_CALENDAR } from '../../../core/fiche-calendar';
import { buildFicheCabinet, type FicheCabinetData } from '../../../core/cabinet-fiche';
import { cabinetFicheHistory, type FicheCabinetHistory } from '../../../core/cabinet-fiche-history';
import { renderFicheCabinetPdf } from '../../../core/cabinet-fiche-pdf';
import { buildCabinetProfiles, type CabinetProfile } from '../../../core/cabinet-profile';
import { extractRows } from '../../../store/extract';
import type { Dataset } from '../../../store/types';
import { buildAccreditationsView, type AccreditationsView } from '../../../core/accreditations';
import { buildStatutsCsv, buildChronologieCsv, buildSortiesCsv } from '../../../core/accreditations-csv';
import { renderAccreditationsPdf } from '../../../core/accreditations-pdf';
import { loadListeHasSeed } from '../../../store/liste-has-load';
import { ensureArchive, seedEtats, readAllEtats, readCofracReleves } from '../../../store/liste-has-archive';
import { readSettings } from './settings';
import type { ListeHasSeed } from '../../../store/liste-has-types';

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
  /** Profils 7 axes de TOUS les cabinets, par alpha — invalidé au load/refresh. */
  private profileCache: { alpha: 0.05 | 0.01; profiles: CabinetProfile[] } | null = null;
  private listeHasSeed: ListeHasSeed | null = null;
  private listeHasArchiveRoot: string | null = null;
  private listeHasUserDataDir: string | null = null;

  async load(dir: string): Promise<void> {
    this.ds = await loadDataset(dir);
    this.proxy = makeStoreProxy(this.ds);
    this.profileCache = null;
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

  cotationGeneralView() {
    return cotationGeneralView(this.req());
  }
  cotationCabinetProfile(cabinet: string) {
    return cotationCabinetProfile(this.req(), cabinet);
  }

  /**
   * Profils courants par alpha (calcul ~secondes sur le jeu réel → cache).
   * alpha est un état global module : refusé pendant une génération de fiches.
   */
  private profilesFor(alpha: 0.05 | 0.01): CabinetProfile[] {
    if (this.generating) throw new Error('génération de fiches en cours — réessayer ensuite');
    // Inconditionnel (même en cache-hit) : le global reste toujours cohérent
    // avec le dernier calcul demandé — aucun lecteur ne voit un seuil divergent.
    setSignificanceAlpha(alpha);
    if (this.profileCache?.alpha !== alpha) {
      this.profileCache = { alpha, profiles: buildCabinetProfiles(extractRows(this.req())) };
    }
    return this.profileCache.profiles;
  }

  ficheCabinet(cabinet: string, alpha: 0.05 | 0.01): FicheCabinetData | null {
    return buildFicheCabinet(this.req(), cabinet, null, this.profilesFor(alpha));
  }

  ficheCabinetHistory(cabinet: string): FicheCabinetHistory | null {
    return cabinetFicheHistory(this.req(), cabinet);
  }

  /** Fiche courante (avec historique) ou fiche d'un mois donné (asOfMonth 'YYYY-MM'). */
  async exportFicheCabinet(
    cabinet: string,
    outDir: string,
    alpha: 0.05 | 0.01,
    asOfMonth: string | null,
  ): Promise<string> {
    if (asOfMonth !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(asOfMonth)) {
      throw new Error(`Mois invalide : ${asOfMonth}`);
    }
    const ds = this.req();
    let fiche: FicheCabinetData | null;
    let history: FicheCabinetHistory | null = null;
    if (asOfMonth) {
      if (this.generating) throw new Error('génération de fiches en cours — réessayer ensuite');
      // Synchrone jusqu'au build : pas de course avec generateFiches sur le CALCUL.
      // Le seuil IMPRIMÉ, lui, ne dépend plus du global : alphaLabelFor(alpha) est
      // passé au rendu, insensible aux mutations concurrentes pendant ses await.
      setSignificanceAlpha(alpha);
      fiche = buildFicheCabinet(ds, cabinet, asOfMonth);
    } else {
      fiche = buildFicheCabinet(ds, cabinet, null, this.profilesFor(alpha));
      history = cabinetFicheHistory(ds, cabinet);
    }
    if (!fiche) throw new Error(`Aucune donnée pour le cabinet « ${cabinet} »${asOfMonth ? ` à fin ${asOfMonth}` : ''}.`);
    const p = join(outDir, `fiche-cabinet-${this.slug(cabinet)}${asOfMonth ? `-${asOfMonth}` : ''}.pdf`);
    await writeFile(p, await renderFicheCabinetPdf(fiche, history, this.periodLabel(), alphaLabelFor(alpha)));
    return p;
  }

  private periodLabel(): string {
    const d = this.req().meta.hasSyncedAt?.slice(0, 10) ?? '';
    return d ? `Données HAS au ${d}` : 'Données publiques HAS';
  }
  private slug(s: string): string {
    return (
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'cabinet'
    );
  }

  async exportCotationsGeneral(outDir: string, format: 'csv' | 'pdf'): Promise<string> {
    const rows = cotationGeneralView(this.req());
    const p = join(outDir, `cotations-generales.${format}`);
    if (format === 'csv') await writeFile(p, buildGeneralCsv(rows), 'utf8');
    else await writeFile(p, await renderCotationsGeneralPdf(rows, this.periodLabel()));
    return p;
  }
  async exportCotationCabinet(cabinet: string, outDir: string, format: 'csv' | 'pdf'): Promise<string> {
    const profile = cotationCabinetProfile(this.req(), cabinet);
    if (!profile) throw new Error(`Cabinet introuvable : ${cabinet}`);
    const p = join(outDir, `cotations-cabinet-${this.slug(cabinet)}.${format}`);
    if (format === 'csv') await writeFile(p, buildCabinetCsv(profile), 'utf8');
    else await writeFile(p, await renderCotationCabinetPdf(profile, this.periodLabel()));
    return p;
  }

  /** Exporte la liste complète des structures d'un cabinet en PDF (hors ligne). Renvoie le chemin écrit. */
  async exportCabinetRanking(cabinet: string, outDir: string): Promise<string> {
    const ds = this.req();
    const detail = cabinetDetail(ds, cabinet);
    if (!detail) throw new Error(`Aucune donnée pour le cabinet « ${cabinet} ».`);
    const fmt = (iso: string | null | undefined): string => {
      const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
      return m ? `${m[3]}/${m[2]}/${m[1]}` : '(date inconnue)';
    };
    const period = `HAS du ${fmt(ds.meta.hasSyncedAt)} · FINESS du ${fmt(ds.meta.finessSnapshotMax)}`;
    const buf = await renderCabinetRankingPdf(detail, period);
    // Slug de fichier : tout caractère non alphanumérique ASCII (accents inclus)
    // devient un séparateur — suffisant et robuste pour un nom de fichier.
    const slug =
      cabinet
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 60) || 'cabinet';
    const p = join(outDir, `structures-cabinet-${slug}.pdf`);
    await writeFile(p, buf);
    return p;
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
    this.profileCache = null;
    return {
      meta: this.ds.meta,
      archivedPrevious: r.archivedPrevious,
      finessFreshness: r.finessFreshness,
      capacityFreshness: r.capacityFreshness,
    };
  }

  /** Amorce versée dans l'archive locale (ajout seul) puis conservée en mémoire. */
  async loadListeHas(seedDir: string, archiveRoot: string, userDataDir: string): Promise<void> {
    this.listeHasSeed = await loadListeHasSeed(seedDir);
    this.listeHasArchiveRoot = archiveRoot;
    this.listeHasUserDataDir = userDataDir;
    await ensureArchive(archiveRoot);
    await seedEtats(archiveRoot, this.listeHasSeed.etats);
  }

  /**
   * Signaux d'état de la collecte : dérivés de l'index
   * (entrées `source: 'liste'`) et des réglages — le moteur core reste pur,
   * c'est ICI que l'I/O a lieu.
   */
  private async collecteSignaux(): Promise<{
    sourceIntrouvableDepuis: string | null;
    prochaineCollecte: string | null;
  }> {
    let sourceIntrouvableDepuis: string | null = null;
    try {
      const raw = await readFile(join(this.listeHasArchiveRoot!, 'index.jsonl'), 'utf8');
      const releves = raw
        .trim()
        .split('\n')
        .flatMap((l) => {
          try {
            return [JSON.parse(l) as { horodatage?: string; resultat?: string; source?: string }];
          } catch {
            return [];
          }
        })
        .filter(
          (e) =>
            e.source === 'liste' &&
            (e.resultat === 'archive' || e.resultat === 'inchange' || e.resultat === 'echec'),
        );
      // Date du premier 'echec' de la série d'échecs consécutifs la plus
      // récente — null dès que le dernier relevé est un succès.
      for (let i = releves.length - 1; i >= 0; i--) {
        if (releves[i].resultat !== 'echec') break;
        const d = (releves[i].horodatage ?? '').slice(0, 10);
        if (d) sourceIntrouvableDepuis = d;
      }
    } catch {
      sourceIntrouvableDepuis = null;
    }
    const settings = readSettings(this.listeHasUserDataDir!);
    const prochaineCollecte =
      settings.tachePlanifiee && settings.collecteHeure
        ? `${String(settings.collecteHeure.heure).padStart(2, '0')}:${String(settings.collecteHeure.minute).padStart(2, '0')}`
        : null;
    return { sourceIntrouvableDepuis, prochaineCollecte };
  }

  /** Vue complète de l'onglet — relit l'archive à chaque appel (collecte récente visible). */
  async accreditations(): Promise<AccreditationsView> {
    if (!this.listeHasSeed || !this.listeHasArchiveRoot || !this.listeHasUserDataDir) {
      throw new Error('liste HAS non chargée');
    }
    const [etats, cofrac, collecte] = await Promise.all([
      readAllEtats(this.listeHasArchiveRoot),
      readCofracReleves(this.listeHasArchiveRoot),
      this.collecteSignaux(),
    ]);
    return buildAccreditationsView({
      cabinets: listCabinets(this.req()),
      etats,
      bilans: this.listeHasSeed.bilans,
      faits: this.listeHasSeed.faits,
      pistes: this.listeHasSeed.pistes,
      alias: this.listeHasSeed.alias,
      cofrac,
      collecte,
    });
  }

  async exportAccreditations(
    volet: 'statuts' | 'chronologie' | 'sorties' | 'synthese',
    outDir: string,
    format: 'csv' | 'pdf',
  ): Promise<string> {
    const view = await this.accreditations();
    const today = new Date();
    const dateLabel = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const stamp = today.toISOString().slice(0, 10);
    let filename: string;
    let content: Buffer | string;
    if (format === 'pdf' || volet === 'synthese') {
      // PDF par volet (une seule section) ou synthèse (les trois).
      filename = `accreditations-${volet}-${stamp}.pdf`;
      content = await renderAccreditationsPdf(
        view,
        dateLabel,
        volet === 'synthese' ? undefined : [volet],
      );
    } else {
      filename = `accreditations-${volet}-${stamp}.csv`;
      content =
        volet === 'statuts' ? buildStatutsCsv(view)
        : volet === 'chronologie' ? buildChronologieCsv(view)
        : buildSortiesCsv(view);
    }
    const chemin = join(outDir, filename);
    await writeFile(chemin, content);
    return chemin;
  }
}
