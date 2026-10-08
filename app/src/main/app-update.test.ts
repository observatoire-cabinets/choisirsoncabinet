import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  reduceUpdateEvent,
  isUpdatableInstall,
  setPortableState,
  getAppUpdateState,
  type AppUpdateState,
} from './app-update';
import { DEFAULT_SETTINGS, writeSettings } from './settings';

// Faux autoUpdater ; autoInstallOnAppQuit non défini au départ pour que les deux
// valeurs (vrai / faux) posées par startAppUpdater soient observables.
const faux = vi.hoisted(() => ({
  on: vi.fn(),
  checkForUpdates: vi.fn(() => Promise.resolve()),
  autoDownload: false,
  autoInstallOnAppQuit: undefined as boolean | undefined,
}));
// Espace de noms ESM d'un module CommonJS dont l'export est un accesseur :
// seul `default` (= module.exports) porte autoUpdater, aucun export nommé
// `autoUpdater`. Le code lit donc l'export par défaut en premier : sur un module
// simulé sans export nommé, lire une clé absente lève une erreur (alors qu'un
// vrai espace de noms rend undefined) ; lire `ns.autoUpdater` d'abord ferait
// échouer ce test avec un message d'erreur de vitest, sans rapport avec l'accesseur.
vi.mock('electron-updater', () => ({ default: { autoUpdater: faux } }));
vi.mock('electron', () => ({ app: { on: vi.fn() } }));

const initial: AppUpdateState = { etat: 'non-verifie', versionDisponible: null };

describe('reduceUpdateEvent', () => {
  it('update-available → téléchargement, version exposée', () => {
    expect(reduceUpdateEvent(initial, { type: 'update-available', version: '0.5.0' })).toEqual({
      etat: 'telechargement',
      versionDisponible: '0.5.0',
    });
  });

  it('update-downloaded → prête à installer', () => {
    expect(
      reduceUpdateEvent({ etat: 'telechargement', versionDisponible: '0.5.0' }, { type: 'update-downloaded', version: '0.5.0' }),
    ).toEqual({ etat: 'prete', versionDisponible: '0.5.0' });
  });

  it('update-not-available → à jour, version effacée', () => {
    expect(
      reduceUpdateEvent({ etat: 'telechargement', versionDisponible: '0.5.0' }, { type: 'update-not-available' }),
    ).toEqual({ etat: 'a-jour', versionDisponible: null });
  });

  it('état « désactivée » conservé quel que soit l’événement reçu (vérification ou téléchargement en vol)', () => {
    const desactivee: AppUpdateState = { etat: 'desactivee', versionDisponible: null };
    expect(reduceUpdateEvent(desactivee, { type: 'update-available', version: '0.6.0' })).toEqual(desactivee);
    expect(reduceUpdateEvent(desactivee, { type: 'update-downloaded', version: '0.6.0' })).toEqual(desactivee);
    expect(reduceUpdateEvent(desactivee, { type: 'update-not-available' })).toEqual(desactivee);
    expect(reduceUpdateEvent(desactivee, { type: 'error' })).toEqual(desactivee);
  });

  it("error → indisponible, la version connue n'est pas perdue", () => {
    expect(
      reduceUpdateEvent({ etat: 'telechargement', versionDisponible: '0.5.0' }, { type: 'error' }),
    ).toEqual({ etat: 'indisponible', versionDisponible: '0.5.0' });
  });
});

describe('isUpdatableInstall', () => {
  const PRODUIT = "Observatoire Cabinets Evaluateurs d'ESSMS";
  // Faux système de fichiers sensible au chemin : seul le fichier exact existe,
  // seul le dossier « E » (dossier de l'exécutable) a un contenu.
  const fsx = (fichiers: string[], dossier: string[]) => ({
    exists: (p: string) => fichiers.includes(p.replace(/\\/g, '/')),
    list: (d: string) => (d === 'E' ? dossier : []),
  });
  it('installation NSIS : app-update.yml + désinstalleur → vrai', () => {
    expect(isUpdatableInstall('R', 'E', PRODUIT, fsx(['R/app-update.yml'], [`Uninstall ${PRODUIT}.exe`]))).toBe(true);
  });
  it('désinstalleur de ce logiciel : casse du nom de fichier ignorée → vrai', () => {
    expect(isUpdatableInstall('R', 'E', PRODUIT, fsx(['R/app-update.yml'], [`uninstall ${PRODUIT.toUpperCase()}.EXE`]))).toBe(true);
  });
  it('zip portable sans app-update.yml → faux', () => {
    expect(isUpdatableInstall('R', 'E', PRODUIT, fsx([], [`Uninstall ${PRODUIT}.exe`]))).toBe(false);
  });
  it('portable avec app-update.yml mais sans désinstalleur → faux', () => {
    expect(isUpdatableInstall('R', 'E', PRODUIT, fsx(['R/app-update.yml'], ['app.exe']))).toBe(false);
  });
  it('désinstalleur étranger seul (copie portable posée à côté d’un autre logiciel) → faux', () => {
    expect(isUpdatableInstall('R', 'E', PRODUIT, fsx(['R/app-update.yml'], ['Uninstall Autre.exe']))).toBe(false);
  });
  it('dossier illisible → faux', () => {
    expect(isUpdatableInstall('R', 'E', PRODUIT, { exists: () => true, list: () => { throw new Error('x'); } })).toBe(false);
  });
});

describe('état initial', () => {
  it('module chargé à neuf : « non vérifiée », aucune vérification n’ayant eu lieu', async () => {
    vi.resetModules();
    const m = await import('./app-update');
    expect(m.getAppUpdateState()).toEqual({ etat: 'non-verifie', versionDisponible: null });
  });
});

describe('état portable', () => {
  it('setPortableState expose « portable »', () => {
    setPortableState();
    expect(getAppUpdateState().etat).toBe('portable');
  });
});

describe('startAppUpdater', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'obs-maj-'));
    faux.on.mockClear();
    faux.checkForUpdates.mockClear();
    faux.autoDownload = false;
    faux.autoInstallOnAppQuit = undefined;
    // Intervalle de 24 h simulé : aucun minuteur réel ne survit au test.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    // Module rechargé à neuf : l'état de mise à jour ne passe pas d'un test à l'autre.
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Gestionnaire enregistré par startAppUpdater pour l'événement `evt` du faux autoUpdater. */
  const gestionnaire = (evt: string): ((arg?: unknown) => void) => {
    const appel = faux.on.mock.calls.find(([e]) => e === evt);
    if (!appel) throw new Error(`aucun gestionnaire pour ${evt}`);
    return appel[1] as (arg?: unknown) => void;
  };

  it('autoUpdate désactivé : aucune vérification, installation à la fermeture coupée, état « désactivée »', async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: false });
    const m = await import('./app-update');
    await m.startAppUpdater(dir);
    expect(m.getAppUpdateState()).toEqual({ etat: 'desactivee', versionDisponible: null });
    expect(faux.checkForUpdates).not.toHaveBeenCalled();
    expect(faux.autoInstallOnAppQuit).toBe(false);
  });

  it('autoUpdate activé : une vérification, téléchargement et installation à la fermeture ; « non vérifiée » jusqu’à la réponse, « à jour » après update-not-available', async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: true });
    const m = await import('./app-update');
    await m.startAppUpdater(dir);
    expect(faux.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(faux.autoDownload).toBe(true);
    expect(faux.autoInstallOnAppQuit).toBe(true);
    expect(m.getAppUpdateState().etat).toBe('non-verifie');
    gestionnaire('update-not-available')();
    expect(m.getAppUpdateState()).toEqual({ etat: 'a-jour', versionDisponible: null });
  });

  it('version prête puis réglage coupé : tick suivant → « désactivée », installation à la fermeture coupée', async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: true });
    const m = await import('./app-update');
    await m.startAppUpdater(dir);
    gestionnaire('update-downloaded')({ version: '0.6.0' });
    expect(m.getAppUpdateState()).toEqual({ etat: 'prete', versionDisponible: '0.6.0' });
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: false });
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(m.getAppUpdateState()).toEqual({ etat: 'desactivee', versionDisponible: null });
    expect(faux.autoInstallOnAppQuit).toBe(false);
    expect(faux.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('téléchargement en cours puis réglage coupé : la fin du téléchargement ne rend pas l’état « prête »', async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: true });
    const m = await import('./app-update');
    await m.startAppUpdater(dir);
    gestionnaire('update-available')({ version: '0.6.0' });
    expect(m.getAppUpdateState().etat).toBe('telechargement');
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: false });
    m.relancerVerificationLogiciel();
    expect(m.getAppUpdateState().etat).toBe('desactivee');
    gestionnaire('update-downloaded')({ version: '0.6.0' });
    expect(m.getAppUpdateState().etat).toBe('desactivee');
  });

  it('relance après bascule du réglage : l’état suit immédiatement, sans attendre le tick de 24 h', async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: false });
    const m = await import('./app-update');
    await m.startAppUpdater(dir);
    expect(m.getAppUpdateState().etat).toBe('desactivee');

    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: true });
    m.relancerVerificationLogiciel();
    expect(faux.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(faux.autoInstallOnAppQuit).toBe(true);
    expect(m.getAppUpdateState().etat).toBe('non-verifie');
    gestionnaire('update-not-available')();
    expect(m.getAppUpdateState().etat).toBe('a-jour');

    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: false });
    m.relancerVerificationLogiciel();
    expect(faux.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(faux.autoInstallOnAppQuit).toBe(false);
    expect(m.getAppUpdateState().etat).toBe('desactivee');
  });

  it('relance sans updater démarré : aucun effet (état et autoUpdater intacts)', async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: true });
    const m = await import('./app-update');
    m.relancerVerificationLogiciel();
    expect(m.getAppUpdateState().etat).toBe('non-verifie');
    expect(faux.checkForUpdates).not.toHaveBeenCalled();
    expect(faux.autoInstallOnAppQuit).toBeUndefined();
  });

  it('relance en version portable : aucun effet, l’état reste « portable »', async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: true });
    const m = await import('./app-update');
    m.setPortableState();
    m.relancerVerificationLogiciel();
    expect(m.getAppUpdateState().etat).toBe('portable');
    expect(faux.checkForUpdates).not.toHaveBeenCalled();
  });

  it('autoUpdater introuvable : cause journalisée, état « indisponible », aucune vérification', async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: true });
    // Module sans autoUpdater : la garde lève, le catch externe journalise.
    // `autoUpdater: undefined` est déclaré explicitement : sur un module simulé,
    // lire une clé non déclarée lève l'erreur de vitest au lieu de rendre undefined
    // (comportement d'un vrai espace de noms) et masquerait la garde testée ici.
    vi.doMock('electron-updater', () => ({ default: {}, autoUpdater: undefined }));
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const m = await import('./app-update');
      await m.startAppUpdater(dir);
      expect(m.getAppUpdateState().etat).toBe('indisponible');
      expect(erreur).toHaveBeenCalledTimes(1);
      const [libelle, cause] = erreur.mock.calls[0];
      expect(libelle).toBe('Mise à jour du logiciel :');
      expect(cause).toBeInstanceOf(Error);
      expect((cause as Error).message).toContain('autoUpdater introuvable');
      expect(faux.checkForUpdates).not.toHaveBeenCalled();
    } finally {
      // Rétablit le module simulé nominal pour les tests suivants. Ce vi.doMock
      // est le seul en attente : deux vi.doMock consécutifs du même module, sans
      // import entre eux, sont résolus en parallèle, sans ordre garanti.
      vi.doMock('electron-updater', () => ({ default: { autoUpdater: faux } }));
    }
  });

  it("événement « error » de l'updater : cause journalisée, état « indisponible »", async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: true });
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const m = await import('./app-update');
    await m.startAppUpdater(dir);
    expect(m.getAppUpdateState().etat).toBe('non-verifie');
    const appel = faux.on.mock.calls.find(([evt]) => evt === 'error');
    const gestionnaire = appel?.[1] as ((err: Error) => void) | undefined;
    expect(gestionnaire).toBeTypeOf('function');
    const cause = new Error('signature invalide');
    gestionnaire?.(cause);
    expect(erreur).toHaveBeenCalledTimes(1);
    expect(erreur).toHaveBeenCalledWith('Mise à jour du logiciel :', cause);
    expect(m.getAppUpdateState().etat).toBe('indisponible');
  });

  it('checkForUpdates rejeté : cause journalisée, état « indisponible »', async () => {
    writeSettings(dir, { ...DEFAULT_SETTINGS, autoUpdate: true });
    const cause = new Error('réseau coupé');
    faux.checkForUpdates.mockRejectedValueOnce(cause);
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const m = await import('./app-update');
    await m.startAppUpdater(dir);
    await vi.waitFor(() => expect(m.getAppUpdateState().etat).toBe('indisponible'));
    expect(erreur).toHaveBeenCalledTimes(1);
    expect(erreur).toHaveBeenCalledWith('Mise à jour du logiciel :', cause);
  });
});
