import { ipcMain, dialog, app } from 'electron';
import type { EngineService, GenerateArgs } from './engine';
import { readSettings, writeSettings, type Settings } from './settings';
import { resolveArchiveRoot, resolveDataDir } from './paths';

export function registerIpc(engine: EngineService): void {
  const userData = app.getPath('userData');

  ipcMain.handle('getMeta', () => engine.getMeta());
  ipcMain.handle('fiches', () => engine.fiches());
  ipcMain.handle('listCabinets', () => engine.listCabinets());
  ipcMain.handle('cabinetDetail', (_e, cabinet: string) => engine.cabinetDetail(cabinet));
  ipcMain.handle('registry', () => engine.registry());

  ipcMain.handle('getSettings', () => readSettings(userData));
  ipcMain.handle('setSettings', (_e, s: Settings) => writeSettings(userData, s));

  ipcMain.handle('pickOutputDir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('generateFiches', (_e, a: GenerateArgs) => engine.generateFiches(a));
  ipcMain.handle('refresh', () => engine.refresh(resolveDataDir(), resolveArchiveRoot()));
}
