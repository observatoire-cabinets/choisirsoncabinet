/**
 * Archive locale de la liste HAS et des relevés COFRAC — AJOUT SEUL pour les
 * bruts, l'index et le journal ; les états sont des produits d'analyseur
 * (une re-analyse peut les remplacer, seul le brut fait foi).
 * Un état d'amorce (embarqué, sans brut local) n'écrase JAMAIS un état issu
 * d'une collecte du poste.
 */
import { mkdir, readFile, writeFile, readdir, appendFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ListeHasEtat } from '../core/liste-has-parse';
import type { CofracReleve } from './liste-has-types';

const ETATS = 'etats';
const BRUT = 'brut';
const COFRAC = 'cofrac';
const INDEX = 'index.jsonl';
const JOURNAL = 'journal-sorties.jsonl';
const JOURNAL_MD = 'journal-sorties.md';
const VERROU = 'verrou.json';

/** L'index est partagé entre les deux collectes : chaque entrée porte sa source. */
export type SourceCollecte = 'liste' | 'cofrac';

/** Un verrou plus vieux que 2 h appartient à un processus mort. */
const VERROU_OBSOLETE_MS = 2 * 60 * 60 * 1000;

export async function ensureArchive(root: string): Promise<void> {
  await mkdir(join(root, BRUT), { recursive: true });
  await mkdir(join(root, ETATS), { recursive: true });
  await mkdir(join(root, COFRAC), { recursive: true });
}

export async function writeEtat(root: string, etat: ListeHasEtat): Promise<void> {
  await writeFile(
    join(root, ETATS, `${etat.date_releve}_etat.json`),
    JSON.stringify(etat, null, 1),
    'utf8',
  );
}

export async function readAllEtats(root: string): Promise<ListeHasEtat[]> {
  let files: string[];
  try {
    files = (await readdir(join(root, ETATS))).filter((f) => f.endsWith('_etat.json')).sort();
  } catch {
    return [];
  }
  const etats: ListeHasEtat[] = [];
  for (const f of files) {
    try {
      etats.push(JSON.parse(await readFile(join(root, ETATS, f), 'utf8')) as ListeHasEtat);
    } catch {
      // Un état illisible n'empêche pas la lecture des autres.
    }
  }
  return etats; // tri par nom de fichier = tri par date_releve (YYYY-MM-DD)
}

/** Fusion de l'amorce : ajoute les états absents, ne touche jamais un état local. */
export async function seedEtats(root: string, amorce: ListeHasEtat[]): Promise<void> {
  const existants = new Set((await readAllEtats(root)).map((e) => e.date_releve));
  for (const e of amorce) {
    if (!existants.has(e.date_releve)) await writeEtat(root, e);
  }
}

export async function appendIndex(root: string, entree: Record<string, unknown>): Promise<void> {
  await appendFile(join(root, INDEX), JSON.stringify(entree) + '\n', 'utf8');
}

/** Dernière empreinte consignée pour UNE source — l'index étant partagé,
 * l'empreinte d'un HTML COFRAC ne doit jamais servir de référence de dédup
 * au PDF de la liste (et réciproquement). */
export async function latestSha(root: string, source: SourceCollecte): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(join(root, INDEX), 'utf8');
  } catch {
    return null;
  }
  for (const ligne of raw.trim().split('\n').reverse()) {
    try {
      const e = JSON.parse(ligne) as { sha256?: string; source?: string };
      if (e.source === source && e.sha256) return e.sha256;
    } catch {
      continue;
    }
  }
  return null;
}

/** Entrée du journal des sorties (forme écrite par la collecte). */
export interface JournalSortieEntree {
  siren: string;
  nom_dernier_connu: string;
  numero_dernier_connu: string | null;
  departement: string;
  dernier_etat_present: string;
  premier_etat_absent: string;
  motif: string;
}

export async function appendJournalSorties(
  root: string,
  entrees: JournalSortieEntree[],
): Promise<void> {
  if (!entrees.length) return;
  // Idempotence : la collecte journalise AVANT d'écrire l'état ; si l'état
  // échoue, la re-détection du lendemain rappelle avec les MÊMES sorties. Le
  // couple (siren, premier_etat_absent) déjà journalisé n'est jamais ré-écrit.
  const deja = new Set<string>();
  try {
    for (const ligne of (await readFile(join(root, JOURNAL), 'utf8')).split('\n')) {
      if (!ligne.trim()) continue;
      try {
        const e = JSON.parse(ligne) as { siren?: unknown; premier_etat_absent?: unknown };
        if (typeof e.siren === 'string' && typeof e.premier_etat_absent === 'string') {
          deja.add(`${e.siren}|${e.premier_etat_absent}`);
        }
      } catch {
        // Ligne illisible (crash mi-écriture) : ignorée, jamais bloquante.
      }
    }
  } catch {
    // Pas de journal : rien n'est encore consigné.
  }
  const nouvelles = entrees.filter((e) => !deja.has(`${e.siren}|${e.premier_etat_absent}`));
  if (!nouvelles.length) return;
  const lignes = nouvelles.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await appendFile(join(root, JOURNAL), lignes, 'utf8');
  // Version lisible : une ligne française par sortie RÉELLEMENT
  // appendée, formulation neutre.
  const lisible =
    nouvelles
      .map(
        (e) =>
          `- ${e.nom_dernier_connu} (SIREN ${e.siren}, dép. ${e.departement}, ` +
          `${e.numero_dernier_connu ? `n° ${e.numero_dernier_connu}` : 'sans numéro'}) — ` +
          `présent au ${e.dernier_etat_present}, absent au ${e.premier_etat_absent}. ` +
          `Motif non indiqué par la source.`,
      )
      .join('\n') + '\n';
  await appendFile(join(root, JOURNAL_MD), lisible, 'utf8');
}

export async function writeBrut(root: string, nom: string, contenu: Buffer): Promise<void> {
  await writeFile(join(root, BRUT, nom), contenu);
}

export async function writeCofracReleve(root: string, releve: CofracReleve): Promise<void> {
  await writeFile(
    join(root, COFRAC, `${releve.date_releve}_rrs.json`),
    JSON.stringify(releve, null, 1),
    'utf8',
  );
}

export async function readCofracReleves(root: string): Promise<CofracReleve[]> {
  let files: string[];
  try {
    files = (await readdir(join(root, COFRAC))).filter((f) => f.endsWith('_rrs.json')).sort();
  } catch {
    return [];
  }
  const out: CofracReleve[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(root, COFRAC, f), 'utf8')) as CofracReleve);
    } catch {
      // ignoré
    }
  }
  return out;
}

/**
 * Verrou de collecte : true si acquis. `now` injectable pour les tests.
 * L'horodatage vit DANS le fichier (champ `at`) — pas de dépendance au mtime.
 * L'écriture est EXCLUSIVE (flag 'wx') : sur verrou frais, deux acquisitions
 * simultanées ne peuvent pas réussir toutes les deux (pas de course
 * lire-puis-écrire) ; la reprise d'un verrou obsolète est best-effort (voir
 * le commentaire plus bas).
 */
export async function acquireLock(root: string, now: Date = new Date()): Promise<boolean> {
  const p = join(root, VERROU);
  const contenu = JSON.stringify({ pid: process.pid, at: now.toISOString() });
  try {
    await writeFile(p, contenu, { flag: 'wx' });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return false;
  }
  // Un verrou existe déjà : il ne cède que s'il est obsolète (processus mort).
  let at = 0;
  try {
    const existing = JSON.parse(await readFile(p, 'utf8')) as { at?: string };
    at = existing.at ? Date.parse(existing.at) : 0;
    if (Number.isNaN(at)) at = 0; // horodatage illisible → traité comme obsolète
  } catch {
    // fichier illisible (crash mi-écriture) → traité comme obsolète
  }
  if (now.getTime() - at < VERROU_OBSOLETE_MS) return false;
  // Obsolète : reprise best-effort, UNE seule retentative — le rm peut effacer
  // le verrou frais d'un concurrent qui vient de reprendre la main ; cette
  // course résiduelle entre deux processus hors-app est acceptée (le verrou
  // d'instance Electron l'empêche dans le produit).
  try {
    await rm(p, { force: true });
    await writeFile(p, contenu, { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

export async function releaseLock(root: string): Promise<void> {
  await rm(join(root, VERROU), { force: true });
}
