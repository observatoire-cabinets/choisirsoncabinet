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
  ipcMain.handle('exportCabinetRanking', (_e, a: { cabinet: string; outDir: string }) =>
    engine.exportCabinetRanking(a.cabinet, a.outDir),
  );
  ipcMain.handle('refresh', () => engine.refresh(resolveDataDir(), resolveArchiveRoot()));

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
  ipcMain.handle('exportFicheCabinet', (_e, a: { cabinet: string; outDir: string; asOfMonth?: string }) =>
    engine.exportFicheCabinet(a.cabinet, a.outDir, readSettings(userData).alpha, a.asOfMonth ?? null),
  );
}
