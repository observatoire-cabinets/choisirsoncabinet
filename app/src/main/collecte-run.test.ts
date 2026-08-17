import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shouldRefreshDataset, REFRESH_MAX_AGE_JOURS, runCollecte } from './collecte-run';
import { ensureArchive, acquireLock } from '../../../store/liste-has-archive';

describe('shouldRefreshDataset', () => {
  it("instantané plus vieux que 30 jours → refresh", () => {
    expect(shouldRefreshDataset('2026-07-01T10:00:00.000Z', new Date('2026-08-17T10:00:00Z'))).toBe(true);
  });
  it('instantané récent → pas de refresh', () => {
    expect(shouldRefreshDataset('2026-08-01T10:00:00.000Z', new Date('2026-08-17T10:00:00Z'))).toBe(false);
  });
  it('builtAt illisible → refresh (prudence)', () => {
    expect(shouldRefreshDataset('n/a', new Date('2026-08-17T10:00:00Z'))).toBe(true);
  });
  it(`seuil exact : ${REFRESH_MAX_AGE_JOURS} jours`, () => {
    expect(REFRESH_MAX_AGE_JOURS).toBe(30);
  });
});

describe('runCollecte', () => {
  it("archiveRoot impossible (chemin = fichier existant) → { echec, echec } sans rejet", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'obs-cr-'));
    const fichier = join(dir, 'pas-un-dossier');
    await writeFile(fichier, 'x', 'utf8');
    // ensureArchive (mkdir sous un fichier) tombe en panne : « jamais de throw ».
    await expect(runCollecte(fichier)).resolves.toEqual({ liste: 'echec', cofrac: 'echec' });
  });

  it("verrou déjà détenu → 'skipped' (aucune collecte, verrou du détenteur intact)", async () => {
    const root = await mkdtemp(join(tmpdir(), 'obs-cr-'));
    await ensureArchive(root);
    expect(await acquireLock(root)).toBe(true);
    await expect(runCollecte(root)).resolves.toBe('skipped');
  });
});
