import { app } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync, cpSync } from 'node:fs';

/**
 * Répertoire des données.
 * - Dev : le cœur in-repo (`data/generated`).
 * - Packagé : `resources/data/generated` est en LECTURE SEULE ; le refresh doit
 *   écrire → copie initiale dans `userData` au premier lancement.
 */
export function resolveDataDir(): string {
  if (!app.isPackaged) {
    return join(__dirname, '../../../data/generated');
  }
  const userDir = join(app.getPath('userData'), 'data', 'generated');
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
    cpSync(join(process.resourcesPath, 'data', 'generated'), userDir, { recursive: true });
  }
  return userDir;
}

export function resolveArchiveRoot(): string {
  const base = app.isPackaged
    ? join(app.getPath('userData'), 'data', 'archives')
    : join(__dirname, '../../../data/archives');
  mkdirSync(base, { recursive: true });
  return base;
}

/**
 * Amorce liste-HAS : TOUJOURS lue depuis les ressources embarquées de la
 * version courante (resourcesPath en packagé, dépôt en dev) — jamais via la
 * copie unique userData, sinon une mise à jour du logiciel n'apporterait
 * jamais son amorce plus riche.
 */
export function resolveListeHasSeedDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'data', 'generated', 'liste-has')
    : join(__dirname, '../../../data/generated/liste-has');
}

/**
 * Archive locale liste-HAS/COFRAC du poste — dérivée du userData EFFECTIF
 * dans les deux modes (dev et packagé). En dev comme en test, `--user-data-dir`
 * isole donc l'archive par lancement : les specs e2e dev restent déterministes
 * (comptes exacts sur l'amorce re-seedée à chaque launchApp).
 */
export function resolveListeHasArchiveRoot(): string {
  const base = join(app.getPath('userData'), 'liste-has');
  mkdirSync(base, { recursive: true });
  return base;
}
