import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeAxisByCabinet, type CabinetAxisRow } from './cabinet-axis';

const HERE = dirname(fileURLToPath(import.meta.url));

// Fixture = 3 cabinets représentatifs (un par palier) extraits du dataset réel
// V1.3 (HAS Synaé 19/05/2026, ODbL). Valeurs attendues = colonnes du
// classement de référence V1.3.
describe('analyzeAxisByCabinet — GOLDEN sur données réelles (V1.3)', () => {
  const lines = readFileSync(join(HERE, '__fixtures__', 'cabinet-axis-sample.csv'), 'utf8')
    .trim()
    .split(/\r?\n/);
  lines.shift(); // header: cabinet,score,is_multi
  const rows: CabinetAxisRow[] = lines.map((l) => {
    const i = l.lastIndexOf(',');
    const j = l.lastIndexOf(',', i - 1);
    return {
      cabinet: l.slice(0, j),
      score: Number(l.slice(j + 1, i)),
      exposed: l.slice(i + 1) === '1',
    };
  });
  const byCabinet = Object.fromEntries(
    analyzeAxisByCabinet(rows, { nationalGap: 5.25 }).map((r) => [r.cabinet, r]),
  );

  it('CAB-A — 🟢 Fiable, reproduit N/moy/écart/d/p', () => {
    const r = byCabinet['CAB-A'];
    expect(r.nUnexposed).toBe(35);
    expect(r.nExposed).toBe(227);
    expect(r.meanUnexposed).toBeCloseTo(61.64, 1);
    expect(r.meanExposed).toBeCloseTo(75.88, 1);
    expect(r.gap).toBeCloseTo(14.24, 1);
    expect(r.reliability).toBe('fiable');
    expect(r.cohensD).toBeCloseTo(0.854, 2);
    expect(r.p).toBeLessThan(0.001); // V1.3 : 0,0004
  });

  it('CAB-B — 🟡 Tendance, reproduit N/écart/d/p', () => {
    const r = byCabinet['CAB-B'];
    expect(r.nUnexposed).toBe(19);
    expect(r.nExposed).toBe(24);
    expect(r.gap).toBeCloseTo(24.26, 1);
    expect(r.reliability).toBe('tendance');
    expect(r.cohensD).toBeCloseTo(1.429, 2);
    expect(r.p).toBeLessThan(0.001); // V1.3 : 0,0001
  });

  it('CAB-C — 🔴 Descriptif, reproduit N/écart/d/p (NS)', () => {
    const r = byCabinet['CAB-C'];
    expect(r.nUnexposed).toBe(2);
    expect(r.nExposed).toBe(47);
    expect(r.gap).toBeCloseTo(24.86, 1);
    expect(r.reliability).toBe('descriptif');
    expect(r.cohensD).toBeCloseTo(2.316, 2);
    expect(r.p).toBeCloseTo(0.3235, 2); // V1.3 : 0,3235 (NS)
  });

  it('Δ vs national calculé', () => {
    expect(byCabinet['CAB-A'].deltaVsNational).toBeCloseTo(14.24 - 5.25, 1);
  });
});
