/**
 * Rafraîchissement du Dataset depuis les sources PUBLIQUES + archivage daté.
 *
 * Reconstruit un `Dataset` frais (types.ts) en téléchargeant les 5 sources
 * publiques, archive l'ancien dans un dossier daté, puis remplace `currentDir`
 * par ÉCHANGE ATOMIQUE (fichier temp + rename par fichier).
 *
 * L'HISTORIQUE FINESS 2021-2024 est STATIQUE (seed embarquée — l'histoire ne
 * change pas). Le refresh met à jour has_essms_open/eval + base-doc + le snapshot
 * FINESS COURANT (EJ et capacité), et FUSIONNE avec les snapshots historiques
 * embarqués (dates < snapshot courant conservées TELLES QUELLES). Limite assumée :
 * un ESSMS entrant dans la cohorte au refresh n'a pas d'historique EJ 2021-24
 * (il n'était pas dans la cohorte à l'export du seed) → repli as-of sur le snapshot
 * le plus ancien disponible (cf. pickAsOfSnapshot).
 *
 * ORDRE (all-or-nothing) : (1) charger l'ancien ; (2) tout
 * télécharger + parser EN MÉMOIRE ; si quoi que ce soit échoue → currentDir
 * INTACT et AUCUNE archive orpheline ; (3) archiver currentDir (copie) AVANT
 * toute écriture ; (4) écrire les 6 JSON de façon atomique. L'archive est prise
 * APRÈS le staging réussi (garantit « archive avant écriture » sans orphelin).
 *
 * CONTRÔLE DE FRAÎCHEUR (anti-panne silencieuse) : si la date du fichier FINESS
 * résolu est <= au max embarqué → le snapshot courant est CONSERVÉ (pas de
 * doublon de date) + warning explicite.
 */

import { mkdir, cp, writeFile, rename, rm, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { join } from 'node:path';

import type {
  Dataset,
  DatasetMeta,
  EssmsRow,
  EvalHistoryRow,
  BaseDocRow,
  EjSnapshotRow,
  CapacitySnapshotRow,
} from './types';
import { loadDataset } from './load';
import { buildFinessEjMapping } from '../core/finess-parse';
import { buildFinessCapacity } from '../core/finess-capacity-parse';
import {
  FINESS_DATASET_API,
  FINESS_CAPACITY_DATASET_API,
  pickLatestStockResource,
  pickLatestCapacityResource,
  type FinessResource,
} from '../core/finess-resolve';
import {
  readParquet,
  essmsRowsToStore,
  evalHistoryRowsToStore,
  parseBaseDocJsonlLine,
  toUtcDateString,
  HAS_ESSMS_URL,
  HAS_EVAL_URL,
  HAS_BASE_DOC_URL,
  type RawParquetRow,
} from '../core/has-parse';

export interface RefreshFreshness {
  snapshotType: 'finess-ej' | 'finess-capacity';
  /** Date (YYYY-MM-DD) lue dans l'en-tête du fichier FINESS fraîchement résolu. */
  resolvedDate: string;
  /** Max de snapshots embarqué pour ce type dans currentDir (null si aucun). */
  embeddedMax: string | null;
  /** resolvedDate strictement > embeddedMax → un snapshot est ajouté. */
  isNewer: boolean;
  /** Non nul quand le snapshot embarqué est conservé (source pas plus fraîche). */
  warning: string | null;
}

export interface RefreshResult {
  dataset: Dataset;
  /** Chemin du dossier d'archive de l'ancien dataset (null si rien à archiver). */
  archivedPrevious: string | null;
  finessFreshness: RefreshFreshness;
  capacityFreshness: RefreshFreshness;
}

export interface RefreshOpts {
  /** data/generated (ou le dossier de données de l'application). */
  currentDir: string;
  /** data/archives — un sous-dossier daté YYYY-MM-DD y est créé. */
  archiveRoot: string;
  /** Injectable pour tests (défaut : fetch global). */
  fetchImpl?: typeof fetch;
  /** Décodeurs parquet injectables (tests) — défaut : hyparquet réel. */
  parseEssmsParquet?: (buf: ArrayBuffer) => Promise<RawParquetRow[]>;
  parseEvalParquet?: (buf: ArrayBuffer) => Promise<RawParquetRow[]>;
  /** Horloge injectable (tests) — défaut : maintenant. */
  now?: Date;
}

/** lpad(x, 9, '0') Postgres : complète à gauche ET tronque à 9 (comme le moteur). */
const lpad9 = (s: string): string => (s.length >= 9 ? s.slice(0, 9) : s.padStart(9, '0'));

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<{ resources?: FinessResource[] }> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`résolution data.gouv échouée: HTTP ${res.status} ${res.statusText} (${url})`);
  return (await res.json()) as { resources?: FinessResource[] };
}

async function fetchLatin1(fetchImpl: typeof fetch, url: string): Promise<string> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`téléchargement FINESS échoué: HTTP ${res.status} ${res.statusText} (${url})`);
  return new TextDecoder('latin1').decode(await res.arrayBuffer());
}

async function fetchArrayBuffer(fetchImpl: typeof fetch, url: string): Promise<ArrayBuffer> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`téléchargement HAS échoué: HTTP ${res.status} ${res.statusText} (${url})`);
  return res.arrayBuffer();
}

/** Itère les lignes d'un corps HTTP (stream si possible, sinon texte entier). */
async function* streamLines(res: Response): AsyncGenerator<string> {
  if (res.body) {
    const nodeStream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
    const rl = createInterface({ input: nodeStream, crlfDelay: Infinity });
    for await (const line of rl) yield line;
    return;
  }
  const text = await res.text();
  for (const line of text.split(/\r?\n/)) yield line;
}

interface MergeOutcome<T> {
  rows: T[];
  embeddedMax: string | null;
  isNewer: boolean;
}

/**
 * Fusion as-of : conserve les snapshots historiques (dates < freshDate) TELS
 * QUELS et ajoute le snapshot frais ; si freshDate <= max embarqué, ne rien
 * ajouter (le courant est conservé, pas de doublon de date). Les dates sont des
 * YYYY-MM-DD → la comparaison de chaînes est un ordre calendaire correct.
 */
function mergeDatedSnapshots<T extends { snapshotDate: string }>(
  historical: T[],
  fresh: T[],
  freshDate: string,
): MergeOutcome<T> {
  const embeddedMax = historical.length
    ? historical.map((r) => r.snapshotDate).reduce((a, b) => (a > b ? a : b))
    : null;
  const isNewer = embeddedMax === null || freshDate > embeddedMax;
  if (!isNewer) return { rows: historical, embeddedMax, isNewer };
  const kept = historical.filter((r) => r.snapshotDate < freshDate);
  return { rows: [...kept, ...fresh], embeddedMax, isNewer };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Opérations fs injectables (tests : espion d'ordre / rename qui échoue). */
export interface DatasetWriteIo {
  writeFile: typeof writeFile;
  rename: typeof rename;
}

/**
 * Écriture des 6 JSON EN DEUX PHASES :
 *   Phase 1 — staging COMPLET sur disque : les 6 fichiers TEMPORAIRES sont tous
 *   écrits (~30-40 Mo de stringify+write) SANS toucher un seul fichier final.
 *   Phase 2 — les 6 renames en boucle serrée (chaque rename est atomique :
 *   MoveFileEx REPLACE_EXISTING sous Windows, rename(2) POSIX ailleurs).
 *
 * POURQUOI : écrire chaque fichier « temp+rename » séquentiellement laissait une
 * fenêtre déchirable de plusieurs secondes (un kill entre meta.json et
 * ej-snapshots.json → currentDir incohérent que loadDataset charge SANS erreur :
 * meta.finessSnapshotMax neuf + snapshots anciens = as-of subtilement faux).
 * Le staging-first réduit la fenêtre à « 6 renames » (microsecondes). Fenêtre
 * résiduelle assumée : l'ARCHIVE prise AVANT toute écriture reste le filet de
 * récupération manuel ; une garde de cohérence côté loadDataset = amélioration future.
 *
 * En cas d'échec (phase 1 ou 2) : les temporaires restants sont nettoyés (best
 * effort) ; les finaux déjà renommés restent (pas de rollback — archive = filet).
 */
export async function writeDatasetTwoPhase(
  dir: string,
  dataset: Dataset,
  io: DatasetWriteIo = { writeFile, rename },
): Promise<void> {
  const entries: [string, unknown][] = [
    ['meta.json', dataset.meta],
    ['essms.json', dataset.essms],
    ['ej-snapshots.json', dataset.ejSnapshots],
    ['capacity-snapshots.json', dataset.capacitySnapshots],
    ['base-doc.json', dataset.baseDoc],
    ['eval-history.json', dataset.evalHistory],
  ];
  const token = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  const staged: { tmp: string; final: string; renamed: boolean }[] = [];
  try {
    // Phase 1 : staging complet — aucun fichier final touché.
    for (const [name, data] of entries) {
      const tmp = join(dir, `.${name}.tmp-${token}`);
      await io.writeFile(tmp, JSON.stringify(data), 'utf8');
      staged.push({ tmp, final: join(dir, name), renamed: false });
    }
    // Phase 2 : renames en rafale (fenêtre déchirable ≈ microsecondes).
    for (const s of staged) {
      await io.rename(s.tmp, s.final);
      s.renamed = true;
    }
  } catch (err) {
    // Nettoyage best effort des temporaires non renommés (les finaux déjà
    // renommés restent — l'archive pré-écriture est le filet de récupération).
    for (const s of staged) {
      if (!s.renamed) await rm(s.tmp, { force: true }).catch(() => {});
    }
    throw err;
  }
}

export async function refreshDataset(opts: RefreshOpts): Promise<RefreshResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const parseEssms = opts.parseEssmsParquet ?? readParquet;
  const parseEval = opts.parseEvalParquet ?? readParquet;
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();

  // ── (1) charger l'ancien (valide currentDir ; sert de base à la fusion) ────────
  const prev = await loadDataset(opts.currentDir);

  // ── (2) TOUT télécharger + parser EN MÉMOIRE (staging all-or-nothing) ──────────
  // par_essms → essms + cohorte HAS (univers de prune pour ej/capacité/base-doc).
  const essmsBuf = await fetchArrayBuffer(fetchImpl, HAS_ESSMS_URL);
  const essms: EssmsRow[] = essmsRowsToStore(await parseEssms(essmsBuf));
  const cohort = new Set(essms.map((e) => lpad9(e.finessGeo)));

  // par_eval → historique (NON pruné à la cohorte).
  const evalBuf = await fetchArrayBuffer(fetchImpl, HAS_EVAL_URL);
  const evalHistory: EvalHistoryRow[] = evalHistoryRowsToStore(await parseEval(evalBuf));

  // FINESS établissements (répertoire) → ej_size NATIONAL puis prune cohorte.
  const ejMeta = await fetchJson(fetchImpl, FINESS_DATASET_API);
  const ejResource = pickLatestStockResource(ejMeta.resources ?? []);
  if (!ejResource?.url) throw new Error('FINESS établissements: aucune ressource CSV résolue sur data.gouv.fr');
  const ejText = await fetchLatin1(fetchImpl, ejResource.url);
  const parsedEj = buildFinessEjMapping(ejText.split(/\r?\n/));
  if (!parsedEj.snapshotDate) throw new Error('FINESS établissements: date d’extraction introuvable dans l’en-tête');
  const ejDate = toUtcDateString(parsedEj.snapshotDate)!;
  const freshEj: EjSnapshotRow[] = parsedEj.rows
    .filter((r) => cohort.has(lpad9(r.finessGeo)))
    .map((r) => ({ snapshotDate: ejDate, finessGeo: r.finessGeo, ejSize: r.ejSize }));

  // FINESS équipements (capacité) → somme hors supprimés puis prune cohorte.
  const capMeta = await fetchJson(fetchImpl, FINESS_CAPACITY_DATASET_API);
  const capResource = pickLatestCapacityResource(capMeta.resources ?? []);
  if (!capResource?.url) throw new Error('FINESS capacité: aucune ressource CSV résolue sur data.gouv.fr');
  const capText = await fetchLatin1(fetchImpl, capResource.url);
  const parsedCap = buildFinessCapacity(capText.split(/\r?\n/));
  if (!parsedCap.snapshotDate) throw new Error('FINESS capacité: date d’extraction introuvable dans l’en-tête');
  const capDate = toUtcDateString(parsedCap.snapshotDate)!;
  const freshCap: CapacitySnapshotRow[] = parsedCap.rows
    .filter((r) => cohort.has(lpad9(r.finessGeo)))
    .map((r) => ({ snapshotDate: capDate, finessGeo: r.finessGeo, capacityInstalled: r.capacityInstalled }));

  // base_document_essms.jsonl → nom officiel + adresse, pruné cohorte (streaming).
  const baseDocRes = await fetchImpl(HAS_BASE_DOC_URL);
  if (!baseDocRes.ok) {
    throw new Error(`téléchargement base-doc échoué: HTTP ${baseDocRes.status} ${baseDocRes.statusText}`);
  }
  const baseDocMap = new Map<string, BaseDocRow>();
  for await (const line of streamLines(baseDocRes)) {
    const r = parseBaseDocJsonlLine(line);
    if (!r) continue;
    if (!cohort.has(lpad9(r.finessGeo))) continue;
    baseDocMap.set(r.finessGeo, r); // dernier gagne (upsert PK finess_geo)
  }
  const baseDoc: BaseDocRow[] = [...baseDocMap.values()];

  // ── (3) fusion as-of avec l'historique embarqué + contrôle de fraîcheur ────────
  const ejMerge = mergeDatedSnapshots(prev.ejSnapshots, freshEj, ejDate);
  const capMerge = mergeDatedSnapshots(prev.capacitySnapshots, freshCap, capDate);

  const finessSnapshotMax = ejMerge.isNewer ? ejDate : ejMerge.embeddedMax ?? '';
  const capSnapshotMax = capMerge.isNewer ? capDate : capMerge.embeddedMax ?? '';

  const finessFreshness: RefreshFreshness = {
    snapshotType: 'finess-ej',
    resolvedDate: ejDate,
    embeddedMax: ejMerge.embeddedMax,
    isNewer: ejMerge.isNewer,
    warning: ejMerge.isNewer
      ? null
      : `FINESS établissements: date résolue ${ejDate} <= max embarqué ${ejMerge.embeddedMax} ` +
        `— snapshot courant conservé (pas de doublon). Source data.gouv.fr peut-être non republiée.`,
  };
  const capacityFreshness: RefreshFreshness = {
    snapshotType: 'finess-capacity',
    resolvedDate: capDate,
    embeddedMax: capMerge.embeddedMax,
    isNewer: capMerge.isNewer,
    warning: capMerge.isNewer
      ? null
      : `FINESS capacité: date résolue ${capDate} <= max embarqué ${capMerge.embeddedMax} ` +
        `— snapshot courant conservé (pas de doublon).`,
  };
  if (finessFreshness.warning) console.warn(`[refresh] ⚠️  ${finessFreshness.warning}`);
  if (capacityFreshness.warning) console.warn(`[refresh] ⚠️  ${capacityFreshness.warning}`);

  const meta: DatasetMeta = {
    builtAt: nowIso,
    hasSyncedAt: nowIso,
    finessSnapshotMax,
    sources: [
      {
        name: 'HAS Synaé — open_data_par_essms (évaluations ESSMS)',
        url: HAS_ESSMS_URL,
        license: 'ODbL',
        retrievedAt: nowIso,
      },
      {
        name: 'FINESS — extraction du fichier des établissements (répertoire national, geo→EJ)',
        url: 'https://www.data.gouv.fr/fr/datasets/finess-extraction-du-fichier-des-etablissements/',
        license: 'Licence Ouverte 2.0',
        retrievedAt: `${finessSnapshotMax}T00:00:00.000Z`,
      },
      {
        name: 'FINESS — équipements sociaux et médico-sociaux (capacité installée, cs1100505)',
        url: 'https://www.data.gouv.fr/fr/datasets/finess-extraction-des-equipements-sociaux-et-medico-sociaux/',
        license: 'Licence Ouverte 2.0',
        retrievedAt: `${capSnapshotMax}T00:00:00.000Z`,
      },
      {
        name: 'HAS — base_document_essms (nom officiel + adresse)',
        url: HAS_BASE_DOC_URL,
        license: 'Licence Ouverte 2.0',
        retrievedAt: nowIso,
      },
    ],
  };

  const dataset: Dataset = {
    meta,
    essms,
    ejSnapshots: ejMerge.rows,
    capacitySnapshots: capMerge.rows,
    baseDoc,
    evalHistory,
  };

  // ── (4) archiver l'ancien (copie) AVANT toute écriture dans currentDir ─────────
  const archiveDate = toUtcDateString(now)!;
  let archiveDir = join(opts.archiveRoot, archiveDate);
  if (await pathExists(archiveDir)) {
    // Re-run le même jour : suffixe horaire pour ne pas écraser une archive.
    const hhmmss =
      String(now.getUTCHours()).padStart(2, '0') +
      String(now.getUTCMinutes()).padStart(2, '0') +
      String(now.getUTCSeconds()).padStart(2, '0');
    archiveDir = join(opts.archiveRoot, `${archiveDate}_${hhmmss}`);
  }
  await mkdir(opts.archiveRoot, { recursive: true });
  await cp(opts.currentDir, archiveDir, { recursive: true });

  // ── (5) écrire les 6 JSON en DEUX PHASES (staging temporaires puis renames) ────
  await writeDatasetTwoPhase(opts.currentDir, dataset);

  return { dataset, archivedPrevious: archiveDir, finessFreshness, capacityFreshness };
}
