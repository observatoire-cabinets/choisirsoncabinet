import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeMonoMulti, type MonoMultiRow } from './mono-multi-analysis';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('analyzeMonoMulti — unités synthétiques', () => {
  it('sans contrôle variable, β ajusté == écart brut', () => {
    // région/statut/catég à un seul niveau → éliminés du design → [1, isMulti]
    const rows: MonoMultiRow[] = [
      { score: 10, isMulti: false, region: 'R', statut: 'S', categ: 'C' },
      { score: 12, isMulti: false, region: 'R', statut: 'S', categ: 'C' },
      { score: 14, isMulti: true, region: 'R', statut: 'S', categ: 'C' },
      { score: 16, isMulti: true, region: 'R', statut: 'S', categ: 'C' },
    ];
    const r = analyzeMonoMulti(rows);
    expect(r.n).toBe(4);
    expect(r.nMono).toBe(2);
    expect(r.nMulti).toBe(2);
    expect(r.meanMono).toBeCloseTo(11, 6);
    expect(r.meanMulti).toBeCloseTo(15, 6);
    expect(r.gapRaw).toBeCloseTo(4, 6);
    expect(r.betaAdj).toBeCloseTo(4, 5);
    expect(r.sdMono).toBeCloseTo(Math.SQRT2, 6); // sd([10,12]) = √2
    expect(r.sdMulti).toBeCloseTo(Math.SQRT2, 6); // sd([14,16]) = √2
  });

  it('écart-type d’échantillon (ddof=1), NaN si un groupe a moins de 2 obs', () => {
    const rows: MonoMultiRow[] = [
      { score: 50, isMulti: false, region: 'R', statut: 'S', categ: 'C' },
      { score: 60, isMulti: true, region: 'R', statut: 'S', categ: 'C' },
      { score: 70, isMulti: true, region: 'R', statut: 'S', categ: 'C' },
    ];
    const r = analyzeMonoMulti(rows);
    expect(r.nMono).toBe(1);
    expect(Number.isNaN(r.sdMono)).toBe(true); // un seul mono → non calculable
    expect(r.sdMulti).toBeCloseTo(Math.sqrt(50), 6); // sd([60,70]) = √50
  });
});

describe('analyzeMonoMulti — GOLDEN sur données HAS réelles', () => {
  // Fixture = dataset exact de l'analyse V1.0 (HAS Synaé 19/05/2026, ODbL).
  // Le moteur TS DOIT reproduire les résultats Python/statsmodels.
  const csv = readFileSync(join(HERE, '__fixtures__', 'mono-multi-sample.csv'), 'utf8')
    .trim()
    .split(/\r?\n/);
  csv.shift(); // header: y,is_multi,region_id,statut_id,categ_id
  const rows: MonoMultiRow[] = csv.map((l) => {
    const [y, isMulti, region, statut, categ] = l.split(',');
    return {
      score: Number(y),
      isMulti: isMulti === '1',
      region: `r${region}`,
      statut: `s${statut}`,
      categ: `c${categ}`,
    };
  });
  const r = analyzeMonoMulti(rows, 0.95);

  it('descriptif reproduit la note (N, moyennes, écart brut)', () => {
    expect(r.n).toBe(18795);
    expect(r.nMono).toBe(3214);
    expect(r.nMulti).toBe(15581);
    expect(r.meanMono).toBeCloseTo(76.16, 1);
    expect(r.meanMulti).toBeCloseTo(81.41, 1);
    expect(r.gapRaw).toBeCloseTo(5.25, 1);
    expect(r.sdMono).toBeCloseTo(18.22, 1); // dispersion intra-groupe (recalcul à la main)
    expect(r.sdMulti).toBeCloseTo(13.87, 1);
  });

  it('coefficient ajusté reproduit β≈+4,06 [3,4 ; 4,7] (statsmodels)', () => {
    expect(r.betaAdj).toBeGreaterThan(4.0);
    expect(r.betaAdj).toBeLessThan(4.13);
    expect(r.ciLow).toBeGreaterThan(3.3);
    expect(r.ciLow).toBeLessThan(3.5);
    expect(r.ciHigh).toBeGreaterThan(4.6);
    expect(r.ciHigh).toBeLessThan(4.85);
    expect(r.p).toBeLessThan(1e-20);
  });
});
