import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Dataset } from './types';

const pad9 = (s: string) => s.padStart(9, '0');

async function readJson<T>(dir: string, name: string): Promise<T> {
  const p = join(dir, name);
  try {
    return JSON.parse(await readFile(p, 'utf8')) as T;
  } catch (e) {
    throw new Error(`Dataset: fichier introuvable ou invalide: ${p} (${(e as Error).message})`);
  }
}

export async function loadDataset(dir: string): Promise<Dataset> {
  const [meta, essms, ejSnapshots, capacitySnapshots, baseDoc, evalHistory] = await Promise.all([
    readJson<Dataset['meta']>(dir, 'meta.json'),
    readJson<Dataset['essms']>(dir, 'essms.json'),
    readJson<Dataset['ejSnapshots']>(dir, 'ej-snapshots.json'),
    readJson<Dataset['capacitySnapshots']>(dir, 'capacity-snapshots.json'),
    readJson<Dataset['baseDoc']>(dir, 'base-doc.json'),
    readJson<Dataset['evalHistory']>(dir, 'eval-history.json'),
  ]);
  // Frontière de confiance : datasets générés par l'outillage du dépôt (export/refresh) — un fichier de mauvaise forme échoue bruyamment ici, sans le wrapper de chemin (YAGNI assumé).
  for (const r of essms) r.finessGeo = pad9(r.finessGeo);
  for (const r of ejSnapshots) r.finessGeo = pad9(r.finessGeo);
  for (const r of capacitySnapshots) r.finessGeo = pad9(r.finessGeo);
  for (const r of baseDoc) r.finessGeo = pad9(r.finessGeo);
  return { meta, essms, ejSnapshots, capacitySnapshots, baseDoc, evalHistory };
}
