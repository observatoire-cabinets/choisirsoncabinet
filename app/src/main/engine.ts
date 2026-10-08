import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDataset } from '../../../store/load';
import { refreshDataset, type RefreshFreshness } from '../../../store/refresh';
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
import { ficheIndisponibleTexte } from '../../../core/cabinet-fiche-text';
import { cabinetFicheHistory, type FicheCabinetHistory } from '../../../core/cabinet-fiche-history';
import { renderFicheCabinetPdf } from '../../../core/cabinet-fiche-pdf';
import {
  computePositioningHistory,
  tronquerHistorique,
  type CabinetPositioningHistory,
  type PositioningHistoryAll,
} from '../../../core/cabinet-positioning-history';
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

/** Résumé d'un rafraîchissement Synaé/FINESS. */
export interface RefreshSummary {
  meta: Dataset['meta'];
  archivedPrevious: string | null;
  finessFreshness: RefreshFreshness;
  capacityFreshness: RefreshFreshness;
}

/**
 * État de l'historique du positionnement d'un cabinet. 'echec' est définitif
 * jusqu'au prochain chargement ou rafraîchissement du jeu : aucune nouvelle
 * tentative automatique, pour ne pas relancer en boucle un calcul qui échoue.
 */
export type PositioningHistoryState =
  | { etat: 'pret'; data: CabinetPositioningHistory | null }
  | { etat: 'en-cours' }
  | { etat: 'echec' };

interface HistoryEntry {
  promise: Promise<PositioningHistoryAll | null>;
  result: PositioningHistoryAll | null | undefined;
  failed: boolean;
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
  /** Historique du positionnement, par alpha — invalidé au load/refresh (jeton de génération). */
  private historyCache = new Map<0.05 | 0.01, HistoryEntry>();
  private historyGen = 0;
  private lastHistoryAlpha: 0.05 | 0.01 = 0.05;
  private listeHasSeed: ListeHasSeed | null = null;
  private listeHasArchiveRoot: string | null = null;
  private listeHasUserDataDir: string | null = null;
  /** Rafraîchissement en cours : partagé par tous les appelants jusqu'à son issue. */
  private refreshEnVol: Promise<RefreshSummary> | null = null;
  private ecouteursRecharge: Array<() => void> = [];

  /** `cb` est appelé après chaque rafraîchissement réussi, une fois le nouveau jeu en place. */
  onDonneesRechargees(cb: () => void): void {
    this.ecouteursRecharge.push(cb);
  }

  async load(dir: string): Promise<void> {
    // Avant tout await : un calcul d'historique en vol s'arrête dès le début du rechargement.
    this.invalidateHistory();
    this.ds = await loadDataset(dir);
    this.proxy = makeStoreProxy(this.ds);
    this.profileCache = null;
    // Après l'affectation : écarte une entrée demandée pendant le chargement, calculée sur l'ancien jeu.
    this.invalidateHistory();
  }

  /** Annule le calcul d'historique en vol (jeton de génération) et vide le cache. */
  private invalidateHistory(): void {
    this.historyGen++;
    this.historyCache.clear();
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

  /** Lance (une fois) le calcul de l'historique pour `alpha`, en tranches mensuelles. */
  warmPositioningHistory(alpha: 0.05 | 0.01): void {
    this.lastHistoryAlpha = alpha;
    this.historyEntry(alpha);
  }

  private historyEntry(alpha: 0.05 | 0.01): HistoryEntry {
    const existant = this.historyCache.get(alpha);
    if (existant) return existant;
    const gen = this.historyGen;
    const entry: HistoryEntry = { promise: Promise.resolve(null), result: undefined, failed: false };
    entry.promise = computePositioningHistory(this.req(), alpha, {
      yieldEach: () => new Promise<void>((r) => setImmediate(r)),
      cancelled: () => gen !== this.historyGen,
    }).then(
      (r) => {
        if (gen === this.historyGen) entry.result = r;
        return r;
      },
      (err: unknown) => {
        console.error('Historique du positionnement :', err);
        entry.failed = true;
        return null;
      },
    );
    this.historyCache.set(alpha, entry);
    return entry;
  }

  positioningHistory(cabinet: string, alpha: 0.05 | 0.01): PositioningHistoryState {
    const e = this.historyEntry(alpha);
    if (e.failed) return { etat: 'echec' };
    if (!e.result) return { etat: 'en-cours' };
    return { etat: 'pret', data: e.result.byCabinet.get(cabinet) ?? null };
  }

  async positioningHistoryAwait(cabinet: string, alpha: 0.05 | 0.01): Promise<CabinetPositioningHistory | null> {
    const r = await this.historyEntry(alpha).promise;
    return r?.byCabinet.get(cabinet) ?? null;
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
    if (!fiche) {
      if (asOfMonth) throw new Error(`Aucune donnée pour le cabinet « ${cabinet} » à fin ${asOfMonth}.`);
      const nStructures = cabinetDetail(ds, cabinet)?.establishments.length ?? 0;
      throw new Error(ficheIndisponibleTexte(nStructures, ds.meta.finessSnapshotMax));
    }
    // Date imprimée : celle du jeu sur lequel la fiche vient d'être calculée.
    const periode = this.periodLabel(ds);
    // Historique du positionnement : le PDF attend le calcul (toujours complet) ;
    // pour une fiche passée, il est tronqué au mois demandé. Calcul en échec :
    // null, et la section 7 du PDF porte une mention d'indisponibilité.
    const gen = this.historyGen;
    const pos = await this.positioningHistoryAwait(cabinet, alpha);
    // Jeu remplacé, ou rechargement commencé, pendant l'attente : la fiche et
    // l'historique ne décriraient plus le même jeu, et un calcul annulé ferait
    // disparaître la section sans le signaler. L'export est refusé.
    if (this.ds !== ds || this.historyGen !== gen) {
      throw new Error("jeu de données rechargé pendant l'export — réessayer");
    }
    const positioning = pos && asOfMonth ? tronquerHistorique(pos, asOfMonth) : pos;
    const p = join(outDir, `fiche-cabinet-${this.slug(cabinet)}${asOfMonth ? `-${asOfMonth}` : ''}.pdf`);
    await writeFile(p, await renderFicheCabinetPdf(fiche, history, periode, alphaLabelFor(alpha), positioning));
    return p;
  }

  private periodLabel(ds: Dataset = this.req()): string {
    const d = ds.meta.hasSyncedAt?.slice(0, 10) ?? '';
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

  /**
   * À vol unique : un appel pendant un rafraîchissement en cours (par exemple
   * celui du démarrage et une demande manuelle) rend la même promesse au lieu
   * d'en lancer un second. Le vol est libéré à l'issue, succès ou échec.
   */
  refresh(currentDir: string, archiveRoot: string): Promise<RefreshSummary> {
    if (this.refreshEnVol) return this.refreshEnVol;
    const vol = this.refreshUnique(currentDir, archiveRoot).finally(() => {
      if (this.refreshEnVol === vol) this.refreshEnVol = null;
    });
    this.refreshEnVol = vol;
    return vol;
  }

  private async refreshUnique(currentDir: string, archiveRoot: string): Promise<RefreshSummary> {
    // L'ancien jeu reste servi pendant le téléchargement : son historique n'est écarté
    // qu'une fois le nouveau jeu en place (rien n'est perdu si le rafraîchissement échoue).
    const r = await refreshDataset({ currentDir, archiveRoot });
    this.ds = r.dataset;
    this.proxy = makeStoreProxy(this.ds);
    this.profileCache = null;
    this.invalidateHistory();
    this.warmPositioningHistory(this.lastHistoryAlpha);
    for (const cb of this.ecouteursRecharge) {
      try {
        cb();
      } catch (err) {
        // Un écouteur en échec (fenêtre fermée…) ne remet pas en cause le nouveau jeu.
        console.error('Données rechargées :', err);
      }
    }
    return {
      meta: this.ds.meta,
      archivedPrevious: r.archivedPrevious,
      finessFreshness: r.finessFreshness,
      capacityFreshness: r.capacityFreshness,
    };
  }

  /** Amorce versée dans l'archive locale (règles de fusion : seedEtats) puis conservée en mémoire. */
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
