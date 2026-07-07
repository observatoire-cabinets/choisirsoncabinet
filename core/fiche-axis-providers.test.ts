import { describe, it, expect, vi } from 'vitest';
import {
  monoMultiProvider,
  statutProvider,
  getFicheAxisProvider,
  type FicheAxisPrisma,
} from './fiche-axis-providers';
import type { RawMonoMultiExtractRow } from './mono-multi-extract';

function mockPrisma(rows: RawMonoMultiExtractRow[]): FicheAxisPrisma {
  return {
    $queryRawUnsafe: vi.fn(async () => rows) as never,
    finessEjMapping: { aggregate: vi.fn(async () => ({ _max: { snapshotDate: new Date(Date.UTC(2026, 4, 12)) } })) },
    hasEssmsOpen: { aggregate: vi.fn(async () => ({ _max: { syncedAt: new Date(Date.UTC(2026, 5, 6)) } })) },
  };
}

// N >> k pour éviter une matrice de design singulière dans l'OLS global.
function mkRow(
  cabinet: string,
  score: number,
  is_multi: boolean,
  statut: string,
): RawMonoMultiExtractRow {
  return { score, is_multi, region: 'R', statut, categ: 'C', cabinet };
}
const ST = ['Public', 'Privé commercial', 'Privé à but non lucratif'];
const ROWS: RawMonoMultiExtractRow[] = [];
for (let i = 0; i < 18; i++) {
  ROWS.push(
    mkRow(
      i < 9 ? 'A' : 'B', // 2 cabinets, chacun avec les 2 groupes
      60 + ((i * 7) % 33), // scores variés 60..92
      i % 2 === 0, // is_multi (indépendant du statut i%3)
      ST[i % 3], // statut tournant
    ),
  );
}

describe('getFicheAxisProvider', () => {
  it('mappe 1 → mono/multi, 2 → statut, 3..12 → providers (méta inclus), autres → null', () => {
    expect(getFicheAxisProvider(1)).toBe(monoMultiProvider);
    expect(getFicheAxisProvider(2)).toBe(statutProvider);
    for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(getFicheAxisProvider(n)).not.toBeNull();
    }
    expect(getFicheAxisProvider(13)).toBeNull();
  });

  it('méta-fiches 3/10/12 : buildOpts → libellés de source datés, cabinetReport → null', async () => {
    for (const n of [3, 10, 12]) {
      const p = getFicheAxisProvider(n)!;
      const opts = await p.buildOpts(mockPrisma(ROWS));
      expect(opts?.hasSourceLabel).toBe('06/06/2026');
      expect(opts?.finessSourceLabel).toBe('12/05/2026');
      expect(await p.cabinetReport(mockPrisma(ROWS))).toBeNull();
    }
  });
});

describe('provider capacité (fiche 6)', () => {
  const CAP_ROWS: RawMonoMultiExtractRow[] = [];
  for (let i = 0; i < 40; i++) {
    CAP_ROWS.push({
      score: 60 + ((i * 7) % 33),
      is_multi: i % 2 === 0,
      region: 'R',
      statut: 'Public',
      categ: 'C',
      cabinet: i < 20 ? 'A' : 'B',
      capacity: i % 3 === 0 ? 20 : i % 3 === 1 ? 60 : 150, // petit / moyen / grand
    });
  }

  it('cabinetReport → deux contrastes (moyen/grand vs petit)', async () => {
    const reports = await getFicheAxisProvider(6)!.cabinetReport(mockPrisma(CAP_ROWS));
    expect(reports).not.toBeNull();
    expect(reports!.map((r) => r.id)).toEqual(['moyen_vs_petit', 'grand_vs_petit']);
  });

  it('buildOpts → écarts nationaux par contraste + libellés de source', async () => {
    const opts = await getFicheAxisProvider(6)!.buildOpts(mockPrisma(CAP_ROWS));
    expect(opts?.nationalGaps).toHaveLength(2);
    expect(opts?.finessSourceLabel).toBe('12/05/2026');
  });
});

describe('provider DROM (fiche 11)', () => {
  const ROWS_DROM: RawMonoMultiExtractRow[] = [];
  for (let i = 0; i < 20; i++) {
    ROWS_DROM.push({
      score: 60 + ((i * 5) % 30),
      is_multi: false,
      region: 'R',
      statut: 'Public',
      categ: 'C',
      cabinet: 'A',
      departement: i % 2 === 0 ? '75' : '971',
    });
  }
  it('cabinetReport → un seul contraste DROM vs métropole', async () => {
    const reports = await getFicheAxisProvider(11)!.cabinetReport(mockPrisma(ROWS_DROM));
    expect(reports).not.toBeNull();
    expect(reports!).toHaveLength(1);
    expect(reports![0].id).toBe('drom_vs_metropole');
  });
});

describe('provider groupe lucratif (fiche 7)', () => {
  const ROWS_GL: RawMonoMultiExtractRow[] = [];
  for (let i = 0; i < 20; i++) {
    ROWS_GL.push({
      score: 70 + ((i * 5) % 25),
      is_multi: true,
      region: 'R',
      statut: 'Privé commercial',
      categ: 'C',
      cabinet: 'A',
      ej_size: i % 2 === 0 ? 80 : 1, // groupe (≥50) / indépendant (mono)
    });
  }
  it('cabinetReport → un seul contraste groupe vs indépendant', async () => {
    const reports = await getFicheAxisProvider(7)!.cabinetReport(mockPrisma(ROWS_GL));
    expect(reports).not.toBeNull();
    expect(reports!).toHaveLength(1);
    expect(reports![0].id).toBe('groupe_vs_independant');
  });
  it('buildOpts → écart national + libellés de source', async () => {
    const opts = await getFicheAxisProvider(7)!.buildOpts(mockPrisma(ROWS_GL));
    expect(opts?.nationalGaps).toHaveLength(1);
  });
});

describe('monoMultiProvider', () => {
  it('cabinetReport → un seul contraste (mono_multi)', async () => {
    const reports = await monoMultiProvider.cabinetReport(mockPrisma(ROWS));
    expect(reports).not.toBeNull();
    expect(reports!).toHaveLength(1);
    expect(reports![0].id).toBe('mono_multi');
    expect(reports![0].results.length).toBeGreaterThan(0);
  });

  it('buildOpts → stats + libellés de source datés', async () => {
    const opts = await monoMultiProvider.buildOpts(mockPrisma(ROWS));
    expect(opts?.stats?.n).toBe(18);
    expect(opts?.finessSourceLabel).toBe('12/05/2026');
    expect(opts?.hasSourceLabel).toBe('06/06/2026');
  });
});

describe('statutProvider', () => {
  it('cabinetReport → deux contrastes (vs Public)', async () => {
    const reports = await statutProvider.cabinetReport(mockPrisma(ROWS));
    expect(reports).not.toBeNull();
    expect(reports!).toHaveLength(2);
    expect(reports!.map((r) => r.id).sort()).toEqual(['commercial_vs_public', 'nonlucratif_vs_public']);
  });

  it('buildOpts → écarts nationaux par contraste', async () => {
    const opts = await statutProvider.buildOpts(mockPrisma(ROWS));
    expect(opts?.statutNational).toHaveLength(2);
  });
});
