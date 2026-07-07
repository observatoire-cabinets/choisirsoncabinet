import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Settings {
  alpha: 0.05 | 0.01;
  autoUpdate: boolean;
  outputDir: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  alpha: 0.05,
  autoUpdate: true,
  outputDir: null,
};

const file = (dir: string): string => join(dir, 'settings.json');

export function readSettings(dir: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(file(dir), 'utf8')) as Record<string, unknown>;
    // Défaut NON négociable : tout sauf 0,01 explicite retombe sur 0,05.
    const alpha: 0.05 | 0.01 = raw['alpha'] === 0.01 ? 0.01 : 0.05;
    return {
      alpha,
      autoUpdate: typeof raw['autoUpdate'] === 'boolean' ? raw['autoUpdate'] : true,
      outputDir: typeof raw['outputDir'] === 'string' ? raw['outputDir'] : null,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(dir: string, s: Settings): void {
  writeFileSync(file(dir), JSON.stringify(s, null, 2), 'utf8');
}
