import { app, BrowserWindow, net } from 'electron';
import { join } from 'node:path';
import { EngineService } from './engine';
import { registerIpc } from './ipc';
import { resolveDataDir, resolveArchiveRoot } from './paths';
import { readSettings } from './settings';
import { shouldAutoUpdate, runAutoUpdate } from './autoupdate';

const PRODUCT = "Observatoire Cabinets Evaluateurs d'ESSMS";

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
  return win;
}

app.whenReady().then(async () => {
  const engine = new EngineService();
  const dataDir = resolveDataDir();
  await engine.load(dataDir);
  registerIpc(engine);
  const win = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Mise à jour au lancement (désactivée en test via --no-autoupdate).
  if (!process.argv.includes('--no-autoupdate')) {
    const settings = readSettings(app.getPath('userData'));
    if (shouldAutoUpdate(settings, net.isOnline())) {
      void runAutoUpdate(engine, win, { dataDir, archiveRoot: resolveArchiveRoot() });
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
