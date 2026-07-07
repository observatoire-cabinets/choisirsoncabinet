import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataset } from './load';
import { extractRows } from './extract';
import { makeStoreProxy } from './proxy';
import { MONO_MULTI_EXTRACT_SQL } from '../core/mono-multi-extract';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '__fixtures__', 'mini-dataset');

describe('extractRows (as-of en mémoire, parité MONO_MULTI_EXTRACT_SQL)', () => {
  it('reproduit la forme de ligne SQL et exclut les scores null (WHERE)', async () => {
    const ds = await loadDataset(FIX);
    const rows = extractRows(ds);
    // 13 essms − 1 sans score (WHERE) − 1 sans mapping EJ (INNER JOIN) − 7 CAB_DETAIL sans mapping = 4.
    expect(rows).toHaveLength(4);
    const r = rows[0];
    expect(r).toHaveProperty('score');
    expect(r).toHaveProperty('is_multi');
    expect(r).toHaveProperty('ej_size');
    expect(r).toHaveProperty('cabinet');
    expect(r).toHaveProperty('capacity');
    expect(r).toHaveProperty('eval_date');
    // FOYER LES ERABLES (CAB BETA) A un mapping EJ : son absence prouve le WHERE score null.
    expect(rows.some((x) => x.cabinet === 'CAB BETA')).toBe(false);
  });

  it('INNER JOIN : une ligne scorée SANS mapping EJ est éliminée', async () => {
    const ds = await loadDataset(FIX);
    const rows = extractRows(ds);
    // MAS SAINT-EXUPERY : score 81.2 non-null mais aucun snapshot finess_ej_mapping.
    expect(rows.some((x) => x.cabinet === 'CAB_SANS_MAPPING')).toBe(false);
  });

  it('as-of : choisit le dernier snapshot <= clôture, sinon le plus ancien', async () => {
    const ds = await loadDataset(FIX);
    const rows = extractRows(ds);
    // CAB_ASOF : clôture 2024-06-01, snapshots 2023-12-31 (ejSize 3) et 2024-12-31 (ejSize 1)
    // → 2023-12-31 retenu (dernier <= clôture), pas 2024-12-31.
    const a = rows.find((x) => x.cabinet === 'CAB_ASOF')!;
    expect(a.ej_size).toBe(3);
    // Ligne complète : COALESCE('') sur les libellés, Date pour eval_date,
    // capacité null (LEFT JOIN sans snapshot capacité), is_multi = ej_size >= 2.
    expect(a).toEqual({
      score: 64.5,
      is_multi: true,
      ej_size: 3,
      region: 'Normandie',
      statut: 'Public',
      categ: 'EHPAD',
      code: '500',
      departement: '14',
      eval_date: new Date('2024-06-01'),
      capacity: null,
      cabinet: 'CAB_ASOF',
    });
  });

  it('as-of repli : clôture ANTÉRIEURE à tous les snapshots → le plus ANCIEN', async () => {
    const ds = await loadDataset(FIX);
    const rows = extractRows(ds);
    // CAB_FALLBACK : clôture 2022-01-15, snapshots 2023-12-31 (ejSize 2, cap 30)
    // et 2024-12-31 (ejSize 7, cap 60) → repli sur le plus ancien pour EJ ET capacité.
    const f = rows.find((x) => x.cabinet === 'CAB_FALLBACK')!;
    expect(f.ej_size).toBe(2);
    expect(f.is_multi).toBe(true); // frontière exacte : ej_size >= 2
    expect(f.capacity).toBe(30);
  });

  it('is_multi : ej_size 1 → false (mono)', async () => {
    const ds = await loadDataset(FIX);
    const rows = extractRows(ds);
    const parc = rows.find((x) => x.cabinet === 'CAB ALPHA' && x.statut === 'Public')!;
    expect(parc.ej_size).toBe(1);
    expect(parc.is_multi).toBe(false);
  });
});

describe('makeStoreProxy (prisma-compatible sur Dataset mémoire)', () => {
  it('$queryRawUnsafe(MONO_MULTI_EXTRACT_SQL) → mêmes lignes que extractRows', async () => {
    const ds = await loadDataset(FIX);
    const proxy = makeStoreProxy(ds);
    const viaProxy = await proxy.$queryRawUnsafe(MONO_MULTI_EXTRACT_SQL);
    expect(viaProxy).toEqual(extractRows(ds));
  });

  it('$queryRawUnsafe échoue bruyamment sur toute autre requête', async () => {
    const ds = await loadDataset(FIX);
    const proxy = makeStoreProxy(ds);
    await expect(proxy.$queryRawUnsafe('SELECT 1')).rejects.toThrow(/MONO_MULTI_EXTRACT_SQL/);
  });

  it('aggregates de dates pour les libellés de source', async () => {
    const ds = await loadDataset(FIX);
    const proxy = makeStoreProxy(ds);
    const m = await proxy.finessEjMapping.aggregate({ _max: { snapshotDate: true } });
    expect(m._max.snapshotDate).toBeInstanceOf(Date);
    expect(m._max.snapshotDate).toEqual(new Date('2026-06-01'));
    const h = await proxy.hasEssmsOpen.aggregate({ _max: { syncedAt: true } });
    expect(h._max.syncedAt).toEqual(new Date('2026-06-30T00:00:00.000Z'));
  });
});
