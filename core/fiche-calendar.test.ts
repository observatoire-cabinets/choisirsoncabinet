import { describe, it, expect } from 'vitest';
import {
  FICHE_CALENDAR,
  getFicheBuilder,
  resolveFicheNumeroForPeriod,
  monthDiff,
  DEFAULT_CALENDAR_START,
} from './fiche-calendar';

describe('fiche-calendar', () => {
  it('le calendrier couvre les 12 fiches prévues, numérotées 1..12', () => {
    expect(FICHE_CALENDAR).toHaveLength(12);
    expect(FICHE_CALENDAR.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(FICHE_CALENDAR[0].titre.toLowerCase()).toContain('mono');
  });

  it('les 12 fiches ont un builder ; null hors plage', () => {
    for (let n = 1; n <= 12; n++) {
      expect(typeof getFicheBuilder(n)).toBe('function');
    }
    for (const n of [0, 13, 999]) {
      expect(getFicheBuilder(n)).toBeNull();
    }
  });

  it('le builder n°006 produit la fiche capacité', () => {
    const fiche = getFicheBuilder(6)!();
    expect(fiche.numero).toBe(6);
    expect(fiche.titre.toLowerCase()).toContain('capacité');
  });

  it('le builder n°001 produit la fiche mono/multi', () => {
    const build = getFicheBuilder(1)!;
    const fiche = build();
    expect(fiche.numero).toBe(1);
    expect(fiche.titre.toLowerCase()).toContain('multi');
  });

  it('le builder n°002 produit la fiche statut', () => {
    const build = getFicheBuilder(2)!;
    const fiche = build();
    expect(fiche.numero).toBe(2);
    expect(fiche.titre.toLowerCase()).toContain('statut');
  });

  it('monthDiff calcule l’écart en mois entre deux périodes YYYY-MM', () => {
    expect(monthDiff('2026-06', '2026-06')).toBe(0);
    expect(monthDiff('2026-06', '2026-08')).toBe(2);
    expect(monthDiff('2026-06', '2027-06')).toBe(12);
    expect(monthDiff('2026-06', '2026-05')).toBe(-1);
  });

  it('resolveFicheNumeroForPeriod mappe la période au numéro selon le calendrier', () => {
    expect(resolveFicheNumeroForPeriod('2026-06', '2026-06')).toBe(1);
    expect(resolveFicheNumeroForPeriod('2026-07', '2026-06')).toBe(2);
    expect(resolveFicheNumeroForPeriod('2027-05', '2026-06')).toBe(12);
  });

  it('resolveFicheNumeroForPeriod retourne null hors plage du calendrier', () => {
    expect(resolveFicheNumeroForPeriod('2026-05', '2026-06')).toBeNull(); // avant le début
    expect(resolveFicheNumeroForPeriod('2027-06', '2026-06')).toBeNull(); // après 12 mois
  });

  it('DEFAULT_CALENDAR_START est une période YYYY-MM valide', () => {
    expect(DEFAULT_CALENDAR_START).toMatch(/^\d{4}-\d{2}$/);
  });
});
