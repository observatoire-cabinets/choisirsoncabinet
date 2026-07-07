/**
 * Dérivateurs de catégorie + contrastes des axes
 * « sains » (fiches 4/5/6/8/9/11), construits sur le cadre catégoriel par
 * contrastes (`cabinet-axis-categorical`). Chaque axe = une fonction qui range
 * une ligne dans un niveau + un jeu de contrastes binaires vs une référence.
 *
 * Classifications FINESS fondées sur la taxonomie réelle publiée par HAS
 * (`open_data_par_essms`, colonne `essms_categ_finess_code`) : services à
 * domicile (SAA, SSIAD, SAAS, SAAD familles) rangés
 * en « Autres » (et non PA) ; ESAT classé établissement (et non service).
 */

import {
  analyzeContrastByCabinet,
  nationalContrastGap,
  type AxisContrast,
  type CategoricalRow,
} from './cabinet-axis-categorical';
import { summarizeCabinetAxis, type ContrastReport } from './cabinet-axis-report';
import {
  extractRaw,
  STATUT_CONTRASTS,
  type RawMonoMultiExtractRow,
  type MonoMultiExtractPrisma,
} from './mono-multi-extract';
import { adjustedContrastGap, type AdjustedContrastRow } from './adjusted-contrast';
import { interactionContrastGaps, type InteractionContrastRow } from './interaction-contrast';
import { confidenceLevel } from './significance';

// ─── Fiche 6 — CAPACITÉ (continue → binnée) ───────────────────────────────────
export type CapacityBin = 'petit' | 'moyen' | 'grand';

/** Seuils lisibles (petit <30 / moyen 30–99 / grand ≥100). */
export function capacityBin(capacity: number | null | undefined): CapacityBin | null {
  if (capacity === null || capacity === undefined || Number.isNaN(capacity)) return null;
  if (capacity < 30) return 'petit';
  if (capacity < 100) return 'moyen';
  return 'grand';
}

export const CAPACITY_CONTRASTS: AxisContrast[] = [
  { id: 'moyen_vs_petit', label: 'Moyen (30–99) vs petit (<30)', reference: 'petit', target: 'moyen' },
  { id: 'grand_vs_petit', label: 'Grand (≥100) vs petit (<30)', reference: 'petit', target: 'grand' },
];

// ─── Fiche 5 — SECTEUR (PA / PH adultes / PH enfants / Autres) ─────────────────
export type Secteur = 'PA' | 'PH adultes' | 'PH enfants' | 'Autres';

/** Codes catégorie FINESS « personnes âgées ». */
const PA_CODES = new Set(['500', '202', '207', '501', '502', '381']);
/** Codes catégorie FINESS « personnes handicapées adultes ». */
const PH_ADULTES_CODES = new Set([
  '246', '255', '437', '448', '449', '382', '252', '445', '446', '253',
  '242', '249', '198', '464', '395', '379',
]);
/** Codes catégorie FINESS « personnes handicapées enfants ». */
const PH_ENFANTS_CODES = new Set([
  '183', '182', '186', '189', '190', '188', '192', '194', '195', '196',
  '377', '390', '396', '402',
]);

export function secteurFromCode(code: string | null | undefined): Secteur {
  const c = (code ?? '').trim();
  if (PA_CODES.has(c)) return 'PA';
  if (PH_ADULTES_CODES.has(c)) return 'PH adultes';
  if (PH_ENFANTS_CODES.has(c)) return 'PH enfants';
  return 'Autres';
}

export const SECTEUR_CONTRASTS: AxisContrast[] = [
  { id: 'ph_adultes_vs_pa', label: 'PH adultes vs personnes âgées', reference: 'PA', target: 'PH adultes' },
  { id: 'ph_enfants_vs_pa', label: 'PH enfants vs personnes âgées', reference: 'PA', target: 'PH enfants' },
  { id: 'autres_vs_pa', label: 'Autres secteurs vs personnes âgées', reference: 'PA', target: 'Autres' },
];

// ─── Fiche 9 — ÉTABLISSEMENT vs SERVICE ───────────────────────────────────────
export type EtabService = 'établissement' | 'service';

/**
 * Codes catégorie FINESS de type « service » (ambulatoire / domicile / mandat).
 * ESAT (246) en est EXCLU → établissement, malgré « et Service »
 * dans son libellé.
 */
const SERVICE_CODES = new Set([
  '460', '182', '446', '445', '354', '209', '295', '340', '344', '441',
  '440', '286', '236', '640', '242', '606', '453',
]);

/**
 * Codes catégorie FINESS de type « établissement » (accueil / hébergement).
 * ALLOWLIST EXPLICITE (fix (a)) : avant, `établissement = tout code ∉ SERVICE` —
 * un fourre-tout qui avalait les codes vides ET toute catégorie non répertoriée
 * (ambulatoire pur, coordination, hors-ESSMS). Désormais on liste les vraies
 * structures « avec hébergement / accueil », et tout le reste (vides, inconnus,
 * exclus) → `null` → ligne droppée, hors contraste.
 *
 * Liste établie sur la taxonomie HAS réelle (`open_data_par_essms`, 80 catégories
 * évaluées). Bornes : ESAT (246) + Réadaptation Pro (249) + Préorientation (198)
 * classés établissement (« et Service » dans le libellé mais structures d'accueil).
 * Exclus (→ null) : ambulatoire (CMPP 189, CAMSP 190, BAPU 221, CSAPA 197, CAARUD
 * 178), accueil de jour (207, 402), coordination/info (CLIC 463, ressources 461,
 * équipe mobile 608), hors-ESSMS (CH 355, centre social 220), expérimentaux et
 * intermédiaires non spécifiés (370/377/379/381, 411, 219, 464).
 *
 * SOURCE + DATE (traçabilité défensive) : HAS `open_data_par_essms`, snapshot
 * 2026-05-11 (80 catégories réellement évaluées énumérées via DuckDB). Liste à
 * REVOIR à chaque MAJ du référentiel FINESS/HAS : toute catégorie non listée
 * (nouvelle ou oubliée) est exclue (null) du contraste — vérifier les nouveaux
 * codes lors d'un changement de snapshot.
 */
const ETABLISSEMENT_CODES = new Set([
  // Personnes âgées (hébergement)
  '500', '202', '502', '501',
  // Personnes handicapées (accueil / hébergement)
  '255', '448', '449', '437', '382', '252', '253', '395', '390', '396',
  '246', '249', '198',
  // PH enfants — instituts (accueil)
  '183', '186', '188', '192', '194', '195', '196',
  // Protection de l'enfance (hébergement)
  '177', '175', '172', '176', '241', '238', '166', '159',
  // Inclusion sociale / logement accompagné (hébergement)
  '214', '443', '442', '257', '258', '259', '462', '644',
  // Santé — structures avec lits/appartements
  '165', '180', '213',
  // Expérimental enfance protégée (hébergement)
  '378',
]);

export function etabServiceFromCode(code: string | null | undefined): EtabService | null {
  const c = (code ?? '').trim();
  if (SERVICE_CODES.has(c)) return 'service';
  if (ETABLISSEMENT_CODES.has(c)) return 'établissement';
  return null; // code vide / inconnu / exclu → hors contraste
}

export const ETAB_SERVICE_CONTRASTS: AxisContrast[] = [
  { id: 'service_vs_etablissement', label: 'Service vs établissement', reference: 'établissement', target: 'service' },
];

// ─── Fiche 11 — DROM vs métropole ─────────────────────────────────────────────
export type Territoire = 'DROM' | 'métropole';

/**
 * DROM/COM vs métropole. Deux encodages cohabitent :
 *   - HAS open data : lettre — 9A Guadeloupe, 9B Martinique, 9C Guyane,
 *     9D La Réunion, 9E (St-Pierre), 9F Mayotte ;
 *   - INSEE classique : 971–976, 977/978, 984/986–988 (préfixe 97/98).
 * Les départements métropolitains en 9x (90–95) et la Corse (2A/2B) restent
 * métropole : le second caractère n'est ni 7/8 ni une lettre A–F.
 */
export function dromFromDepartement(dep: string | null | undefined): Territoire | null {
  const d = (dep ?? '').trim();
  if (!d) return null;
  return /^9[78A-F]/i.test(d) ? 'DROM' : 'métropole';
}

export const DROM_CONTRASTS: AxisContrast[] = [
  { id: 'drom_vs_metropole', label: 'DROM vs métropole', reference: 'métropole', target: 'DROM' },
];

// ─── Fiche 8 — TEMPOREL (premier vs second semestre) ──────────────────────────
export type Semestre = 'S1' | 'S2';

/** Mois 1–6 → S1, 7–12 → S2 (date de clôture technique de l'évaluation). */
export function semestreFromDate(d: Date | string | null | undefined): Semestre | null {
  if (d === null || d === undefined || d === '') return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCMonth() < 6 ? 'S1' : 'S2';
}

export const SEMESTRE_CONTRASTS: AxisContrast[] = [
  { id: 's2_vs_s1', label: 'Second semestre vs premier semestre', reference: 'S1', target: 'S2' },
];

// ─── Fiche 7 — GROUPE LUCRATIF NATIONAL (proxy : commercial × grand EJ) ────────
export type GroupeLucratif = 'groupe' | 'independant';

/** Seuil de taille d'entité juridique au-delà duquel on parle de « grand groupe ». */
export const GROUPE_LUCRATIF_EJ_MIN = 50;

/**
 * Proxy « groupe lucratif national ». « Lucratif » =
 * statut juridique HAS « Privé commercial » (fiable, FINESS-fondé). « Groupe
 * national » approximé par la taille de l'entité juridique (FINESS) :
 *   - commercial & EJ ≥ 50 → 'groupe' ;
 *   - commercial & EJ = 1 (mono) → 'independant' ;
 *   - le reste (non commercial, ou commercial EJ 2-49) → exclu (null).
 * Caveat fort : l'ej_size mesure UNE entité juridique, pas le groupe corporate.
 */
export function groupeLucratifFromStatutEj(
  statut: string | null | undefined,
  ejSize: number | null | undefined,
): GroupeLucratif | null {
  if ((statut ?? '').trim() !== 'Privé commercial') return null;
  if (ejSize === null || ejSize === undefined || Number.isNaN(ejSize)) return null;
  if (ejSize >= GROUPE_LUCRATIF_EJ_MIN) return 'groupe';
  if (ejSize === 1) return 'independant';
  return null;
}

export const GROUPE_LUCRATIF_CONTRASTS: AxisContrast[] = [
  {
    id: 'groupe_vs_independant',
    label: 'Groupe lucratif national vs commercial indépendant',
    reference: 'independant',
    target: 'groupe',
  },
];

// ─── Cadre générique : raw rows → catégorie → rapports par contraste ──────────
export type CategoryDeriver = (row: RawMonoMultiExtractRow) => string | null;

/** Mappe les lignes brutes en lignes catégorielles (drop si cabinet ou catégorie absent). */
function toCategoricalRows(raw: RawMonoMultiExtractRow[], derive: CategoryDeriver): CategoricalRow[] {
  const out: CategoricalRow[] = [];
  for (const r of raw) {
    const cabinet = r.cabinet ?? null;
    const category = derive(r);
    if (!cabinet || !category) continue;
    out.push({ cabinet, score: Number(r.score), category });
  }
  return out;
}

/** Un rapport par contraste (synthèse + CSV nominatif) à partir de lignes déjà catégorisées. */
export function analyzeCategoricalAxisByCabinet(
  raw: RawMonoMultiExtractRow[],
  derive: CategoryDeriver,
  contrasts: AxisContrast[],
): ContrastReport[] {
  const rows = toCategoricalRows(raw, derive);
  return contrasts.map((c) => {
    const results = analyzeContrastByCabinet(rows, c);
    return { id: c.id, label: c.label, summary: summarizeCabinetAxis(results), results };
  });
}

/** Écarts nationaux bruts par contraste (chiffres de tête de la fiche). */
export function nationalGapsForAxis(
  raw: RawMonoMultiExtractRow[],
  derive: CategoryDeriver,
  contrasts: AxisContrast[],
): { label: string; gap: number | null }[] {
  const rows = toCategoricalRows(raw, derive);
  return contrasts.map((c) => ({ label: c.label, gap: nationalContrastGap(rows, c) }));
}

// ─── Gap NATIONAL AJUSTÉ (option 1) ───────────────────────────────────────────
/** Dimensions de contrôle disponibles (jamais l'axe lui-même ni un colinéaire). */
export type ControlDim = 'secteur' | 'statut' | 'region';

function controlValue(r: RawMonoMultiExtractRow, dim: ControlDim): string {
  if (dim === 'secteur') return secteurFromCode(r.code);
  if (dim === 'statut') return (r.statut ?? '').trim() || '(inconnu)';
  return (r.region ?? '').trim() || '(inconnue)';
}

const meanOf = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
/** Écart-type d'échantillon (ddof=1, comme pandas .std()). NaN si < 2 valeurs. */
const sampleStdOf = (xs: number[]): number => {
  if (xs.length < 2) return NaN;
  const m = meanOf(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) * (v - m), 0) / (xs.length - 1));
};

/** Ingrédients de la table « Données de calcul et vérification » d'un contraste
 *  (par groupe : n/moyenne/écart-type ; + sortie OLS de l'ajusté). Présent dès que
 *  les deux groupes sont observés (les SD sont null si un groupe a < 2 obs). */
export interface ContrastVerif {
  nReference: number;
  nTarget: number;
  meanReference: number;
  meanTarget: number;
  sdReference: number | null;
  sdTarget: number | null;
  /** SE robuste (HC0) du coef ajusté ; null si l'ajustement n'a pas convergé. */
  se: number | null;
  /** t = gapAdj / se ; null si ajustement indisponible. */
  t: number | null;
  /** Colonnes du design OLS → ddl = n − k. null si ajustement indisponible. */
  k: number | null;
  ciLevel: number;
}

export interface StratumGap {
  /** Niveau de la strate (ex. « Public », « Privé commercial »). */
  stratum: string;
  /** Effet ajusté du contraste DANS cette strate (capture les interactions). */
  gap: number | null;
  n: number;
}

export interface AdjustedNationalGap {
  label: string;
  /** Écart brut (différence des moyennes) — conservé en contexte. */
  gapRaw: number | null;
  /** Écart AJUSTÉ (coef OLS de l'indicateur cible, contrôles neutralisés). */
  gapAdj: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  p: number | null;
  /** Effectif du contraste (référence + cible). */
  n: number;
  /** Effet ajusté PAR STRATE (si `stratifyBy`) — révèle l'effet-modification. */
  byStratum?: StratumGap[];
  /** true si l'interaction axe×strate est significative (modèle à interactions). */
  interactionSignificant?: boolean;
  /** Ingrédients de la table de vérification (par groupe + OLS) ; absent si un seul groupe observé. */
  verif?: ContrastVerif;
}

interface PreparedRow {
  category: string | null;
  score: number;
  controls: string[];
  stratum: string;
}

/** Construit les lignes de contraste (référence/cible) à partir d'un sous-ensemble préparé. */
function contrastRows(subset: PreparedRow[], c: AxisContrast) {
  const refScores: number[] = [];
  const tgtScores: number[] = [];
  const rows: AdjustedContrastRow[] = [];
  for (const p of subset) {
    if (p.category === c.reference) {
      refScores.push(p.score);
      rows.push({ score: p.score, isTarget: false, catControls: p.controls });
    } else if (p.category === c.target) {
      tgtScores.push(p.score);
      rows.push({ score: p.score, isTarget: true, catControls: p.controls });
    }
  }
  return { rows, refScores, tgtScores };
}

/**
 * Écarts nationaux AJUSTÉS par contraste : effet propre de l'axe, neutralisant
 * `controlDims` (secteur/statut/région) par OLS — corrige le biais de composition
 * qui, sur certains axes (étab/service, secteur), INVERSE le gap brut. Conserve le
 * gap brut en contexte. Le ou les dim(s) de contrôle excluent l'axe lui-même et
 * toute dimension colinéaire (ex. pas de région pour l'axe DROM).
 *
 * `stratifyBy` (optionnel) : calcule en plus l'effet ajusté DANS chaque niveau de
 * cette dimension (typiquement le statut) → révèle les interactions que l'OLS
 * additif masque (ex. effet secteur +7,9 en public / −10,6 en commercial).
 */
export function adjustedNationalGapsForAxis(
  raw: RawMonoMultiExtractRow[],
  derive: CategoryDeriver,
  contrasts: AxisContrast[],
  controlDims: ControlDim[],
  stratifyBy?: ControlDim,
): AdjustedNationalGap[] {
  const prepared: PreparedRow[] = raw
    .map((r) => ({
      category: derive(r),
      score: Number(r.score),
      controls: controlDims.map((d) => controlValue(r, d)),
      stratum: stratifyBy ? controlValue(r, stratifyBy) : '',
    }))
    .filter((p) => p.category !== null && Number.isFinite(p.score));

  // Index de la dimension de stratification dans controlDims (pour la retirer des
  // contrôles : dans le modèle à interactions, la strate entre via cible×strate).
  const stratIdx = stratifyBy ? controlDims.indexOf(stratifyBy) : -1;

  return contrasts.map((c) => {
    const { rows, refScores, tgtScores } = contrastRows(prepared, c);
    const gapRaw = refScores.length && tgtScores.length ? meanOf(tgtScores) - meanOf(refScores) : null;
    const adj = adjustedContrastGap(rows);

    // Ingrédients de vérification par groupe (mêmes scores que gapRaw) + sortie OLS.
    const verif: ContrastVerif | undefined =
      refScores.length && tgtScores.length
        ? {
            nReference: refScores.length,
            nTarget: tgtScores.length,
            meanReference: meanOf(refScores),
            meanTarget: meanOf(tgtScores),
            sdReference: refScores.length >= 2 ? sampleStdOf(refScores) : null,
            sdTarget: tgtScores.length >= 2 ? sampleStdOf(tgtScores) : null,
            se: adj?.se ?? null,
            t: adj && adj.se ? adj.gap / adj.se : null,
            k: adj?.k ?? null,
            ciLevel: confidenceLevel(),
          }
        : undefined;

    let byStratum: StratumGap[] | undefined;
    let interactionSignificant: boolean | undefined;
    if (stratifyBy) {
      // Modèle à INTERACTIONS (un seul OLS, cible×strate) plutôt que régressions
      // séparées : effets par strate cohérents + test formel de l'interaction.
      const irows: InteractionContrastRow[] = [];
      const nByStratum = new Map<string, number>();
      for (const p of prepared) {
        const isTgt = p.category === c.target;
        if (!isTgt && p.category !== c.reference) continue;
        const cat = stratIdx >= 0 ? p.controls.filter((_, i) => i !== stratIdx) : p.controls;
        irows.push({ score: p.score, isTarget: isTgt, stratum: p.stratum, catControls: cat });
        nByStratum.set(p.stratum, (nByStratum.get(p.stratum) ?? 0) + 1);
      }
      const ir = interactionContrastGaps(irows);
      if (ir) {
        byStratum = ir.strata.map((s) => ({ stratum: s.stratum, gap: s.effect, n: nByStratum.get(s.stratum) ?? 0 }));
        interactionSignificant = ir.anySignificantInteraction;
      }
    }

    return {
      label: c.label,
      gapRaw,
      gapAdj: adj?.gap ?? null,
      ciLow: adj?.ciLow ?? null,
      ciHigh: adj?.ciHigh ?? null,
      p: adj?.p ?? null,
      n: rows.length,
      ...(byStratum ? { byStratum } : {}),
      ...(interactionSignificant !== undefined ? { interactionSignificant } : {}),
      ...(verif ? { verif } : {}),
    };
  });
}

// ─── Dérivateurs au niveau ligne (raw → catégorie) ────────────────────────────
export const deriveCapacity: CategoryDeriver = (r) =>
  capacityBin(r.capacity === null || r.capacity === undefined ? null : Number(r.capacity));
export const deriveSecteur: CategoryDeriver = (r) => secteurFromCode(r.code);
export const deriveEtabService: CategoryDeriver = (r) => etabServiceFromCode(r.code);
export const deriveDrom: CategoryDeriver = (r) => dromFromDepartement(r.departement);
export const deriveSemestre: CategoryDeriver = (r) => semestreFromDate(r.eval_date);
export const deriveRegion: CategoryDeriver = (r) => (r.region ?? '').trim() || null;
export const deriveStatut: CategoryDeriver = (r) => (r.statut ?? '').trim() || null;
export const deriveGroupeLucratif: CategoryDeriver = (r) =>
  groupeLucratifFromStatutEj(r.statut, r.ej_size === null || r.ej_size === undefined ? null : Number(r.ej_size));

// ─── Fonctions par axe (extraction) ──────────────────────────────────────────
export async function analyzeCapacityByCabinetFromProd(prisma: MonoMultiExtractPrisma): Promise<ContrastReport[]> {
  return analyzeCategoricalAxisByCabinet(await extractRaw(prisma), deriveCapacity, CAPACITY_CONTRASTS);
}
export async function analyzeSecteurByCabinetFromProd(prisma: MonoMultiExtractPrisma): Promise<ContrastReport[]> {
  return analyzeCategoricalAxisByCabinet(await extractRaw(prisma), deriveSecteur, SECTEUR_CONTRASTS);
}
export async function analyzeEtabServiceByCabinetFromProd(prisma: MonoMultiExtractPrisma): Promise<ContrastReport[]> {
  return analyzeCategoricalAxisByCabinet(await extractRaw(prisma), deriveEtabService, ETAB_SERVICE_CONTRASTS);
}
export async function analyzeDromByCabinetFromProd(prisma: MonoMultiExtractPrisma): Promise<ContrastReport[]> {
  return analyzeCategoricalAxisByCabinet(await extractRaw(prisma), deriveDrom, DROM_CONTRASTS);
}
export async function analyzeSemestreByCabinetFromProd(prisma: MonoMultiExtractPrisma): Promise<ContrastReport[]> {
  return analyzeCategoricalAxisByCabinet(await extractRaw(prisma), deriveSemestre, SEMESTRE_CONTRASTS);
}

// ─── Fiche 4 — RÉGION (haute cardinalité : contrastes dynamiques top-K) ────────
/** Nombre maximal de régions cibles contrastées (cap lisibilité — 1 CSV/contraste). */
export const REGION_DEFAULT_TOP_K = 5;

/**
 * Construit les contrastes région : référence = région au plus gros volume,
 * cibles = les K régions suivantes par volume décroissant (cap lisibilité).
 */
export function regionContrasts(rows: CategoricalRow[], k: number = REGION_DEFAULT_TOP_K): AxisContrast[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([region]) => region);
  if (ranked.length < 2) return [];
  const reference = ranked[0];
  return ranked.slice(1, 1 + k).map((target) => ({
    id: `region_${slug(target)}_vs_ref`,
    label: `${target} vs ${reference}`,
    reference,
    target,
  }));
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function analyzeRegionByCabinetFromProd(
  prisma: MonoMultiExtractPrisma,
  k: number = REGION_DEFAULT_TOP_K,
): Promise<ContrastReport[]> {
  const raw = await extractRaw(prisma);
  const rows = toCategoricalRows(raw, deriveRegion);
  return regionContrasts(rows, k).map((c) => {
    const results = analyzeContrastByCabinet(rows, c);
    return { id: c.id, label: c.label, summary: summarizeCabinetAxis(results), results };
  });
}

/**
 * Écarts nationaux région AJUSTÉS (fiche 4) : contrastes dynamiques top-K, gap
 * propre de chaque région cible vs la référence, neutralisant secteur + statut
 * (PAS la région, qui est l'axe). Le brut reste en contexte.
 */
export async function adjustedRegionNationalGaps(
  prisma: MonoMultiExtractPrisma,
  k: number = REGION_DEFAULT_TOP_K,
): Promise<AdjustedNationalGap[]> {
  const raw = await extractRaw(prisma);
  const rows = toCategoricalRows(raw, deriveRegion);
  const contrasts = regionContrasts(rows, k);
  return adjustedNationalGapsForAxis(raw, deriveRegion, contrasts, ['secteur', 'statut']);
}

/**
 * Écarts nationaux STATUT juridique AJUSTÉS (fiche 2) : contrastes vs Public,
 * neutralise secteur + région (PAS le statut = axe). Le brut reste en contexte.
 */
export async function adjustedStatutNationalGaps(
  prisma: MonoMultiExtractPrisma,
): Promise<AdjustedNationalGap[]> {
  const raw = await extractRaw(prisma);
  return adjustedNationalGapsForAxis(raw, deriveStatut, STATUT_CONTRASTS, ['secteur', 'region']);
}
