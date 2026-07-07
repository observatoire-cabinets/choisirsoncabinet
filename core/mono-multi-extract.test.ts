import { describe, it, expect, vi } from 'vitest';
import {
  mapExtractedRow,
  extractMonoMultiRows,
  analyzeMonoMultiFromProd,
  extractCabinetAxisRows,
  analyzeMonoMultiByCabinetFromProd,
  analyzeStatutByCabinetFromProd,
  STATUT_CONTRASTS,
  MONO_MULTI_EXTRACT_SQL,
  MONO_MULTI_EXTRACT_SQL_LEGACY_MAX,
  type MonoMultiExtractPrisma,
  type RawMonoMultiExtractRow,
} from './mono-multi-extract';

describe('MONO_MULTI_EXTRACT_SQL — colonnes élargies pour les axes catégoriels', () => {
  it('expose code catégorie, département, date de clôture et capacité (LEFT JOIN)', () => {
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/essms_categ_finess_code/);
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/departement_code/);
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/eval_date_cloture_tech/);
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/finess_capacity/i);
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/LEFT JOIN/i);
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/AS\s+ej_size/i); // taille réelle de l'EJ (fiche 7)
  });

  it('utilise un join as-of corrélé (LATERAL <= eval_date_cloture_tech), sans MAX global', () => {
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/JOIN LATERAL/i);
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/LEFT JOIN LATERAL/i);
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/snapshot_date <= e\.eval_date_cloture_tech::date/i);
    // repli NULL / avant-historique = plus ancien snapshot (ordre final ASC) :
    expect(MONO_MULTI_EXTRACT_SQL).toMatch(/snapshot_date ASC/i);
    // le snapshot courant figé pour tous a disparu de la constante as-of…
    expect(MONO_MULTI_EXTRACT_SQL).not.toMatch(/=\s*\(SELECT MAX\(snapshot_date\)/i);
    // …mais reste dans la constante legacy (garde anti-copier-coller du négatif sur la mauvaise cible) :
    expect(MONO_MULTI_EXTRACT_SQL_LEGACY_MAX).toMatch(/SELECT MAX\(snapshot_date\)/i);
  });

  it('préserve le lpad côté HAS (e.finess_geo) sur les deux joins', () => {
    const m = MONO_MULTI_EXTRACT_SQL.match(/lpad\(e\.finess_geo, 9, '0'\)/g) ?? [];
    expect(m.length).toBeGreaterThanOrEqual(2);
  });
});

describe('mapExtractedRow', () => {
  it('coerces a string score to a number', () => {
    const r = mapExtractedRow({ score: '81.93', is_multi: true, region: 'R', statut: 'S', categ: 'C' });
    expect(r.score).toBeCloseTo(81.93, 5);
  });

  it.each([
    [true, true],
    ['t', true],
    [1, true],
    [false, false],
    ['f', false],
    [0, false],
  ])('coerces is_multi %s → %s', (input, expected) => {
    const r = mapExtractedRow({ score: 1, is_multi: input as never, region: 'R', statut: 'S', categ: 'C' });
    expect(r.isMulti).toBe(expected);
  });

  it('maps null region/statut/categ to an empty-string level', () => {
    const r = mapExtractedRow({ score: 1, is_multi: false, region: null, statut: null, categ: null });
    expect(r.region).toBe('');
    expect(r.statut).toBe('');
    expect(r.categ).toBe('');
  });
});

function mockPrisma(rows: RawMonoMultiExtractRow[]) {
  const queryRawUnsafe = vi.fn(async () => rows);
  const prisma: MonoMultiExtractPrisma = { $queryRawUnsafe: queryRawUnsafe as never };
  return { prisma, queryRawUnsafe };
}

describe('extractMonoMultiRows', () => {
  it('runs the extraction SQL and maps every row to a MonoMultiRow', async () => {
    const { prisma, queryRawUnsafe } = mockPrisma([
      { score: '76.0', is_multi: false, region: 'IDF', statut: 'Public', categ: 'EHPAD' },
      { score: 81, is_multi: true, region: 'IDF', statut: 'Public', categ: 'EHPAD' },
    ]);
    const rows = await extractMonoMultiRows(prisma);
    expect(queryRawUnsafe).toHaveBeenCalledWith(MONO_MULTI_EXTRACT_SQL);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ score: 76, isMulti: false, region: 'IDF', statut: 'Public', categ: 'EHPAD' });
    expect(rows[1].isMulti).toBe(true);
  });

  it('throws when the mapping is empty (no FINESS snapshot loaded)', async () => {
    const { prisma } = mockPrisma([]);
    await expect(extractMonoMultiRows(prisma)).rejects.toThrow(/empty|snapshot|finess/i);
  });
});

describe('extractCabinetAxisRows', () => {
  it('mappe les lignes en CabinetAxisRow (cabinet = oe_nom, exposed = is_multi)', async () => {
    const { prisma } = mockPrisma([
      { score: 76, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'CAB-EX' },
      { score: 81, is_multi: true, region: 'R', statut: 'S', categ: 'C', cabinet: 'CAB-EX' },
    ]);
    const rows = await extractCabinetAxisRows(prisma);
    expect(rows).toEqual([
      { cabinet: 'CAB-EX', score: 76, exposed: false },
      { cabinet: 'CAB-EX', score: 81, exposed: true },
    ]);
  });

  it('exclut les lignes sans cabinet (oe_nom nul)', async () => {
    const { prisma } = mockPrisma([
      { score: 76, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: null },
      { score: 81, is_multi: true, region: 'R', statut: 'S', categ: 'C', cabinet: 'X' },
    ]);
    const rows = await extractCabinetAxisRows(prisma);
    expect(rows).toHaveLength(1);
    expect(rows[0].cabinet).toBe('X');
  });
});

describe('analyzeMonoMultiByCabinetFromProd', () => {
  it('classe les cabinets et calcule Δ vs national (gap national des données)', async () => {
    const { prisma } = mockPrisma([
      // national gap brut = mean_multi - mean_mono sur l'ensemble
      { score: 10, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A' },
      { score: 12, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A' },
      { score: 14, is_multi: true, region: 'R', statut: 'S', categ: 'C', cabinet: 'A' },
      { score: 16, is_multi: true, region: 'R', statut: 'S', categ: 'C', cabinet: 'A' },
      { score: 20, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'B' },
      { score: 30, is_multi: true, region: 'R', statut: 'S', categ: 'C', cabinet: 'B' },
      { score: 40, is_multi: true, region: 'R', statut: 'S', categ: 'C', cabinet: 'B' },
    ]);
    const res = await analyzeMonoMultiByCabinetFromProd(prisma);
    expect(res[0].cabinet).toBe('B'); // plus grand écart
    expect(res.find((r) => r.cabinet === 'A')!.gap).toBeCloseTo(4, 6);
    // Δ vs national : national gap brut calculé sur l'ensemble (non nul)
    expect(res.find((r) => r.cabinet === 'A')!.deltaVsNational).not.toBeNull();
  });
});

describe('analyzeStatutByCabinetFromProd (axe catégoriel via contrastes)', () => {
  it('produit un rapport par contraste (vs Public) avec classement par cabinet', async () => {
    const { prisma } = mockPrisma([
      { score: 70, is_multi: false, region: 'R', statut: 'Public', categ: 'C', cabinet: 'A' },
      { score: 84, is_multi: false, region: 'R', statut: 'Privé commercial', categ: 'C', cabinet: 'A' },
      { score: 60, is_multi: false, region: 'R', statut: 'Public', categ: 'C', cabinet: 'B' },
      { score: 90, is_multi: false, region: 'R', statut: 'Privé à but non lucratif', categ: 'C', cabinet: 'B' },
    ]);
    const reports = await analyzeStatutByCabinetFromProd(prisma);
    expect(reports).toHaveLength(STATUT_CONTRASTS.length); // 2 contrastes
    const commercial = reports.find((r) => r.contrast.id === 'commercial_vs_public')!;
    const a = commercial.results.find((r) => r.cabinet === 'A')!;
    expect(a.gap).toBeCloseTo(14, 6); // 84 - 70
  });
});

describe('analyzeMonoMultiFromProd', () => {
  it('extracts then runs the OLS analysis (synthetic: β == raw gap)', async () => {
    const { prisma } = mockPrisma([
      { score: 10, is_multi: false, region: 'R', statut: 'S', categ: 'C' },
      { score: 12, is_multi: false, region: 'R', statut: 'S', categ: 'C' },
      { score: 14, is_multi: true, region: 'R', statut: 'S', categ: 'C' },
      { score: 16, is_multi: true, region: 'R', statut: 'S', categ: 'C' },
    ]);
    const res = await analyzeMonoMultiFromProd(prisma);
    expect(res.n).toBe(4);
    expect(res.nMono).toBe(2);
    expect(res.nMulti).toBe(2);
    expect(res.betaAdj).toBeCloseTo(4, 5);
  });
});
