import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Settings {
  alpha: 0.05 | 0.01;
  autoUpdate: boolean;
  outputDir: string | null;
  /** Heure de collecte : SOURCE DE VÉRITÉ persistée — tirée une fois au premier lancement packagé (graine stable du poste), relue partout (tâche planifiée, affichage « prochaine collecte »). */
  collecteHeure: { heure: number; minute: number } | null;
  /** true quand la tâche planifiée a été enregistrée avec succès. */
  tachePlanifiee: boolean;
  /** Dernière version de l'application ayant relu les bruts archivés (null : jamais relu). */
  derniereVersionRelue: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  alpha: 0.05,
  autoUpdate: true,
  outputDir: null,
  collecteHeure: null,
  tachePlanifiee: false,
  derniereVersionRelue: null,
};

const file = (dir: string): string => join(dir, 'settings.json');

/** Forme attendue de collecteHeure : entiers dans les bornes horaires. */
function asCollecteHeure(v: unknown): { heure: number; minute: number } | null {
  if (typeof v !== 'object' || v === null) return null;
  const { heure, minute } = v as { heure?: unknown; minute?: unknown };
  if (!Number.isInteger(heure) || !Number.isInteger(minute)) return null;
  const h = heure as number;
  const m = minute as number;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { heure: h, minute: m };
}

export function readSettings(dir: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(file(dir), 'utf8')) as Record<string, unknown>;
    // Défaut NON négociable : tout sauf 0,01 explicite retombe sur 0,05.
    const alpha: 0.05 | 0.01 = raw['alpha'] === 0.01 ? 0.01 : 0.05;
    return {
      alpha,
      autoUpdate: typeof raw['autoUpdate'] === 'boolean' ? raw['autoUpdate'] : true,
      outputDir: typeof raw['outputDir'] === 'string' ? raw['outputDir'] : null,
      // Champs requis de planification : forme invalide → défaut (null / false),
      // jamais un throw — la relecture n'est jamais destructrice pour le reste.
      collecteHeure: asCollecteHeure(raw['collecteHeure']),
      tachePlanifiee: typeof raw['tachePlanifiee'] === 'boolean' ? raw['tachePlanifiee'] : false,
      derniereVersionRelue:
        typeof raw['derniereVersionRelue'] === 'string' && raw['derniereVersionRelue'] !== ''
          ? raw['derniereVersionRelue']
          : null,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(dir: string, s: Settings): void {
  writeFileSync(file(dir), JSON.stringify(s, null, 2), 'utf8');
}
