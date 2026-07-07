import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Playwright exécute les specs en CommonJS → __dirname / require disponibles.
export const appDir = join(__dirname, '..');

// L'exécutable Electron est installé dans app/node_modules (pas à la
// racine où tourne Playwright) → on le résout explicitement.
const electronPath = require(join(appDir, 'node_modules', 'electron')) as string;

export function launchApp(): Promise<ElectronApplication> {
  // userData isolé par lancement : les réglages écrits en test ne polluent pas
  // (ni ne dépendent de) l'installation réelle.
  const userDataDir = mkdtempSync(join(tmpdir(), 'obs-ud-'));
  return electron.launch({
    // --no-autoupdate : les smoke tests ne déclenchent jamais le refresh réseau.
    args: ['.', `--user-data-dir=${userDataDir}`, '--no-autoupdate'],
    cwd: appDir,
    executablePath: electronPath,
  });
}
