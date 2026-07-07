import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataset } from './load';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '__fixtures__', 'mini-dataset');

describe('loadDataset', () => {
  it('charge les 6 fichiers et indexe par finessGeo paddé', async () => {
    const ds = await loadDataset(FIX);
    // 6 lignes historiques + 7 lignes CAB_DETAIL (sans mapping EJ — cf. cabinet-detail.test.ts).
    expect(ds.essms).toHaveLength(13);
    expect(ds.meta.sources.length).toBeGreaterThanOrEqual(3);
    expect(ds.ejSnapshots.every((r) => r.finessGeo.length === 9)).toBe(true);
    // Preuve réelle du padding : cette ligne est écrite "98765432" (8 chars) dans la fixture.
    expect(ds.essms.find((r) => r.raisonSociale === 'FOYER LES ERABLES')!.finessGeo).toBe('098765432');
  });

  it('échoue clairement si un fichier manque', async () => {
    await expect(loadDataset(join(FIX, '..', 'absent'))).rejects.toThrow(/introuvable|ENOENT/i);
  });
});
