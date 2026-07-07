// core/fiche-verification.ts
//
// « Données de calcul et vérification » — structure attachée à FicheContent EN
// PARALLÈLE de `blocs` (comme le glossaire : pur-rendu, HORS serializeFicheContent et
// HORS datasetHash). Objectif : exposer SUR la
// fiche les ingrédients du calcul, pour que chacun contrôle l'exactitude et puisse
// REFAIRE le calcul à la main. Anonyme par construction : ne porte que
// des libellés dérivés (groupes, axes, sources), aucun identifiant d'origine — le
// cœur n'en manipule aucun (strippé à la copie du moteur).

/** Une ligne de groupe d'une table de vérification à 2 groupes. */
export interface VerifGroupRow {
  /** Libellé du groupe, ex. « Multi », « Mono ». */
  label: string;
  n: number;
  /** Moyenne brute du groupe (échelle 0–100). null si groupe absent. */
  mean: number | null;
  /** Écart-type d'échantillon (ddof=1). null si n < 2 (non calculable). */
  sd: number | null;
}

/** Bloc « ajusté » = sortie OLS reproductible du coefficient de la cible. */
export interface VerifAdjusted {
  beta: number; // coefficient OLS de l'indicateur cible
  se: number; // erreur-standard robuste
  t: number; // = beta / se
  ddl: number; // N − k (informatif ; p nationale via approximation normale)
  ciLow: number;
  ciHigh: number;
  ciLevel: number; // ex. 0.99 (= 1 − α)
  p: number;
  /** Méthode de la p : « normale » au national (N grand), « welch » au cabinet. */
  pMethod: 'normale' | 'welch';
  /** Type d'erreur-standard robuste, pour traçabilité. */
  seType: 'HC0' | 'HC3';
  /** Facteurs neutralisés, ex. « région, statut, catégorie ». */
  controls: string;
  /** k = nombre de colonnes du design (intercept + cible + dummies + continus). */
  k: number;
}

export interface VerifSource {
  libelle: string; // ex. « HAS / Synaé open_data_par_essms (ODbL) »
  date: string | null; // snapshot, ex. « 01/07/2026 »
}

/** Un contraste = 2 groupes + écart brut + (optionnel) sortie OLS ajustée. */
export interface VerifContrast {
  label: string; // ex. « Multi vs Mono »
  /** [référence, cible] — ORDRE FIXE. */
  groups: [VerifGroupRow, VerifGroupRow];
  /** Écart BRUT = groups[1].mean − groups[0].mean (invariant testé). null si non calculable. */
  ecartBrut: number | null;
  /** Bloc ajusté OLS (absent si contraste non estimable — un seul groupe). */
  ajuste?: VerifAdjusted;
}

/** FORME UNIFORME — fiches 2-groupes (1, 2, 4, 5, 6, 7, 8, 9, 11). */
export interface TwoGroupVerification {
  kind: 'two-group';
  contrasts: VerifContrast[];
  sources: VerifSource[];
  /** Note de bas de table (ex. « détail par cabinet : voir fichier joint »). */
  note?: string;
}

/**
 * FORME MÉTA — fiches de synthèse / classement (3, 10, 12).
 * Sur la fiche, la RÈGLE de calcul exacte + le
 * RENVOI au fichier détaillé déjà joint. PAS de table de groupe (un cabinet = un
 * point, pas une distribution), PAS de cabinets nommés en ligne.
 */
export interface MetaVerification {
  kind: 'meta';
  /** Règle de calcul exacte (permet le recalcul à la main, ligne par ligne). */
  regle: string;
  /** Renvoi au fichier détaillé joint (matrice / classement complet). */
  renvoi: string;
  sources: VerifSource[];
  note?: string;
}

export type VerificationData = TwoGroupVerification | MetaVerification;

/** Ingrédients par groupe + sortie OLS d'un contraste (exposés par le moteur). */
export interface GroupVerifPayload {
  nReference: number;
  nTarget: number;
  meanReference: number;
  meanTarget: number;
  sdReference: number | null;
  sdTarget: number | null;
  se: number | null;
  t: number | null;
  k: number | null;
  ciLevel: number;
}

/** Un écart national (brut + ajusté) + ses ingrédients de vérification par groupe. */
export interface ContrastVerifInput {
  /** Libellé « Cible vs Référence » (sert à nommer les 2 groupes). */
  label: string;
  gap: number | null; // écart brut
  gapAdj?: number | null;
  ciLow?: number | null;
  ciHigh?: number | null;
  p?: number | null;
  n?: number;
  verif?: GroupVerifPayload;
}

/**
 * Construit une table de vérification 2-groupes à partir d'écarts de contraste.
 * Un contraste sans `verif` (ingrédients par groupe indisponibles) est OMIS ; le
 * bloc ajusté n'est présent que si l'OLS a convergé. Retourne undefined si aucun
 * contraste exploitable (dégradé propre — aucune section rendue).
 */
export function buildTwoGroupVerification(
  gaps: ContrastVerifInput[],
  opts: { controls: string; sources: VerifSource[]; note?: string; seType?: 'HC0' | 'HC3' },
): TwoGroupVerification | undefined {
  const contrasts: VerifContrast[] = [];
  for (const g of gaps) {
    const v = g.verif;
    if (!v) continue;
    const [tgtName, refName] = g.label.split(/\s+vs\s+/i);
    const ajuste: VerifAdjusted | undefined =
      g.gapAdj != null && g.ciLow != null && g.ciHigh != null && g.p != null && v.se != null && v.t != null && v.k != null
        ? {
            beta: g.gapAdj,
            se: v.se,
            t: v.t,
            ddl: (g.n ?? v.nReference + v.nTarget) - v.k,
            ciLow: g.ciLow,
            ciHigh: g.ciHigh,
            ciLevel: v.ciLevel,
            p: g.p,
            pMethod: 'normale',
            seType: opts.seType ?? 'HC0',
            controls: opts.controls,
            k: v.k,
          }
        : undefined;
    contrasts.push({
      label: g.label,
      groups: [
        { label: refName?.trim() || 'Référence', n: v.nReference, mean: v.meanReference, sd: v.sdReference },
        { label: tgtName?.trim() || 'Cible', n: v.nTarget, mean: v.meanTarget, sd: v.sdTarget },
      ],
      ecartBrut: g.gap,
      ajuste,
    });
  }
  if (contrasts.length === 0) return undefined;
  return { kind: 'two-group', contrasts, sources: opts.sources, note: opts.note };
}

/**
 * Tous les textes libres d'une VerificationData — utile pour toute vérification
 * de contenu portant sur les blocs libres, puisque la section `verification` est
 * HORS serializeFicheContent (donc non couverte par la sérialisation du texte
 * principal). L'outil ne porte aucun identifiant d'origine par construction.
 */
export function collectVerificationText(v: VerificationData): string[] {
  const out: string[] = v.sources.map((s) => s.libelle);
  if (v.note) out.push(v.note);
  if (v.kind === 'two-group') {
    for (const c of v.contrasts) {
      out.push(c.label, c.groups[0].label, c.groups[1].label);
      if (c.ajuste) out.push(c.ajuste.controls);
    }
  } else {
    out.push(v.regle, v.renvoi);
  }
  return out;
}
