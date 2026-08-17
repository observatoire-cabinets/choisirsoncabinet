import { contextBridge, ipcRenderer } from 'electron';
import type { ObsApi } from './api';

const api: ObsApi = {
  getMeta: () => ipcRenderer.invoke('getMeta'),
  fiches: () => ipcRenderer.invoke('fiches'),
  listCabinets: () => ipcRenderer.invoke('listCabinets'),
  cabinetDetail: (cabinet) => ipcRenderer.invoke('cabinetDetail', cabinet),
  registry: () => ipcRenderer.invoke('registry'),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  setSettings: (s) => ipcRenderer.invoke('setSettings', s),
  pickOutputDir: () => ipcRenderer.invoke('pickOutputDir'),
  generateFiches: (a) => ipcRenderer.invoke('generateFiches', a),
  exportCabinetRanking: (cabinet, outDir) => ipcRenderer.invoke('exportCabinetRanking', { cabinet, outDir }),
  refresh: () => ipcRenderer.invoke('refresh'),
  cotationGeneralView: () => ipcRenderer.invoke('cotationGeneralView'),
  cotationCabinetProfile: (cabinet) => ipcRenderer.invoke('cotationCabinetProfile', cabinet),
  exportCotationsGeneral: (outDir, format) => ipcRenderer.invoke('exportCotationsGeneral', { outDir, format }),
  exportCotationCabinet: (cabinet, outDir, format) =>
    ipcRenderer.invoke('exportCotationCabinet', { cabinet, outDir, format }),
  ficheCabinet: (cabinet) => ipcRenderer.invoke('ficheCabinet', cabinet),
  ficheCabinetHistory: (cabinet) => ipcRenderer.invoke('ficheCabinetHistory', cabinet),
  exportFicheCabinet: (cabinet, outDir, asOfMonth) =>
    ipcRenderer.invoke('exportFicheCabinet', { cabinet, outDir, asOfMonth }),
  accreditations: () => ipcRenderer.invoke('accreditations'),
  exportAccreditations: (volet, outDir, format) =>
    ipcRenderer.invoke('exportAccreditations', { volet, outDir, format }),
  appUpdateState: () => ipcRenderer.invoke('appUpdateState'),
  onRefreshProgress: (cb) => {
    ipcRenderer.on('refresh:progress', (_e, msg: string) => cb(msg));
  },
};

contextBridge.exposeInMainWorld('api', api);
