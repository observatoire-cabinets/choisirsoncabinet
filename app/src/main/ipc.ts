import { ipcMain, dialog, app, net, BrowserWindow } from 'electron';
import type { EngineService, GenerateArgs } from './engine';
import { readSettings, writeSettings, type Settings } from './settings';
import { resolveArchiveRoot, resolveDataDir, resolveListeHasArchiveRoot } from './paths';
import { tirerHeureCollecte, registerScheduledTask, unregisterScheduledTask } from './scheduled-task';
import { getAppUpdateState, relancerVerificationLogiciel } from './app-update';
import { miseAJourDonnees, volUnique } from './autoupdate';
import { runCollecte } from './collecte-run';

/** Message vers toutes les fenêtres ouvertes (une fenêtre fermée entre-temps est ignorée). */
function diffuser(canal: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(canal, ...args);
  }
}

// File de bascules tâche-planifiée : Register/Unregister-ScheduledTask durent
// plusieurs secondes (PowerShell) — deux bascules rapprochées (ex. OFF puis ON
// en moins d'une seconde) ne doivent JAMAIS s'exécuter en parallèle : sinon
// le résultat est indéterministe (la tâche peut finir désinscrite alors que
// tachePlanifiee reste à true — un flag menteur jamais auto-réparé, car le
// démarrage n'enregistre que si la tâche n'est pas déjà marquée enregistrée
// pour l'exécutable courant). Chaque maillon relit l'état
// AU MOMENT DE SON EXÉCUTION (pas au moment de l'enfilage) : une bascule
// devenue obsolète (dépassée par une plus récente) est un no-op.
let chaineBascule: Promise<void> = Promise.resolve();

async function basculerTachePlanifiee(userData: string, souhaite: boolean): Promise<void> {
  const actuel = readSettings(userData);
  if (actuel.autoUpdate !== souhaite) return; // dépassée : la bascule suivante en file porte l'état voulu
  if (souhaite) {
    // collecteHeure persistée = source de vérité ; tirée ici si absente.
    let heure = actuel.collecteHeure;
    if (!heure) {
      heure = tirerHeureCollecte(userData);
      writeSettings(userData, { ...readSettings(userData), collecteHeure: heure });
    }
    const ok = await registerScheduledTask(process.execPath, heure);
    writeSettings(userData, { ...readSettings(userData), tachePlanifiee: ok, tacheExe: ok ? process.execPath : null });
  } else {
    await unregisterScheduledTask();
    writeSettings(userData, { ...readSettings(userData), tachePlanifiee: false, tacheExe: null });
  }
}

export function registerIpc(engine: EngineService): void {
  const userData = app.getPath('userData');

  ipcMain.handle('getMeta', () => engine.getMeta());
  ipcMain.handle('fiches', () => engine.fiches());
  ipcMain.handle('listCabinets', () => engine.listCabinets());
  ipcMain.handle('cabinetDetail', (_e, cabinet: string) => engine.cabinetDetail(cabinet));
  ipcMain.handle('registry', () => engine.registry());

  ipcMain.handle('getSettings', () => readSettings(userData));
  ipcMain.handle('setSettings', async (_e, s: Settings) => {
    // Ne persiste que les champs éditables par l'écran Réglages : tachePlanifiee/
    // collecteHeure sont pilotés par le main, jamais écrasés par un snapshot du
    // renderer potentiellement périmé (ex. un register de démarrage abouti après
    // l'ouverture de l'écran ne doit pas être effacé par la sauvegarde suivante).
    const avant = readSettings(userData);
    writeSettings(userData, { ...avant, alpha: s.alpha, autoUpdate: s.autoUpdate, outputDir: s.outputDir });

    // L'état de la mise à jour du logiciel suit la bascule sans attendre le tick
    // de 24 h (sans effet si l'updater n'est pas démarré, dont la version portable).
    if (avant.autoUpdate !== s.autoUpdate) relancerVerificationLogiciel();

    if (app.isPackaged && avant.autoUpdate !== s.autoUpdate) {
      const souhaite = s.autoUpdate;
      chaineBascule = chaineBascule.then(() => basculerTachePlanifiee(userData, souhaite)).catch(() => {});
      await chaineBascule;
    }
  });

  ipcMain.handle('pickOutputDir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('generateFiches', (_e, a: GenerateArgs) => engine.generateFiches(a));
  ipcMain.handle('exportCabinetRanking', (_e, a: { cabinet: string; outDir: string }) =>
    engine.exportCabinetRanking(a.cabinet, a.outDir),
  );
  ipcMain.handle('refresh', () => engine.refresh(resolveDataDir(), resolveArchiveRoot()));

  // Bandeau des dates : relu par le renderer après tout rafraîchissement réussi.
  engine.onDonneesRechargees(() => diffuser('donnees:rechargees'));

  // Mise à jour manuelle (Réglages), indépendante du réglage autoUpdate, à vol
  // unique : une seconde demande (ou un écran rouvert) attend la même issue.
  const miseAJour = volUnique(() =>
    miseAJourDonnees({
      enLigne: () => net.isOnline(),
      collecter: () => runCollecte(resolveListeHasArchiveRoot()),
      rafraichir: () => engine.refresh(resolveDataDir(), resolveArchiveRoot()),
      progression: (msg) => diffuser('refresh:progress', msg),
    }),
  );
  ipcMain.handle('miseAJourDonnees', () => miseAJour.demarrer());
  ipcMain.handle('miseAJourDonneesEnCours', () => miseAJour.enCours());
  ipcMain.handle('rejoindreMiseAJourDonnees', () => miseAJour.rejoindre());

  ipcMain.handle('cotationGeneralView', () => engine.cotationGeneralView());
  ipcMain.handle('cotationCabinetProfile', (_e, cabinet: string) => engine.cotationCabinetProfile(cabinet));
  ipcMain.handle('exportCotationsGeneral', (_e, a: { outDir: string; format: 'csv' | 'pdf' }) =>
    engine.exportCotationsGeneral(a.outDir, a.format),
  );
  ipcMain.handle('exportCotationCabinet', (_e, a: { cabinet: string; outDir: string; format: 'csv' | 'pdf' }) =>
    engine.exportCotationCabinet(a.cabinet, a.outDir, a.format),
  );

  ipcMain.handle('ficheCabinet', (_e, cabinet: string) =>
    engine.ficheCabinet(cabinet, readSettings(userData).alpha),
  );
  ipcMain.handle('ficheCabinetHistory', (_e, cabinet: string) => engine.ficheCabinetHistory(cabinet));
  ipcMain.handle('positioningHistory', (_e, cabinet: string) => {
    const alpha = readSettings(userData).alpha;
    engine.warmPositioningHistory(alpha);
    return engine.positioningHistory(cabinet, alpha);
  });
  ipcMain.handle('exportFicheCabinet', (_e, a: { cabinet: string; outDir: string; asOfMonth?: string }) =>
    engine.exportFicheCabinet(a.cabinet, a.outDir, readSettings(userData).alpha, a.asOfMonth ?? null),
  );

  ipcMain.handle('accreditations', () => engine.accreditations());
  ipcMain.handle(
    'exportAccreditations',
    (_e, a: { volet: 'statuts' | 'chronologie' | 'sorties' | 'synthese'; outDir: string; format: 'csv' | 'pdf' }) =>
      engine.exportAccreditations(a.volet, a.outDir, a.format),
  );

  ipcMain.handle('appUpdateState', () => getAppUpdateState());
}
