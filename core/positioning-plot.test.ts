import { describe, it, expect } from 'vitest';
import {
  COULEURS,
  COULEUR_BORNES,
  couleurCabinet,
  domaineSerie,
  abscisseRelative,
  hauteurRelative,
  plagesMoyenne,
  estIsole,
} from './positioning-plot';
import type { PositioningPoint, PositioningSeries } from './cabinet-positioning-history';

const pt = (month: string, cabinet: number | null, ensemble: number | null): PositioningPoint => ({
  month, cabinet, ensemble, nCabinetsEnsemble: 30, effectifs: [12], reliability: null,
  pointille: false, cote: cabinet === null ? null : 'dessus',
});
const serie = (points: PositioningPoint[], o: Partial<PositioningSeries> = {}): PositioningSeries => ({
  ficheNumero: 3, seriesId: 'niveau', label: 'Note moyenne', kind: 'niveau',
  points, segments: [], firstMonth: points[0]?.month ?? null, lastMonth: points[points.length - 1]?.month ?? null, ...o,
});

describe('COULEURS et couleurCabinet', () => {
  it('moyenne noire, au-dessus bleu, en dessous orange, rang gris neutre', () => {
    expect(COULEURS).toEqual({ ensemble: '#111111', dessus: '#378ADD', dessous: '#D85A30', rang: '#555555' });
  });

  it('bornes de l’axe vertical en gris neutre, distinct des couleurs des tracés', () => {
    expect(COULEUR_BORNES).toBe('#777777');
    expect(Object.values(COULEURS)).not.toContain(COULEUR_BORNES);
  });

  it('couleur du côté fourni ; rang toujours neutre, quel que soit le côté', () => {
    const niveau = serie([]);
    expect(couleurCabinet(niveau, 'dessus')).toBe(COULEURS.dessus);
    expect(couleurCabinet(niveau, 'dessous')).toBe(COULEURS.dessous);
    expect(couleurCabinet(niveau, null)).toBe(COULEURS.dessus);
    const rang = serie([], { kind: 'rang' });
    expect(couleurCabinet(rang, 'dessus')).toBe(COULEURS.rang);
    expect(couleurCabinet(rang, 'dessous')).toBe(COULEURS.rang);
  });
});

describe('domaineSerie', () => {
  it('valeurs du cabinet et de la moyenne, élargies de 12 % de l’étendue de chaque côté', () => {
    const d = domaineSerie(serie([pt('2023-01', 70, 80), pt('2023-02', null, 90)]));
    expect(d.lo).toBeCloseTo(70 - 2.4, 10);
    expect(d.hi).toBeCloseTo(90 + 2.4, 10);
  });

  it('écart : 0 toujours inclus', () => {
    const d = domaineSerie(serie([pt('2023-01', 2, 4)], { kind: 'ecart' }));
    expect(d.lo).toBeCloseTo(-0.48, 10);
    expect(d.hi).toBeCloseTo(4.48, 10);
  });

  it('valeurs toutes égales : marge dans l’unité de la série ; aucune valeur : centré sur 0', () => {
    // Note, région, écart : un point de chaque côté.
    expect(domaineSerie(serie([pt('2023-01', 80, 80), pt('2023-02', 80, null)]))).toEqual({ lo: 79, hi: 81 });
    expect(domaineSerie(serie([pt('2023-01', 70, 70)], { kind: 'region' }))).toEqual({ lo: 69, hi: 71 });
    expect(domaineSerie(serie([pt('2023-01', 0, 0)], { kind: 'ecart' }))).toEqual({ lo: -1, hi: 1 });
    // HHI constant à 1 : 0,05 de chaque côté (et non 0 → 2).
    const hhi = domaineSerie(serie([pt('2023-01', 1, 1), pt('2023-02', 1, 1)], { kind: 'hhi' }));
    expect(hhi.lo).toBeCloseTo(0.95, 12);
    expect(hhi.hi).toBeCloseTo(1.05, 12);
    // Rang constant : un rang de chaque côté.
    const rang59 = [pt('2023-01', 59, null), pt('2023-02', 59, null)].map((p) => ({ ...p, nCabinetsEnsemble: 140 }));
    expect(domaineSerie(serie(rang59, { kind: 'rang' }))).toEqual({ lo: 58, hi: 60 });
    expect(domaineSerie(serie([pt('2023-01', null, null)]))).toEqual({ lo: -1, hi: 1 });
    const hhiVide = domaineSerie(serie([pt('2023-01', null, null)], { kind: 'hhi' }));
    expect(hhiVide.lo).toBeCloseTo(-0.05, 12);
    expect(hhiVide.hi).toBeCloseTo(0.05, 12);
  });

  it('rang : bornes arrondies aux rangs entiers vers l’extérieur, ramenées au 1er et aux cabinets classés', () => {
    const rang = (valeurs: (number | null)[], classes: number) =>
      serie(valeurs.map((v, i) => ({ ...pt(`2023-0${i + 1}`, v, null), nCabinetsEnsemble: classes })), { kind: 'rang' });
    // 3 → 1 : 0,76 → 3,24, soit 1 → 4 (jamais 0).
    expect(domaineSerie(rang([3, 1], 30))).toEqual({ lo: 1, hi: 4 });
    // 50 → 70 : 47,6 → 72,4, soit 47 → 73.
    expect(domaineSerie(rang([50, 70], 140))).toEqual({ lo: 47, hi: 73 });
    // 1 → 140 sur 140 classés : -15,68 → 156,68, ramené à 1 → 140.
    expect(domaineSerie(rang([1, 140], 140))).toEqual({ lo: 1, hi: 140 });
    // Dernier rang constant : ramené au nombre de cabinets classés.
    expect(domaineSerie(rang([30, 30], 30))).toEqual({ lo: 29, hi: 30 });
    // Un seul cabinet classé : 1er à 2e, jamais un domaine nul.
    expect(domaineSerie(rang([1, 1], 1))).toEqual({ lo: 1, hi: 2 });
    // Aucun rang tracé : domaine non nul.
    expect(domaineSerie(rang([null], 30))).toEqual({ lo: 1, hi: 2 });
  });
});

describe('abscisseRelative et hauteurRelative', () => {
  it('mois répartis de 0 à 1, indice fractionnaire au croisement ; mois unique centré', () => {
    expect(abscisseRelative(0, 3)).toBe(0);
    expect(abscisseRelative(1, 3)).toBe(0.5);
    expect(abscisseRelative(2, 3)).toBe(1);
    expect(abscisseRelative(0.5, 3)).toBe(0.25);
    expect(abscisseRelative(0, 1)).toBe(0.5);
  });

  it('valeur haute en haut ; rang sur un axe inversé (1er en haut)', () => {
    const d = { lo: 0, hi: 10 };
    const niveau = serie([]);
    expect(hauteurRelative(niveau, d, 10)).toBe(1);
    expect(hauteurRelative(niveau, d, 0)).toBe(0);
    const rang = serie([], { kind: 'rang' });
    expect(hauteurRelative(rang, d, 0)).toBe(1);
    expect(hauteurRelative(rang, d, 10)).toBe(0);
    expect(hauteurRelative(rang, d, 1)).toBeGreaterThan(hauteurRelative(rang, d, 3));
  });
});

describe('plagesMoyenne', () => {
  it('plages de mois consécutifs ayant une moyenne, mois isolé compris', () => {
    const s = serie([pt('2023-01', 1, 80), pt('2023-02', 1, 81), pt('2023-03', 1, null), pt('2023-04', 1, 78)]);
    expect(plagesMoyenne(s)).toEqual([
      [{ i: 0, v: 80 }, { i: 1, v: 81 }],
      [{ i: 3, v: 78 }],
    ]);
  });

  it('aucune plage sans moyenne, ni pour le rang', () => {
    expect(plagesMoyenne(serie([pt('2023-01', 1, null)]))).toEqual([]);
    expect(plagesMoyenne(serie([pt('2023-01', 1, 80), pt('2023-02', 2, 81)], { kind: 'rang' }))).toEqual([]);
  });
});

describe('estIsole', () => {
  it('valeur présente sans voisin renseigné', () => {
    const points = [pt('2023-01', 80, null), pt('2023-02', null, null), pt('2023-03', 70, null), pt('2023-04', 71, null)];
    expect(estIsole(points, 0)).toBe(true);
    expect(estIsole(points, 1)).toBe(false); // aucune valeur
    expect(estIsole(points, 2)).toBe(false);
    expect(estIsole(points, 3)).toBe(false);
    expect(estIsole([pt('2023-01', 80, null)], 0)).toBe(true);
  });
});
