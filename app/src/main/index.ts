import { app, BrowserWindow, dialog, net } from 'electron';
import { join } from 'node:path';
import { EngineService } from './engine';
import { registerIpc } from './ipc';
import {
  resolveDataDir,
  resolveArchiveRoot,
  resolveListeHasSeedDir,
  resolveListeHasArchiveRoot,
} from './paths';
import { readSettings, writeSettings } from './settings';
import { shouldAutoUpdate, runAutoUpdate } from './autoupdate';
import { startAppUpdater } from './app-update';
import { runCollecte, shouldRefreshDataset } from './collecte-run';
import { tirerHeureCollecte, registerScheduledTask, unregisterScheduledTask } from './scheduled-task';
import { relireBruts } from '../../../store/collecte';

const PRODUCT = "Observatoire Cabinets Evaluateurs d'ESSMS";
const MODE_COLLECTE = process.argv.includes('--collecte');

// Instance unique : la seconde instance quitte immédiatement — l'instance
// détentrice reçoit 'second-instance' et se charge de montrer une fenêtre.
// Le verrou Electron est dérivé du répertoire userData EFFECTIF : les
// lancements de test (--user-data-dir isolé) ne se bloquent donc ni entre
// eux ni avec une app réellement ouverte.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let engine: EngineService | null = null;
/** Archive liste-HAS/COFRAC du poste — exposée pour 'second-instance'. */
let archiveRootCourant: string | null = null;
/** Vrai une fois l'IPC enregistré : une fenêtre créée alors est fonctionnelle. */
let pretPourFenetre = false;
/** Fenêtre demandée par 'second-instance' PENDANT le démarrage : rejouée en fin de whenReady. */
let fenetreDemandee = false;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    title: PRODUCT,
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Application locale : aucune fenêtre externe, aucune navigation hors du
  // renderer embarqué (les rechargements même-URL restent permis).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  mainWindow = win;
  return win;
}

app
  .whenReady()
  .then(async () => {
    engine = new EngineService();
    const dataDir = resolveDataDir();
    await engine.load(dataDir);
    await engine.loadListeHas(resolveListeHasSeedDir(), resolveListeHasArchiveRoot(), app.getPath('userData'));

    const settings = readSettings(app.getPath('userData'));
    const archiveRoot = resolveListeHasArchiveRoot();
    archiveRootCourant = archiveRoot;

    // IPC enregistré AVANT toute bifurcation : la fenêtre créée plus tard par
    // 'second-instance' (mode --collecte devenu interactif) est fonctionnelle.
    // Enregistrer des handlers sans fenêtre est inoffensif.
    registerIpc(engine);
    pretPourFenetre = true;

    // Relecture des bruts au changement de version : rejoue les PDF archivés
    // localement avec l'analyseur de la version courante — une fois par version.
    // Best-effort : une panne de relecture n'empêche jamais le démarrage
    // (le résultat { relus, remplaces, refuses } est consigné dans l'index).
    if (app.getVersion() !== settings.derniereVersionRelue) {
      try {
        await relireBruts({ archiveRoot });
        writeSettings(app.getPath('userData'), {
          ...readSettings(app.getPath('userData')),
          derniereVersionRelue: app.getVersion(),
        });
      } catch {
        // Relecture retentée au prochain lancement (derniereVersionRelue inchangée).
      }
    }

    if (MODE_COLLECTE) {
      // Mode silencieux : collecter, puis quitter — SAUF si l'utilisateur a
      // ouvert l'app pendant la collecte (fenêtre déjà créée par
      // 'second-instance', ou demandée pendant le démarrage : rejouée ici).
      if (settings.autoUpdate && net.isOnline()) {
        await runCollecte(archiveRoot);
      }
      if (fenetreDemandee && BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
      if (BrowserWindow.getAllWindows().length === 0) {
        app.quit();
      }
      return;
    }

    const win = createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Mise à jour au lancement (désactivée en test via --no-autoupdate).
    if (!process.argv.includes('--no-autoupdate')) {
      // Mise à jour du LOGICIEL (electron-updater, releases GitHub) : démarrage
      // INDÉPENDANT du réglage autoUpdate — le vérificateur le relit à chaque
      // tick, donc l'activer/désactiver en cours de session prend effet sans
      // redémarrer l'app.
      if (app.isPackaged) void startAppUpdater(app.getPath('userData'));

      if (shouldAutoUpdate(settings, net.isOnline())) {
        // Collecte du jour (liste HAS + COFRAC) — fire and forget.
        void runCollecte(archiveRoot);
        // Refresh Synaé/FINESS seulement si l'instantané a dépassé l'âge maximal.
        if (shouldRefreshDataset(engine.getMeta().builtAt, new Date())) {
          void runAutoUpdate(engine, win, { dataDir, archiveRoot: resolveArchiveRoot() });
        }
      }
      // Re-collecte tant que l'app reste ouverte — timer INCONDITIONNEL : le
      // tick relit les réglages, donc activer autoUpdate en cours de session
      // prend effet sans redémarrage (et une app lancée hors-ligne collecte au
      // tick suivant la reconnexion). Tick HORAIRE plutôt que quotidien :
      // dejaFaitAujourdhui/inchange court-circuitent côté store
      // (au plus une collecte par jour), et le tick horaire rattrape une
      // journée qui serait perdue si un unique tick quotidien tombait hors-ligne.
      setInterval(() => {
        const s = readSettings(app.getPath('userData'));
        if (s.autoUpdate && net.isOnline()) void runCollecte(archiveRoot);
      }, 60 * 60 * 1000);
    }

    // Tâche planifiée (app fermée) : enregistrée une fois, retirée si réglage coupé.
    if (app.isPackaged && !process.argv.includes('--no-autoupdate')) {
      // Premier lancement : tirer l'heure de collecte et la PERSISTER.
      let heure = settings.collecteHeure;
      if (!heure) {
        heure = tirerHeureCollecte(app.getPath('userData'));
        writeSettings(app.getPath('userData'), { ...readSettings(app.getPath('userData')), collecteHeure: heure });
      }
      if (settings.autoUpdate && !settings.tachePlanifiee) {
        void registerScheduledTask(process.execPath, heure).then((ok) => {
          if (ok) writeSettings(app.getPath('userData'), { ...readSettings(app.getPath('userData')), tachePlanifiee: true });
        });
      }
      if (!settings.autoUpdate && settings.tachePlanifiee) {
        void unregisterScheduledTask().then(() =>
          writeSettings(app.getPath('userData'), { ...readSettings(app.getPath('userData')), tachePlanifiee: false }),
        );
      }
    }
  })
  .catch((err: unknown) => {
    // Panne fatale de démarrage : dite (jamais silencieuse), puis sortie.
    console.error('Démarrage impossible :', err);
    if (MODE_COLLECTE) {
      app.exit(1);
    } else {
      dialog.showErrorBox(PRODUCT, `Démarrage impossible : ${String(err)}`);
      app.quit();
    }
  });

// L'instance détentrice reçoit les lancements suivants. Deux cas distincts :
// tâche planifiée (--collecte) butée sur le verrou d'instance → collecter dans
// CE processus, silencieusement, sans toucher à la fenêtre de l'utilisateur ;
// lancement interactif → montrer une fenêtre.
app.on('second-instance', (_e, argv) => {
  if (argv.includes('--collecte')) {
    // Collecte planifiée silencieuse : mêmes gardes que les autres points
    // d'entrée (réglage + réseau). Si le démarrage n'est pas fini
    // (archiveRootCourant absent), la collecte de lancement de CETTE instance
    // couvre déjà le jour — et le mode survie rattrape les jours suivants.
    const root = archiveRootCourant;
    if (root) {
      const s = readSettings(app.getPath('userData'));
      if (s.autoUpdate && net.isOnline()) void runCollecte(root);
    }
    return;
  }
  if (BrowserWindow.getAllWindows().length === 0) {
    // Mode --collecte devenu interactif : devenir l'app complète. Avant la fin
    // du démarrage (IPC pas encore enregistré), la demande est mémorisée puis
    // rejouée en fin de whenReady.
    // Limite assumée (cas rare) : cette session fenêtre issue d'un processus
    // --collecte n'a ni tick horaire ni vérification du logiciel — elles
    // reviennent au prochain lancement normal.
    if (pretPourFenetre) createWindow();
    else fenetreDemandee = true;
  } else {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !MODE_COLLECTE) app.quit();
  if (MODE_COLLECTE) app.quit();
});
