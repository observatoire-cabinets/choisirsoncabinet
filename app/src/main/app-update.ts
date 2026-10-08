/**
 * Mise à jour automatique du logiciel : vérifie les releases GitHub,
 * télécharge en arrière-plan, installe à la fermeture (autoInstallOnAppQuit).
 * Jamais bloquant, jamais de throw : un échec laisse l'app sur sa version.
 * Le réglage autoUpdate est RELU à chaque tick ET juste avant la fermeture
 * (before-quit) : le désactiver coupe toute connexion automatique ET
 * l'installation à la fermeture, IMMÉDIATEMENT — même pour une mise à jour
 * déjà téléchargée, sans attendre le tick suivant, sans redémarrage.
 * Le réducteur d'état est PUR (testé sous vitest) ; electron-updater et
 * electron (app) sont importés dynamiquement dans startAppUpdater — ce
 * module reste importable hors Electron pour les tests.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppUpdater } from 'electron-updater';
import { readSettings } from './settings';

/**
 * 'non-verifie' : aucune réponse de vérification reçue (état initial, y compris
 * quand l'updater n'est pas démarré). 'desactivee' : réglage autoUpdate coupé —
 * aucune vérification, et une version en téléchargement ou prête ne sera pas
 * installée. 'a-jour' n'est posé qu'à la réception de update-not-available.
 */
export interface AppUpdateState {
  etat: 'non-verifie' | 'desactivee' | 'a-jour' | 'telechargement' | 'prete' | 'indisponible' | 'portable';
  versionDisponible: string | null;
}

export type AppUpdateEvent =
  | { type: 'update-available'; version: string | null }
  | { type: 'update-downloaded'; version: string | null }
  | { type: 'update-not-available' }
  | { type: 'error' };

/** Réducteur pur événement → état (aucune dépendance electron-updater). */
export function reduceUpdateEvent(state: AppUpdateState, evt: AppUpdateEvent): AppUpdateState {
  // Réglage coupé : un événement tardif (vérification ou téléchargement lancé
  // avant la coupure) ne change rien à ce qui sera fait — l'état reste « désactivée ».
  if (state.etat === 'desactivee') return state;
  switch (evt.type) {
    case 'update-available':
      return { etat: 'telechargement', versionDisponible: evt.version };
    case 'update-downloaded':
      return { etat: 'prete', versionDisponible: evt.version };
    case 'update-not-available':
      return { etat: 'a-jour', versionDisponible: null };
    case 'error':
      return { ...state, etat: 'indisponible' };
  }
}

let state: AppUpdateState = { etat: 'non-verifie', versionDisponible: null };

/** Vérification courante, posée par startAppUpdater ; null tant que l'updater n'est pas démarré. */
let verifierCourant: (() => void) | null = null;

export function getAppUpdateState(): AppUpdateState {
  return { ...state };
}

/**
 * Rejoue la vérification après une bascule du réglage autoUpdate, sans attendre
 * le tick de 24 h. Sans effet si l'updater n'a pas été démarré (version
 * portable, lancement sans mise à jour, session issue de --collecte).
 */
export function relancerVerificationLogiciel(): void {
  verifierCourant?.();
}

/**
 * Vrai pour une installation par l'installateur : fichier de canal
 * `app-update.yml` présent dans les ressources ET désinstalleur de CE logiciel
 * (`Uninstall <productName>.exe`, casse du nom de fichier ignorée) posé à côté
 * de l'exécutable. Le zip portable peut contenir app-update.yml (copie de
 * win-unpacked) : c'est l'absence du désinstalleur qui distingue la copie
 * portable, laquelle ne télécharge jamais l'installateur.
 */
export function isUpdatableInstall(
  resourcesDir: string,
  execDir: string,
  productName: string,
  fsx: { exists(p: string): boolean; list(d: string): string[] } = { exists: existsSync, list: readdirSync },
): boolean {
  try {
    if (!fsx.exists(join(resourcesDir, 'app-update.yml'))) return false;
    const desinstalleur = `Uninstall ${productName}.exe`.toLowerCase();
    return fsx.list(execDir).some((f) => f.toLowerCase() === desinstalleur);
  } catch {
    // Prudence : en cas de doute (lecture impossible), pas de mise à jour du logiciel.
    return false;
  }
}

/** Copie portable : la mise à jour du logiciel n'est pas disponible (les données, si). */
export function setPortableState(): void {
  state = { etat: 'portable', versionDisponible: null };
}

/** À appeler une fois au démarrage (mode normal, packagé). Jamais de throw. */
export async function startAppUpdater(userDataDir: string): Promise<void> {
  try {
    // Import différé : electron-updater exige electron au chargement — un import
    // au niveau module casserait le test vitest du réducteur pur ci-dessus
    // (même précédent que hyparquet/pdfjs : dépendance chargée à l'usage).
    // electron-updater est un module CommonJS dont l'export autoUpdater est un
    // accesseur (Object.defineProperty avec get) : l'analyse des exports nommés
    // de Node ne le détecte pas, et l'espace de noms de l'import n'expose alors
    // pas `autoUpdater` : seul `default` (= module.exports) porte l'accesseur.
    // Lecture sur `default` d'abord, repli sur l'export nommé s'il est un jour
    // exposé directement. L'export par défaut est lu en premier parce qu'un module
    // simulé (tests) sans export nommé lève une erreur à la lecture d'une clé
    // absente, alors qu'un vrai espace de noms rend simplement undefined.
    const ns = (await import('electron-updater')) as {
      autoUpdater?: AppUpdater;
      default?: { autoUpdater?: AppUpdater };
    };
    const autoUpdater = ns.default?.autoUpdater ?? ns.autoUpdater;
    if (!autoUpdater) throw new Error('electron-updater : autoUpdater introuvable');
    const { app } = await import('electron');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-available', (info) => {
      state = reduceUpdateEvent(state, { type: 'update-available', version: info.version ?? null });
    });
    autoUpdater.on('update-downloaded', (info) => {
      state = reduceUpdateEvent(state, { type: 'update-downloaded', version: info.version ?? null });
    });
    autoUpdater.on('update-not-available', () => {
      state = reduceUpdateEvent(state, { type: 'update-not-available' });
    });
    autoUpdater.on('error', (err) => {
      // Cause journalisée : réseau, signature ou flux de publication ne doivent
      // pas se réduire à un état « indisponible » sans trace.
      console.error('Mise à jour du logiciel :', err);
      state = reduceUpdateEvent(state, { type: 'error' });
    });

    // Dernière relecture juste avant la fermeture : le tick périodique peut être
    // périmé de jusqu'à 24 h — sans ce garde, décocher le réglage APRÈS le
    // dernier tick puis quitter installerait quand même une mise à jour déjà
    // téléchargée. Corrige immédiatement, sans attendre le tick suivant.
    app.on('before-quit', () => {
      autoUpdater.autoInstallOnAppQuit = readSettings(userDataDir).autoUpdate;
    });

    const verifier = (): void => {
      // RELIRE le réglage à chaque tick : désactivation effective sans redémarrage
      // (promesse des Réglages : désactiver coupe toute connexion automatique).
      if (!readSettings(userDataDir).autoUpdate) {
        autoUpdater.autoInstallOnAppQuit = false;
        state = { etat: 'desactivee', versionDisponible: null };
        return;
      }
      autoUpdater.autoInstallOnAppQuit = true;
      // Réglage réactivé : rien n'est connu tant que la vérification n'a pas répondu.
      if (state.etat === 'desactivee') state = { etat: 'non-verifie', versionDisponible: null };
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Mise à jour du logiciel :', err);
        state = reduceUpdateEvent(state, { type: 'error' });
      });
    };
    verifierCourant = verifier;
    verifier();
    setInterval(verifier, 24 * 60 * 60 * 1000);
  } catch (err) {
    // Import ou initialisation impossible (ex. environnement hors Electron) :
    // jamais de throw, l'app reste pleinement fonctionnelle sur sa version ;
    // la cause est journalisée, faute de quoi l'échec resterait invisible.
    console.error('Mise à jour du logiciel :', err);
    state = reduceUpdateEvent(state, { type: 'error' });
  }
}
