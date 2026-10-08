/**
 * Règles de tracé de l'historique du positionnement, communes au rendu écran
 * (SVG) et au rendu PDF : couleurs, domaine vertical d'une série, position
 * relative d'une valeur dans le cadre (axe inversé pour le rang), plages de la
 * moyenne des cabinets et points isolés du cabinet. Chaque rendu ne fait que
 * reporter ces positions relatives dans son propre repère.
 * Module PUR, sans dépendance d'exécution (imports de types uniquement) : il
 * peut être chargé tel quel par le processus de rendu.
 */
import type { PositioningPoint, PositioningSeries, SeriesKind } from './cabinet-positioning-history';

/**
 * Moyenne des cabinets ; cabinet au-dessus / en dessous de la moyenne ; rang au
 * méta-classement, sans moyenne de comparaison, en couleur neutre. Couleurs
 * choisies pour rester lisibles par les personnes daltoniennes.
 */
export const COULEURS = { ensemble: '#111111', dessus: '#378ADD', dessous: '#D85A30', rang: '#555555' } as const;
export type CleCouleur = keyof typeof COULEURS;

/**
 * Libellés des bornes de l'axe vertical (valeur du haut et du bas du domaine),
 * petits et gris, alignés à gauche dans le cadre.
 */
export const COULEUR_BORNES = '#777777';

/** Couleur du tracé du cabinet : neutre pour le rang, sinon celle du côté fourni par les données. */
export function couleurCabinet(s: PositioningSeries, cote: PositioningPoint['cote']): string {
  return s.kind === 'rang' ? COULEURS.rang : cote === 'dessous' ? COULEURS.dessous : COULEURS.dessus;
}

/** Bornes de l'axe vertical d'une série. */
export interface Domaine {
  lo: number;
  hi: number;
}

/** Part de l'étendue des valeurs ajoutée de chaque côté du domaine. */
const MARGE_DOMAINE = 0.12;

/**
 * Marge de chaque côté du domaine d'une série dont toutes les valeurs sont
 * égales, dans l'unité de la série : un point de note ou d'écart, 0,05 de HHI,
 * un rang.
 */
const MARGE_SERIE_CONSTANTE: Readonly<Record<SeriesKind, number>> = {
  niveau: 1,
  region: 1,
  ecart: 1,
  hhi: 0.05,
  rang: 1,
};

/**
 * Domaine vertical d'une série : valeurs du cabinet et de la moyenne des
 * cabinets (0 inclus pour un écart, pour situer la ligne zéro), élargi de 12 %
 * de l'étendue de chaque côté ; si toutes les valeurs sont égales, élargi de la
 * marge de la série (MARGE_SERIE_CONSTANTE). Série sans aucune valeur : domaine
 * centré sur 0. Rang : domaine ramené aux rangs entiers (voir domaineRang).
 */
export function domaineSerie(s: PositioningSeries): Domaine {
  const vals: number[] = [];
  for (const p of s.points) {
    if (p.cabinet !== null) vals.push(p.cabinet);
    if (p.ensemble !== null) vals.push(p.ensemble);
  }
  if (s.kind === 'ecart' || vals.length === 0) vals.push(0);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const marge = (hi - lo) * MARGE_DOMAINE || MARGE_SERIE_CONSTANTE[s.kind];
  const d = { lo: lo - marge, hi: hi + marge };
  return s.kind === 'rang' ? domaineRang(s, d) : d;
}

/**
 * Domaine du rang : bornes arrondies aux rangs entiers vers l'extérieur
 * (lo vers le bas, hi vers le haut), puis ramenées au 1er et au plus grand rang
 * possible de la série (nombre maximal de cabinets classés, ou rang tracé s'il
 * est plus grand). Les bords du cadre sont ainsi exactement des rangs. Moins de
 * deux rangs possibles (un seul cabinet classé) : 1er à 2e.
 */
function domaineRang(s: PositioningSeries, d: Domaine): Domaine {
  let plusGrand = 0;
  for (const p of s.points) {
    plusGrand = Math.max(plusGrand, p.nCabinetsEnsemble, p.cabinet ?? 0);
  }
  const lo = Math.max(1, Math.floor(d.lo));
  const hi = Math.min(Math.max(plusGrand, lo + 1), Math.ceil(d.hi));
  return { lo, hi: Math.max(hi, lo + 1) };
}

/**
 * Position horizontale relative (0 à gauche, 1 à droite) de l'indice de mois `i`
 * (éventuellement fractionnaire, pour un croisement) parmi `n` mois ; un mois
 * unique est centré.
 */
export function abscisseRelative(i: number, n: number): number {
  return n <= 1 ? 0.5 : i / (n - 1);
}

/**
 * Hauteur relative (0 en bas, 1 en haut) de la valeur `v` dans le domaine ; axe
 * inversé pour le rang (le 1er en haut).
 */
export function hauteurRelative(s: PositioningSeries, d: Domaine, v: number): number {
  const t = (v - d.lo) / (d.hi - d.lo);
  return s.kind === 'rang' ? 1 - t : t;
}

/**
 * Plages de mois consécutifs ayant une moyenne des cabinets, en (indice, valeur) :
 * un tracé par plage d'au moins deux mois, un petit disque pour un mois isolé.
 * Aucune plage pour le rang, qui n'a pas de moyenne de comparaison.
 */
export function plagesMoyenne(s: PositioningSeries): { i: number; v: number }[][] {
  if (s.kind === 'rang') return [];
  const plages: { i: number; v: number }[][] = [];
  let plage: { i: number; v: number }[] = [];
  s.points.forEach((p, i) => {
    if (p.ensemble !== null) {
      plage.push({ i, v: p.ensemble });
      return;
    }
    if (plage.length) plages.push(plage);
    plage = [];
  });
  if (plage.length) plages.push(plage);
  return plages;
}

/**
 * Point isolé du cabinet : valeur présente sans voisin renseigné. Il n'appartient
 * à aucun segment et est tracé seul (disque, ou cercle creux si l'effectif est
 * faible), sinon il serait invisible.
 */
export function estIsole(points: readonly PositioningPoint[], i: number): boolean {
  const valeur = (k: number): number | null => points[k]?.cabinet ?? null;
  return valeur(i) !== null && valeur(i - 1) === null && valeur(i + 1) === null;
}
