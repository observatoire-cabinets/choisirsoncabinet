/**
 * Textes de l'historique du positionnement, communs au rendu écran et au rendu
 * PDF : mois abrégés, période, accords, ordinaux, entiers et valeurs, effectifs,
 * en-tête de la section, titre et pied de carte, bornes de l'axe vertical,
 * dernière valeur, légende, mentions et note de lecture.
 * Module PUR, sans dépendance d'exécution (imports de types uniquement) : il
 * peut être chargé tel quel par le processus de rendu.
 */
import type { CabinetPositioningHistory, PositioningSeries, SeriesKind } from './cabinet-positioning-history';
import type { CleCouleur, Domaine } from './positioning-plot';

/** Mention placée sous la légende. */
export const MENTION_DALTONIENS = 'Couleurs choisies pour rester lisibles par les personnes daltoniennes.';

/** Mention d'une carte sans aucune valeur tracée (au centre du cadre). */
export const MENTION_CARTE_VIDE = 'Effectif insuffisant sur toute la période';

/**
 * Mention de la section quand l'historique n'a pas pu être obtenu (calcul en
 * échec ou interrompu, cabinet absent) ou quand le cabinet n'a aucune valeur
 * tracée sur toute la période (aucune évaluation datée) : seule, à la place de
 * l'en-tête, de la légende et des cartes.
 */
export const MENTION_HISTORIQUE_NON_DISPONIBLE = 'Historique du positionnement non disponible.';

/**
 * Vrai si la section peut tracer l'historique : historique obtenu, au moins une
 * série, et au moins une valeur tracée du cabinet sur la période (firstMonth
 * renseigné). Sinon, écran et PDF n'affichent que MENTION_HISTORIQUE_NON_DISPONIBLE.
 */
export function historiqueTracable(h: CabinetPositioningHistory | null): h is CabinetPositioningHistory {
  return h !== null && h.series.length > 0 && h.firstMonth !== null;
}

/** Intertitre des séries régionales, titrées ensuite par leur seul libellé. */
export const SOUS_TITRE_REGIONS = "Fiche 4 — note moyenne dans chaque région d'intervention";

/** Tracé illustré par une entrée de légende : une couleur, ou l'effectif faible (pointillé, cercle creux). */
export type CleLegende = CleCouleur | 'effectif-faible';

/** Légende, dans l'ordre d'affichage. */
export const LEGENDE_POSITIONNEMENT: readonly { cle: CleLegende; texte: string }[] = [
  { cle: 'ensemble', texte: 'Moyenne des cabinets (non ajustée)' },
  { cle: 'dessus', texte: 'Cabinet, au-dessus de la moyenne' },
  { cle: 'dessous', texte: 'Cabinet, en dessous de la moyenne' },
  { cle: 'rang', texte: 'Rang (sans moyenne)' },
  { cle: 'effectif-faible', texte: 'Effectif faible (pointillé ; point isolé : cercle creux)' },
];

/** Note de lecture placée sous les graphiques. */
export const NOTE_POSITIONNEMENT =
  'Courbe noire : moyenne, non pondérée et non ajustée, des cabinets ayant au moins 5 évaluations ' +
  '(5 dans chaque groupe pour un écart) ce mois-là. Scores sur 100 ; écarts en points ; pour un écart, ' +
  "les deux effectifs sont donnés dans l'ordre du titre (ex. multi / mono). Le jeu public ne conservant " +
  'que la dernière évaluation par structure, les mois anciens sont approchés pour les structures ' +
  "réévaluées. Rang (fiche 12) : ordre du méta-classement publié, par nombre d'axes signalés " +
  'décroissant ; le 1er rang est celui qui en compte le plus. Un écart décrit une régularité, pas une ' +
  "intention ; être au-dessus ou en dessous de la moyenne n'est pas un jugement.";

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** 'YYYY-MM' → « janv. 2023 ». */
export function moisFr(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return `${MOIS[mo - 1]} ${y}`;
}

/** « de » devant une consonne, « d' » devant une voyelle (avr., août, oct.). */
const de = (texte: string): string => (/^[aeiouéèêàâîôû]/i.test(texte) ? `d'${texte}` : `de ${texte}`);

/**
 * Période « de janv. 2023 à mars 2026 », « d'avr. 2023 à oct. 2025 » ; un seul
 * mois : « en mars 2026 ».
 */
export function periodeLabel(first: string, last: string): string {
  if (first === last) return `en ${moisFr(first)}`;
  return `${de(moisFr(first))} à ${moisFr(last)}`;
}

/** Forme accordée au nombre : singulier pour 0 et 1, pluriel au-delà. */
export function pluriel(n: number, singulier: string, plurielForme: string): string {
  return Math.abs(n) < 2 ? singulier : plurielForme;
}

/** Rang ordinal : « 1er », « 2e », « 59e ». */
export function ordinal(r: number): string {
  return r === 1 ? '1er' : `${entierFr(r)}e`;
}

/**
 * Entier avec séparateur de milliers : « 1 998 ». Espace insécable, rendue
 * comme une espace ordinaire dans le PDF (translittération WinAnsi).
 */
export function entierFr(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

/** Décimal à `d` chiffres, virgule décimale, sans « -0 ». */
function decimalFr(x: number, d: number): string {
  const t = x.toFixed(d);
  return (Number(t) === 0 ? (0).toFixed(d) : t).replace('.', ',');
}

/** Décimal signé (« +3,1 », « -0,4 », signe moins ASCII) ; zéro sans signe. */
function signeFr(x: number, d: number): string {
  const t = decimalFr(x, d);
  return /^0,0*$/.test(t) || t.startsWith('-') ? t : `+${t}`;
}

/**
 * Valeur d'une série dans son unité d'affichage : note (niveau, région) à une
 * décimale, écart signé à une décimale, HHI à deux décimales, rang ordinal.
 */
export function valeurPositionnement(kind: SeriesKind, v: number): string {
  if (kind === 'rang') return ordinal(Math.round(v));
  if (kind === 'ecart') return signeFr(v, 1);
  if (kind === 'hhi') return decimalFr(v, 2);
  return decimalFr(v, 1);
}

/**
 * Libellés des bornes de l'axe vertical d'une carte, tels qu'affichés en haut
 * et en bas du cadre, pour le domaine de tracé `d` de la série. Rang (axe
 * inversé) : rang le plus petit en haut, le plus grand en bas, pris parmi les
 * rangs entiers contenus dans le domaine, bornés au 1er et au nombre maximal de
 * cabinets classés de la série (au 2e s'il n'y en a qu'un). Le domaine du rang
 * calculé pour la série (domaineSerie) étant déjà entier et ainsi borné, ces
 * libellés sont exactement ses bords.
 */
export function bornesAxeLabels(s: PositioningSeries, d: Domaine): { haut: string; bas: string } {
  if (s.kind !== 'rang') {
    return { haut: valeurPositionnement(s.kind, d.hi), bas: valeurPositionnement(s.kind, d.lo) };
  }
  const classes = Math.max(0, ...s.points.map((p) => p.nCabinetsEnsemble));
  const haut = Math.max(1, Math.ceil(d.lo));
  let bas = Math.floor(d.hi);
  if (classes >= haut) bas = Math.min(bas, Math.max(classes, haut + 1));
  return { haut: ordinal(haut), bas: ordinal(Math.max(haut, bas)) };
}

/**
 * Valeurs du dernier mois tracé : « mars 2026 : cabinet 82,1 · moyenne 78,4 »
 * (« moyenne — » sans moyenne ce mois-là) ; rang : « mars 2026 : 59e sur 140 ».
 * null pour une carte sans valeur tracée.
 */
export function derniereValeurLabel(s: PositioningSeries): string | null {
  const p = s.lastMonth ? s.points.find((q) => q.month === s.lastMonth) : undefined;
  if (!p || p.cabinet === null) return null;
  if (s.kind === 'rang') {
    return `${moisFr(p.month)} : ${valeurPositionnement('rang', p.cabinet)} sur ${entierFr(p.nCabinetsEnsemble)}`;
  }
  const moyenne = p.ensemble === null ? '—' : valeurPositionnement(s.kind, p.ensemble);
  return `${moisFr(p.month)} : cabinet ${valeurPositionnement(s.kind, p.cabinet)} · moyenne ${moyenne}`;
}

/**
 * Effectifs du cabinet à un mois. Écart : « n = cible / référence », dans
 * l'ordre du titre (« Multi vs mono » → multi d'abord) ; les données les
 * portent dans l'ordre [référence, cible]. Autres séries : « n = effectif ».
 */
export function effectifsLabel(kind: SeriesKind, effectifs: readonly number[]): string {
  if (kind === 'ecart') return `n = ${entierFr(effectifs[1] ?? 0)} / ${entierFr(effectifs[0] ?? 0)}`;
  return `n = ${entierFr(effectifs[0] ?? 0)}`;
}

/**
 * Pied d'une carte : période tracée, valeurs du dernier mois tracé et effectifs
 * du dernier mois ; pour le rang, absence de courbe de moyenne (le nombre de
 * cabinets classés figure dans « r sur N »). Carte sans valeur tracée :
 * effectifs seuls (la carte porte déjà la mention d'effectif insuffisant).
 */
export function piedDeCarte(s: PositioningSeries): string {
  const last = s.points[s.points.length - 1];
  const effectifs = effectifsLabel(s.kind, last?.effectifs ?? []);
  if (!s.firstMonth || !s.lastMonth) return effectifs;
  const derniere = derniereValeurLabel(s);
  const texte = `${periodeLabel(s.firstMonth, s.lastMonth)}${derniere ? ` · ${derniere}` : ''} · ${effectifs}`;
  return s.kind === 'rang' ? `${texte} · sans courbe de moyenne` : texte;
}

/** Titre d'une carte : « Fiche n — libellé » ; libellé seul pour une région (sous l'intertitre de la fiche 4). */
export function titreCarte(s: PositioningSeries): string {
  return s.kind === 'region' ? s.label : `Fiche ${s.ficheNumero} — ${s.label}`;
}

/**
 * En-tête de la section : nature des points, période de l'historique, nombre
 * d'évaluations datées et, s'il y en a, d'évaluations sans date de clôture.
 */
export function enTetePositionnement(h: CabinetPositioningHistory): string {
  const periode = h.firstMonth && h.lastMonth
    ? `historique ${periodeLabel(h.firstMonth, h.lastMonth)}`
    : 'historique indisponible';
  const nonDatees = h.nUndated > 0
    ? ` · ${entierFr(h.nUndated)} sans date de clôture, ${pluriel(h.nUndated, 'exclue', 'exclues')}`
    : '';
  return (
    `Points mensuels cumulés (évaluations closes à la fin de chaque mois) · ${periode} · ` +
    `${entierFr(h.nDated)} ${pluriel(h.nDated, 'évaluation datée', 'évaluations datées')}${nonDatees}.`
  );
}
