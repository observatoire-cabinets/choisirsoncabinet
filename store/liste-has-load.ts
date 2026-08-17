/** Chargement de l'amorce liste-HAS embarquée (5 JSON, tolérant à l'absence). */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ListeHasSeed } from './liste-has-types';

async function readJsonOr<T>(dir: string, name: string, dflt: T): Promise<T> {
  try {
    return JSON.parse(await readFile(join(dir, name), 'utf8')) as T;
  } catch {
    return dflt;
  }
}

export async function loadListeHasSeed(dir: string): Promise<ListeHasSeed> {
  const [etats, bilans, faits, pistes, alias] = await Promise.all([
    readJsonOr(dir, 'etats.json', []),
    readJsonOr(dir, 'bilans.json', []),
    readJsonOr(dir, 'faits.json', []),
    readJsonOr(dir, 'pistes.json', []),
    readJsonOr(dir, 'alias.json', []),
  ]);
  return { etats, bilans, faits, pistes, alias } as ListeHasSeed;
}
