import { describe, it, expect } from 'vitest';
import {
  toContrastRows,
  nationalContrastGap,
  analyzeContrastByCabinet,
  type CategoricalRow,
  type AxisContrast,
} from './cabinet-axis-categorical';

const CONTRAST: AxisContrast = {
  id: 'commercial_vs_public',
  label: 'Privé commercial vs Public',
  reference: 'Public',
  target: 'Privé commercial',
};

const ROWS: CategoricalRow[] = [
  { cabinet: 'A', score: 70, category: 'Public' },
  { cabinet: 'A', score: 80, category: 'Privé commercial' },
  { cabinet: 'A', score: 90, category: 'Privé à but non lucratif' }, // hors contraste
  { cabinet: 'B', score: 60, category: 'Public' },
  { cabinet: 'B', score: 76, category: 'Privé commercial' },
];

describe('toContrastRows', () => {
  it('ne garde que les niveaux référence/cible et marque exposed = cible', () => {
    const out = toContrastRows(ROWS, CONTRAST);
    expect(out).toHaveLength(4); // exclut le « non lucratif »
    expect(out.every((r) => r.cabinet === 'A' || r.cabinet === 'B')).toBe(true);
    const aCom = out.find((r) => r.cabinet === 'A' && r.score === 80)!;
    expect(aCom.exposed).toBe(true);
    const aPub = out.find((r) => r.cabinet === 'A' && r.score === 70)!;
    expect(aPub.exposed).toBe(false);
  });
});

describe('nationalContrastGap', () => {
  it('calcule moyenne(cible) − moyenne(référence) sur tout l’échantillon', () => {
    // Public: 70,60 → 65 ; Commercial: 80,76 → 78 ; gap = 13
    expect(nationalContrastGap(ROWS, CONTRAST)).toBeCloseTo(13, 6);
  });
});

describe('analyzeContrastByCabinet', () => {
  it('classe les cabinets sur le contraste avec Δ vs national', () => {
    const res = analyzeContrastByCabinet(ROWS, CONTRAST);
    const a = res.find((r) => r.cabinet === 'A')!;
    expect(a.gap).toBeCloseTo(10, 6); // 80 - 70
    const b = res.find((r) => r.cabinet === 'B')!;
    expect(b.gap).toBeCloseTo(16, 6); // 76 - 60
    expect(res[0].cabinet).toBe('B'); // plus grand écart
    expect(a.deltaVsNational).toBeCloseTo(10 - 13, 6); // vs national 13
  });
});
