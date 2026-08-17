/**
 * Rafraîchissement des DONNÉES publiques (Synaé/FINESS) — la mise à jour du
 * LOGICIEL est dans app-update.ts.
 */
import type { BrowserWindow } from 'electron';
import type { EngineService } from './engine';

/** Rafraîchissement des données seulement si le réglage est actif ET une connexion est disponible. */
export function shouldAutoUpdate(s: { autoUpdate: boolean }, online: boolean): boolean {
  return s.autoUpdate && online;
}

/**
 * Rafraîchit les données publiques en arrière-plan et pousse la progression au
 * renderer. TOUJOURS sans échec bloquant : en cas d'erreur réseau, l'application
 * conserve les données embarquées et reste pleinement fonctionnelle hors-ligne.
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
    const warn =
      (r.finessFreshness as { warning?: string | null } | undefined)?.warning ??
      (r.capacityFreshness as { warning?: string | null } | undefined)?.warning ??
      null;
    send(warn ? `Données à jour — avertissement : ${warn}` : 'Données à jour.');
  } catch {
    send('Mise à jour indisponible — données embarquées conservées.');
  }
}
