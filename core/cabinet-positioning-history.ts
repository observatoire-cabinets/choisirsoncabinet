/**
 * Historique du positionnement d'un cabinet — séries MENSUELLES CUMULÉES : le
 * point d'un mois compte toutes les évaluations closes jusqu'à la fin de ce mois
 * (as-of, mêmes règles que la Fiche cabinet ; évaluations sans date de clôture
 * exclues et comptées à part).
 *
 * Pour chaque fiche statistique, deux grandeurs : la valeur du cabinet et la
 * valeur de l'ENSEMBLE DES CABINETS, définie comme la moyenne non pondérée des
 * valeurs des cabinets ayant un effectif suffisant ce mois-là (même unité, même
 * définition que la valeur du cabinet ; non ajustée). Le rang au méta-classement
 * n'a pas de courbe d'ensemble : le nombre de cabinets classés l'accompagne.
 *
 * Aucun calcul statistique nouveau : chaque mois rejoue buildCabinetProfiles et
 * les dérivations existantes (DROM, région). Le seuil de la correction de Holm est
 * passé explicitement ; les intervalles de confiance, non utilisés ici, suivent le
 * seuil global. Calcul unique pour tous les cabinets.
 */

import type { Dataset } from '../store/types';
import { extractRows } from '../store/extract';
import { asOfDataset } from './cabinet-fiche';
import { nextMonth, monthKey } from './cabinet-fiche-history';
import {
  buildCabinetProfiles,
  sortMetaRanking,
  toCategorical,
  PHARE_CONTRASTS,
} from './cabinet-profile';
import { analyzeContrastByCabinet } from './cabinet-axis-categorical';
import { deriveDrom, deriveRegion, DROM_CONTRASTS } from './fiche-categorical-axes';
import type { Reliability } from './cabinet-axis';
import type { RawMonoMultiExtractRow } from './mono-multi-extract';
import type { Alpha } from './significance';
import { decouperSegments, cotesDesPoints, type Cote, type PositioningSegment } from './positioning-segments';

/** Effectif minimal pour tracer un point (chaque groupe pour un écart). */
export const SEUIL_POINT = 5;
/**
 * Effectif en dessous duquel la courbe du cabinet est tracée en pointillé pour
 * le niveau, le HHI, les régions et le rang. Pour un écart, le pointillé suit le
 * palier « descriptif » (moins de 10 évaluations dans l'un des deux groupes).
 */
const SEUIL_TRAIT_PLEIN = 10;

export type SeriesKind = 'niveau' | 'ecart' | 'hhi' | 'rang' | 'region';

export interface PositioningPoint {
  /** Mois 'YYYY-MM'. */
  month: string;
  /** Valeur du cabinet ; null = effectif insuffisant ou cabinet absent ce mois-là. */
  cabinet: number | null;
  /** Moyenne non pondérée des cabinets ayant une valeur ce mois-là (null pour le rang). */
  ensemble: number | null;
  /** Cabinets moyennés dans `ensemble` ; pour le rang, cabinets classés ce mois-là. */
  nCabinetsEnsemble: number;
  /**
   * Effectifs du cabinet : [n] (niveau, HHI, région, rang) ou [nRéférence, nCible]
   * (écart) ; [] : cabinet absent ce mois-là.
   */
  effectifs: number[];
  /** Palier de fiabilité d'un écart ; null pour les autres séries. */
  reliability: Reliability | null;
  /** Nombre d'axes signalés (rang au méta-classement uniquement). */
  axesSignales?: number;
  /**
   * Effectif faible ce mois-là (règle du pointillé des segments) : trait en
   * pointillé, cercle creux pour un point isolé. false si le cabinet est absent.
   */
  pointille: boolean;
  /**
   * Côté du cabinet par rapport à la moyenne des cabinets (règle de
   * decouperSegments) ; null si le cabinet est absent ce mois-là.
   */
  cote: Cote | null;
}

/** Point tel que calculé, avant le côté et le pointillé (ajoutés par `finaliser`). */
type PointBrut = Omit<PositioningPoint, 'pointille' | 'cote'>;

export interface PositioningSeries {
  ficheNumero: number;
  seriesId: string;
  label: string;
  kind: SeriesKind;
  points: PositioningPoint[];
  segments: PositioningSegment[];
  /** Premier mois où le cabinet a une valeur tracée (null : aucune). */
  firstMonth: string | null;
  /** Dernier mois où le cabinet a une valeur tracée (null : aucune). */
  lastMonth: string | null;
}

export interface CabinetPositioningHistory {
  cabinet: string;
  months: string[];
  series: PositioningSeries[];
  /**
   * Premier et dernier mois où le cabinet a une valeur, toutes séries confondues :
   * période où le cabinet existe dans les données. Le rang, sans seuil d'effectif,
   * existe dès la première évaluation datée.
   */
  firstMonth: string | null;
  lastMonth: string | null;
  /** Évaluations datées du cabinet au dernier mois. */
  nDated: number;
  /** Évaluations sans date de clôture (exclues de l'historique). */
  nUndated: number;
}

export interface PositioningHistoryAll {
  months: string[];
  byCabinet: Map<string, CabinetPositioningHistory>;
}

interface Valeur {
  v: number | null;
  effectifs: number[];
  reliability: Reliability | null;
  axesSignales?: number;
}
interface MoisCalc {
  parCabinet: Map<string, Map<string, Valeur>>;
  ensemble: Map<string, { v: number | null; n: number }>;
}

const FICHE_PAR_AXE: ReadonlyMap<string, number> = new Map([
  ['mono_multi', 1],
  ['statut', 2],
  ['secteur', 5],
  ['capacite', 6],
  ['groupe_lucratif', 7],
  ['temporel', 8],
  ['etab_service', 9],
]);

function ficheDeLAxe(axisId: string): number {
  const fiche = FICHE_PAR_AXE.get(axisId);
  if (fiche === undefined) throw new Error(`Axe phare sans fiche de rattachement : ${axisId}`);
  return fiche;
}

interface DefSerie { id: string; fiche: number; kind: SeriesKind; label: string }

const SERIES_FIXES: DefSerie[] = [
  { id: 'niveau', fiche: 3, kind: 'niveau', label: 'Note moyenne' },
  ...PHARE_CONTRASTS.map((p) => ({
    id: p.axisId,
    fiche: ficheDeLAxe(p.axisId),
    kind: 'ecart' as const,
    label: `${p.label} (écart)`,
  })).sort((a, b) => a.fiche - b.fiche),
  { id: 'hhi', fiche: 10, kind: 'hhi', label: 'Concentration du portefeuille (HHI)' },
  { id: 'drom', fiche: 11, kind: 'ecart', label: 'DROM vs métropole (écart brut)' },
  { id: 'rang', fiche: 12, kind: 'rang', label: 'Rang au méta-classement' },
];

const PREFIXE_REGION = 'region:';

const moyenne = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

function obtenirOuCreer<K, V>(m: Map<K, V>, k: K, creer: () => V): V {
  let v = m.get(k);
  if (v === undefined) {
    v = creer();
    m.set(k, v);
  }
  return v;
}

function pousser<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  obtenirOuCreer(m, k, () => []).push(v);
}

/** Moyenne des notes, tracée à partir de SEUIL_POINT évaluations. */
function valeurMoyenne(xs: number[]): Valeur {
  return { v: xs.length >= SEUIL_POINT ? moyenne(xs) : null, effectifs: [xs.length], reliability: null };
}

/** Écart cible − référence, tracé si chaque groupe atteint SEUIL_POINT évaluations. */
function valeurEcart(gap: number | null, nRef: number, nCible: number, reliability: Reliability | null): Valeur {
  const tracable = gap !== null && nRef >= SEUIL_POINT && nCible >= SEUIL_POINT;
  return { v: tracable ? gap : null, effectifs: [nRef, nCible], reliability };
}

/** Mois couverts par des lignes déjà extraites (règle de listerMois). */
function moisDesLignes(lignes: RawMonoMultiExtractRow[]): string[] {
  const cles = lignes
    .filter((r) => (r.cabinet ?? '') !== '' && r.eval_date != null)
    .map((r) => monthKey(r.eval_date as Date | string))
    .sort();
  if (cles.length === 0) return [];
  const out: string[] = [];
  for (let m = cles[0]; m <= cles[cles.length - 1]; m = nextMonth(m)) out.push(m);
  return out;
}

/** Tous les mois du premier au dernier mois de clôture (évaluations rattachées à un cabinet). */
export function listerMois(ds: Dataset): string[] {
  return moisDesLignes(extractRows(ds));
}

function calculerMois(raw: RawMonoMultiExtractRow[], alpha: Alpha): MoisCalc {
  const profils = buildCabinetProfiles(raw, alpha);
  const parCabinet = new Map<string, Map<string, Valeur>>();
  const de = (c: string): Map<string, Valeur> => obtenirOuCreer(parCabinet, c, () => new Map());

  const scores = new Map<string, number[]>();
  const regions = new Map<string, Map<string, number[]>>();
  for (const r of raw) {
    const c = r.cabinet ?? '';
    if (!c) continue;
    const s = Number(r.score);
    pousser(scores, c, s);
    const reg = deriveRegion(r);
    if (reg) pousser(obtenirOuCreer(regions, c, () => new Map()), reg, s);
  }
  for (const [c, xs] of scores) de(c).set('niveau', valeurMoyenne(xs));
  for (const p of profils) {
    const m = de(p.cabinet);
    for (const a of p.axes) m.set(a.axisId, valeurEcart(a.gap, a.nUnexposed, a.nExposed, a.reliability));
    m.set('hhi', { v: p.n >= SEUIL_POINT ? p.portfolio.hhi : null, effectifs: [p.n], reliability: null });
  }
  sortMetaRanking(profils).forEach((p, i) => {
    de(p.cabinet).set('rang', { v: i + 1, effectifs: [p.n], reliability: null, axesSignales: p.nSignificantAxes });
  });
  for (const d of analyzeContrastByCabinet(toCategorical(raw, deriveDrom), DROM_CONTRASTS[0])) {
    de(d.cabinet).set('drom', valeurEcart(d.gap, d.nUnexposed, d.nExposed, d.reliability));
  }
  for (const [c, m] of regions) {
    for (const [reg, xs] of m) de(c).set(`${PREFIXE_REGION}${reg}`, valeurMoyenne(xs));
  }

  const valeurs = new Map<string, number[]>();
  for (const m of parCabinet.values()) {
    for (const [id, val] of m) if (id !== 'rang' && val.v !== null) pousser(valeurs, id, val.v);
  }
  const ensemble = new Map<string, { v: number | null; n: number }>();
  for (const [id, xs] of valeurs) ensemble.set(id, { v: moyenne(xs), n: xs.length });
  ensemble.set('rang', { v: null, n: profils.length });
  return { parCabinet, ensemble };
}

/** Écart : palier « descriptif » ; autres séries (niveau, HHI, régions, rang) : effectif < 10. */
const pointilleDe = (kind: SeriesKind, p: PointBrut): boolean => {
  if (p.cabinet === null) return false;
  if (kind === 'ecart') return p.reliability === 'descriptif';
  return (p.effectifs[0] ?? 0) < SEUIL_TRAIT_PLEIN;
};

/**
 * Recalcule bornes, segments, côté et pointillé de chaque point d'une série
 * (aussi après troncature).
 */
function finaliser(
  s: Omit<PositioningSeries, 'segments' | 'firstMonth' | 'lastMonth' | 'points'> & { points: PointBrut[] },
): PositioningSeries {
  const cabinet = s.points.map((p) => p.cabinet);
  const ensemble = s.points.map((p) => p.ensemble);
  const pointille = s.points.map((p) => pointilleDe(s.kind, p));
  const cotes = cotesDesPoints(cabinet, ensemble);
  const points = s.points.map((p, i) => ({ ...p, pointille: pointille[i], cote: cotes[i] }));
  const avec = points.filter((p) => p.cabinet !== null);
  return {
    ...s,
    points,
    firstMonth: avec.length ? avec[0].month : null,
    lastMonth: avec.length ? avec[avec.length - 1].month : null,
    segments: decouperSegments(cabinet, ensemble, pointille),
  };
}

function serie(def: DefSerie, cabinet: string, months: string[], calc: MoisCalc[]): PositioningSeries {
  const points: PointBrut[] = months.map((month, i) => {
    const val = calc[i].parCabinet.get(cabinet)?.get(def.id);
    const ens = calc[i].ensemble.get(def.id);
    const p: PointBrut = {
      month,
      cabinet: val?.v ?? null,
      ensemble: def.kind === 'rang' ? null : ens?.v ?? null,
      nCabinetsEnsemble: ens?.n ?? 0,
      effectifs: val?.effectifs ?? [],
      reliability: val?.reliability ?? null,
    };
    if (val?.axesSignales !== undefined) p.axesSignales = val.axesSignales;
    return p;
  });
  return finaliser({ ficheNumero: def.fiche, seriesId: def.id, label: def.label, kind: def.kind, points });
}

/** Effectif du cabinet au dernier point d'une série (0 s'il est absent ce mois-là). */
const effectifFinal = (s: PositioningSeries): number => s.points[s.points.length - 1]?.effectifs[0] ?? 0;

/**
 * Séries régionales retenues : régions où le cabinet a au moins une évaluation au
 * dernier mois, triées par effectif à ce mois décroissant, puis par nom.
 */
function ordonnerRegions(regions: PositioningSeries[]): PositioningSeries[] {
  return regions
    .filter((s) => effectifFinal(s) > 0)
    .sort((a, b) => effectifFinal(b) - effectifFinal(a) || a.label.localeCompare(b.label, 'fr'));
}

/** Séries fixes dans leur ordre, puis séries régionales retenues et ordonnées. */
function composerSeries(series: PositioningSeries[]): PositioningSeries[] {
  return [
    ...series.filter((s) => s.kind !== 'region'),
    ...ordonnerRegions(series.filter((s) => s.kind === 'region')),
  ];
}

function bornes(series: PositioningSeries[]): { firstMonth: string | null; lastMonth: string | null } {
  const debuts = series.map((s) => s.firstMonth).filter((m): m is string => m !== null).sort();
  const fins = series.map((s) => s.lastMonth).filter((m): m is string => m !== null).sort();
  return { firstMonth: debuts[0] ?? null, lastMonth: fins.length ? fins[fins.length - 1] : null };
}

function nDatesDe(series: PositioningSeries[]): number {
  const niveau = series.find((s) => s.seriesId === 'niveau');
  const last = niveau?.points[niveau.points.length - 1];
  return last?.effectifs[0] ?? 0;
}

function assembler(
  cabinet: string,
  months: string[],
  calc: MoisCalc[],
  nUndated: number,
): CabinetPositioningHistory {
  const fixes = SERIES_FIXES.map((d) => serie(d, cabinet, months, calc));
  const dernier = months.length ? calc[months.length - 1].parCabinet.get(cabinet) : undefined;
  const regions = [...(dernier?.keys() ?? [])]
    .filter((id) => id.startsWith(PREFIXE_REGION))
    .map((id) =>
      serie({ id, fiche: 4, kind: 'region', label: id.slice(PREFIXE_REGION.length) }, cabinet, months, calc),
    );
  const series = composerSeries([...fixes, ...regions]);
  return { cabinet, months, series, ...bornes(series), nDated: nDatesDe(series), nUndated };
}

export async function computePositioningHistory(
  ds: Dataset,
  alpha: Alpha,
  opts: { yieldEach?: () => Promise<void>; cancelled?: () => boolean } = {},
): Promise<PositioningHistoryAll | null> {
  const lignes = extractRows(ds);
  const months = moisDesLignes(lignes);
  const calc: MoisCalc[] = [];
  for (const m of months) {
    if (opts.cancelled?.()) return null;
    calc.push(calculerMois(extractRows(asOfDataset(ds, m)), alpha));
    if (opts.yieldEach) await opts.yieldEach();
  }
  if (opts.cancelled?.()) return null;

  const nonDatees = new Map<string, number>();
  const cabinets = new Set<string>();
  for (const r of lignes) {
    const c = r.cabinet ?? '';
    if (!c) continue;
    cabinets.add(c);
    if (r.eval_date == null) nonDatees.set(c, (nonDatees.get(c) ?? 0) + 1);
  }
  const byCabinet = new Map<string, CabinetPositioningHistory>();
  for (const c of [...cabinets].sort((a, b) => a.localeCompare(b, 'fr'))) {
    byCabinet.set(c, assembler(c, months, calc, nonDatees.get(c) ?? 0));
  }
  return { months, byCabinet };
}

/**
 * Historique restreint aux mois <= `mois` ('YYYY-MM') — export d'une fiche passée.
 * Bornes, segments et séries régionales sont recalculés au dernier mois retenu.
 */
export function tronquerHistorique(h: CabinetPositioningHistory, mois: string): CabinetPositioningHistory {
  const months = h.months.filter((m) => m <= mois);
  const tronquees = h.series.map((s) => {
    const { segments, firstMonth, lastMonth, ...reste } = s;
    return finaliser({ ...reste, points: s.points.filter((p) => p.month <= mois) });
  });
  const series = composerSeries(tronquees);
  return { ...h, months, series, ...bornes(series), nDated: nDatesDe(series) };
}
