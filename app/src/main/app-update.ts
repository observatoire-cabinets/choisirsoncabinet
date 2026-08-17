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
import { readSettings } from './settings';

export interface AppUpdateState {
  etat: 'a-jour' | 'telechargement' | 'prete' | 'indisponible';
  versionDisponible: string | null;
}

export type AppUpdateEvent =
  | { type: 'update-available'; version: string | null }
  | { type: 'update-downloaded'; version: string | null }
  | { type: 'update-not-available' }
  | { type: 'error' };

/** Réducteur pur événement → état (aucune dépendance electron-updater). */
export function reduceUpdateEvent(state: AppUpdateState, evt: AppUpdateEvent): AppUpdateState {
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

let state: AppUpdateState = { etat: 'a-jour', versionDisponible: null };

export function getAppUpdateState(): AppUpdateState {
  return { ...state };
}

/** À appeler une fois au démarrage (mode normal, packagé). Jamais de throw. */
export async function startAppUpdater(userDataDir: string): Promise<void> {
  try {
    // Import différé : electron-updater exige electron au chargement — un import
    // au niveau module casserait le test vitest du réducteur pur ci-dessus
    // (même précédent que hyparquet/pdfjs : dépendance chargée à l'usage).
    const { autoUpdater } = await import('electron-updater');
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
    autoUpdater.on('error', () => {
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
        return;
      }
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.checkForUpdates().catch(() => {
        state = reduceUpdateEvent(state, { type: 'error' });
      });
    };
    verifier();
    setInterval(verifier, 24 * 60 * 60 * 1000);
  } catch {
    // Import ou initialisation impossible (ex. environnement hors Electron) :
    // jamais de throw, l'app reste pleinement fonctionnelle sur sa version.
    state = reduceUpdateEvent(state, { type: 'error' });
  }
}
