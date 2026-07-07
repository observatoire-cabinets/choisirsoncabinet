import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  analyzeAxisByCabinet,
  reliabilityTier,
  type CabinetAxisRow,
  type CabinetMethod,
} from './cabinet-axis';
import { setSignificanceAlpha } from './significance';

function rows(...rs: [string, number, boolean][]): CabinetAxisRow[] {
  return rs.map(([cabinet, score, exposed]) => ({ cabinet, score, exposed }));
}

describe('reliabilityTier', () => {
  it('🟢 fiable quand n_mono ≥ 30 ET n_multi ≥ 30', () => {
    expect(reliabilityTier(30, 30)).toBe('fiable');
  });
  it('🟡 tendance quand ≥ 10 et ≥ 10 (mais pas fiable)', () => {
    expect(reliabilityTier(10, 29)).toBe('tendance');
  });
  it('🔴 descriptif sinon', () => {
    expect(reliabilityTier(9, 100)).toBe('descriptif');
    expect(reliabilityTier(100, 9)).toBe('descriptif');
  });
});

describe('analyzeAxisByCabinet — descriptifs & classement', () => {
  const data = rows(
    ['A', 10, false],
    ['A', 12, false],
    ['A', 14, true],
    ['A', 16, true],
    ['B', 20, false],
    ['B', 30, true],
    ['B', 40, true],
  );

  it('calcule N, moyennes et écart par cabinet (M1)', () => {
    const res = analyzeAxisByCabinet(data);
    const a = res.find((r) => r.cabinet === 'A')!;
    expect(a.nUnexposed).toBe(2);
    expect(a.nExposed).toBe(2);
    expect(a.meanUnexposed).toBeCloseTo(11, 6);
    expect(a.meanExposed).toBeCloseTo(15, 6);
    expect(a.gap).toBeCloseTo(4, 6);
  });

  it('classe par écart décroissant (rang)', () => {
    const res = analyzeAxisByCabinet(data);
    expect(res[0].cabinet).toBe('B'); // gap 15
    expect(res[0].rank).toBe(1);
    expect(res[1].cabinet).toBe('A'); // gap 4
    expect(res[1].rank).toBe(2);
  });

  it('Cohen’s d nul quand un groupe a < 2 obs', () => {
    const res = analyzeAxisByCabinet(data);
    const b = res.find((r) => r.cabinet === 'B')!; // n_mono = 1
    expect(b.cohensD).toBeNull();
    expect(b.p).toBeNull();
  });

  it('calcule Δ vs national', () => {
    const res = analyzeAxisByCabinet(data, { nationalGap: 5 });
    const a = res.find((r) => r.cabinet === 'A')!;
    expect(a.deltaVsNational).toBeCloseTo(-1, 6); // 4 - 5
  });
});

describe('analyzeAxisByCabinet — Cohen’s d, IC, p (M3)', () => {
  const data = rows(
    ['K', 70, false],
    ['K', 74, false],
    ['K', 80, true],
    ['K', 84, true],
  );

  // Golden V1.3 : IC 99 % (z≈2,576), donc calé explicitement sur α=0,01. Le défaut
  // est 0,05 (cf. significance.ts) ; on bascule ici EXPLICITEMENT
  // pour préserver la portée du chiffre golden.
  beforeEach(() => setSignificanceAlpha(0.01));
  afterEach(() => setSignificanceAlpha(0.05));

  it('reproduit la formule V1.3 (pooled d + IC Welch, α=0,01 explicite)', () => {
    const k = analyzeAxisByCabinet(data)[0];
    expect(k.gap).toBeCloseTo(10, 6);
    expect(k.cohensD).toBeCloseTo(3.5355, 3); // 10 / sqrt(8)
    expect(k.ciLow).toBeCloseTo(2.714, 2); // 10 - 2.576*sqrt(8) (IC 99 %, α=0,01 explicite)
    expect(k.ciHigh).toBeCloseTo(17.286, 2);
    expect(k.p).toBeGreaterThan(0);
    expect(k.p).toBeLessThan(0.2); // t≈3.54, df=2
  });
});

describe('analyzeAxisByCabinet — extensibilité (registre)', () => {
  it('exécute les méthodes additionnelles et empile leurs indicateurs', () => {
    const dummy: CabinetMethod = (ctx) => ({
      methodId: 'M-test',
      label: 'Test',
      value: ctx.exposedScores.length,
      guideRef: '#test',
    });
    const res = analyzeAxisByCabinet(rows(['A', 10, false], ['A', 20, true]), {
      extraMethods: [dummy],
    });
    const ind = res[0].indicators.find((i) => i.methodId === 'M-test');
    expect(ind?.value).toBe(1);
  });
});
