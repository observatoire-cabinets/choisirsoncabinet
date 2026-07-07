import { describe, it, expect } from 'vitest';
import { summarizeCabinetAxis, cabinetAxisToCsv } from './cabinet-axis-report';
import type { CabinetAxisResult } from './cabinet-axis';

function mk(partial: Partial<CabinetAxisResult>): CabinetAxisResult {
  return {
    cabinet: 'X',
    nTotal: 0,
    nUnexposed: 0,
    nExposed: 0,
    meanUnexposed: null,
    meanExposed: null,
    gap: null,
    reliability: 'descriptif',
    cohensD: null,
    ciLow: null,
    ciHigh: null,
    p: null,
    deltaVsNational: null,
    rank: 0,
    indicators: [],
    ...partial,
  };
}

const RESULTS: CabinetAxisResult[] = [
  mk({ cabinet: 'A', gap: 10, reliability: 'fiable', rank: 1, nUnexposed: 30, nExposed: 40 }),
  mk({ cabinet: 'B', gap: 4, reliability: 'tendance', rank: 2 }),
  mk({ cabinet: 'C', gap: -2, reliability: 'descriptif', rank: 3 }),
  mk({ cabinet: 'D', gap: null, reliability: 'descriptif', rank: 4 }), // sans écart
];

describe('summarizeCabinetAxis', () => {
  it('compte les paliers', () => {
    const s = summarizeCabinetAxis(RESULTS);
    expect(s.totalCabinets).toBe(4);
    expect(s.nFiable).toBe(1);
    expect(s.nTendance).toBe(1);
    expect(s.nDescriptif).toBe(2);
  });

  it('compte les directions (pro-multi / pro-mono) sur écarts non nuls', () => {
    const s = summarizeCabinetAxis(RESULTS);
    expect(s.proMulti).toBe(2); // gaps 10, 4
    expect(s.proMono).toBe(1); // gap -2
  });

  it('calcule la distribution des écarts (médiane, min, max)', () => {
    const s = summarizeCabinetAxis(RESULTS);
    expect(s.medianGap).toBeCloseTo(4, 6); // médiane de {10,4,-2}
    expect(s.minGap).toBeCloseTo(-2, 6);
    expect(s.maxGap).toBeCloseTo(10, 6);
  });
});

describe('cabinetAxisToCsv', () => {
  it('produit un en-tête + une ligne par cabinet', () => {
    const csv = cabinetAxisToCsv(RESULTS);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('Rang');
    expect(lines[0]).toContain('Cabinet');
    expect(lines[0]).toContain('Écart');
    expect(lines).toHaveLength(5); // header + 4
  });

  it('échappe les noms de cabinet contenant une virgule', () => {
    const csv = cabinetAxisToCsv([mk({ cabinet: 'CAB, INC', gap: 1, rank: 1 })]);
    expect(csv).toContain('"CAB, INC"');
  });

  it('formate les nombres avec point décimal et les nuls en vide', () => {
    const csv = cabinetAxisToCsv([mk({ cabinet: 'A', gap: 10.123, rank: 1, cohensD: null })]);
    const row = csv.trim().split('\n')[1];
    expect(row).toContain('10.12'); // écart arrondi
    expect(row).toContain('A');
  });
});
