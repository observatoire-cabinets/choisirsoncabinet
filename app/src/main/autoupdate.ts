/**
 * Rafraîchissement des DONNÉES publiques (Synaé/FINESS) — la mise à jour du
 * LOGICIEL est dans app-update.ts. Contient aussi la mise à jour manuelle
 * déclenchée depuis les Réglages (collecte liste HAS + COFRAC, puis données).
 */
import type { BrowserWindow } from 'electron';
import type { EngineService } from './engine';
import type { RunCollecteResult } from './collecte-run';
import type { RefreshFreshness } from '../../../store/refresh';

/** Rafraîchissement des données seulement si le réglage est actif ET une connexion est disponible. */
export function shouldAutoUpdate(s: { autoUpdate: boolean }, online: boolean): boolean {
  return s.autoUpdate && online;
}

type FraicheurSource = Pick<RefreshFreshness, 'resolvedDate' | 'embeddedMax' | 'isNewer'>;

interface FraicheurRafraichissement {
  finessFreshness: FraicheurSource;
  capacityFreshness: FraicheurSource;
}

/** AAAA-MM-JJ → JJ/MM/AAAA (chaîne rendue telle quelle si elle n'est pas une date ISO). */
function dateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Note en clair quand un extrait FINESS n'a pas été remplacé (source pas plus
 * récente que l'extrait détenu), construite sur les champs structurés ; null si
 * les deux extraits sont nouveaux. La chaîne `warning` du store reste au journal.
 */
export function noteFraicheur(r: FraicheurRafraichissement): string | null {
  const conserve = (f: FraicheurSource): string | null =>
    f.isNewer ? null : dateFr(f.embeddedMax ?? f.resolvedDate);
  const phrase = (quoi: string, date: string): string =>
    `${quoi} : aucune publication plus récente que l’extrait du ${date}, extrait actuel conservé`;
  const ej = conserve(r.finessFreshness);
  const cap = conserve(r.capacityFreshness);
  if (ej && cap && ej === cap) return phrase('FINESS', ej);
  const parts = [ej ? phrase('FINESS établissements', ej) : null, cap ? phrase('FINESS capacités', cap) : null];
  const t = parts.filter((x): x is string => x !== null).join(' ; ');
  return t || null;
}

/** Message de progression d'un rafraîchissement réussi. */
function messageDonneesAJour(note: string | null): string {
  return note ? `Données à jour (${note}).` : 'Données à jour.';
}

/**
 * Opération à vol unique : une demande pendant qu'un vol est en cours rend la
 * même promesse ; le vol est libéré à l'issue, succès ou échec.
 */
export function volUnique<T>(lancer: () => Promise<T>): {
  demarrer(): Promise<T>;
  rejoindre(): Promise<T> | null;
  enCours(): boolean;
} {
  let vol: Promise<T> | null = null;
  return {
    demarrer() {
      if (vol) return vol;
      const p = lancer().finally(() => {
        if (vol === p) vol = null;
      });
      vol = p;
      return p;
    },
    rejoindre: () => vol,
    enCours: () => vol !== null,
  };
}

/**
 * Rafraîchit les données publiques en arrière-plan et pousse la progression au
 * renderer. TOUJOURS sans échec bloquant : en cas d'erreur réseau, l'application
 * conserve les données actuelles et reste pleinement fonctionnelle hors-ligne.
 */
export async function runAutoUpdate(
  engine: EngineService,
  win: BrowserWindow,
  dirs: { dataDir: string; archiveRoot: string },
): Promise<void> {
  const send = (msg: string): void => {
    if (!win.isDestroyed()) win.webContents.send('refresh:progress', msg);
  };
  try {
    send('Mise à jour des données publiques…');
    const r = await engine.refresh(dirs.dataDir, dirs.archiveRoot);
    send(messageDonneesAJour(noteFraicheur(r)));
  } catch {
    // Les données servies peuvent déjà venir d'un rafraîchissement antérieur.
    send('Mise à jour indisponible — données actuelles conservées.');
  }
}

/** Résumé de la mise à jour manuelle, rendu au renderer (traduit en clair par l'écran Réglages). */
export type MiseAJourDonneesResultat =
  | { etat: 'hors-ligne' }
  | {
      etat: 'termine';
      /** 'skipped' : une autre collecte détient le verrou de l'archive. */
      collecte: RunCollecteResult | 'skipped';
      /** note : fraîcheur FINESS en clair (noteFraicheur), null si les extraits sont nouveaux. */
      donnees: { ok: true; note: string | null } | { ok: false; message: string };
    };

export interface MiseAJourDonneesDeps {
  enLigne(): boolean;
  /** Collecte du jour de la liste HAS et du relevé COFRAC (runCollecte). */
  collecter(): Promise<RunCollecteResult | 'skipped'>;
  /** Rafraîchissement Synaé/FINESS (engine.refresh). */
  rafraichir(): Promise<FraicheurRafraichissement>;
  progression(msg: string): void;
}

const CODES_RESEAU = /\b(?:ECONN\w*|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR\w*)\b/;

/**
 * Message d'une erreur pour l'affichage : cas réseau fréquents traduits (source
 * injoignable, erreur HTTP réduite à son code), sinon première ligne, sans pile.
 * L'erreur complète (URL comprise) reste au journal.
 */
function messageCourt(e: unknown): string {
  const brut = e instanceof Error ? e.message : String(e);
  const cause = e instanceof Error ? (e.cause as { code?: unknown } | undefined)?.code : undefined;
  if (/fetch failed/i.test(brut) || CODES_RESEAU.test(brut) || (typeof cause === 'string' && CODES_RESEAU.test(cause))) {
    return 'source injoignable';
  }
  const http = /\bHTTP (\d{3})\b/.exec(brut);
  if (http) return `la source a répondu par une erreur (${http[1]})`;
  const ligne = brut.split(/\r?\n/)[0]?.trim() ?? '';
  return ligne || 'cause non précisée';
}

/**
 * Mise à jour manuelle des données, indépendante du réglage autoUpdate :
 * hors ligne, rien n'est tenté ; sinon collecte du jour (liste HAS + COFRAC)
 * puis rafraîchissement Synaé/FINESS. Ne rejette jamais : chaque échec est
 * porté par le résumé.
 */
export async function miseAJourDonnees(deps: MiseAJourDonneesDeps): Promise<MiseAJourDonneesResultat> {
  if (!deps.enLigne()) {
    deps.progression('Hors ligne : aucune mise à jour tentée.');
    return { etat: 'hors-ligne' };
  }

  deps.progression('Relevé du jour de la liste HAS et du COFRAC…');
  let collecte: RunCollecteResult | 'skipped';
  try {
    collecte = await deps.collecter();
  } catch (e) {
    console.error('Mise à jour manuelle : collecte', e);
    collecte = { liste: 'echec', cofrac: 'echec' };
  }

  deps.progression('Mise à jour des données publiques…');
  try {
    const r = await deps.rafraichir();
    const note = noteFraicheur(r);
    deps.progression(messageDonneesAJour(note));
    return { etat: 'termine', collecte, donnees: { ok: true, note } };
  } catch (e) {
    console.error('Mise à jour manuelle : données', e);
    deps.progression('Mise à jour des données Synaé/FINESS impossible — données actuelles conservées.');
    return { etat: 'termine', collecte, donnees: { ok: false, message: messageCourt(e) } };
  }
}
