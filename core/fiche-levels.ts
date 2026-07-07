// core/fiche-levels.ts
import type { FicheBlocs } from './fiche-001-content';

/** Escalier de lecture. */
export type FicheNiveau = 'essentiel' | 'pour-comprendre' | 'pour-verifier';

/** Ordre d'affichage des niveaux. */
export const NIVEAU_ORDER: readonly FicheNiveau[] = ['essentiel', 'pour-comprendre', 'pour-verifier'];

/**
 * Libellés affichés des niveaux (séparateurs de section). Préfixés « Niveau N — »
 * pour coller au modèle de référence.
 */
export const NIVEAU_LABELS: Record<FicheNiveau, string> = {
  essentiel: "Niveau 1 — L'essentiel",
  'pour-comprendre': 'Niveau 2 — Pour comprendre',
  'pour-verifier': 'Niveau 3 — Pour vérifier',
};

/**
 * Niveau de chaque bloc. Métadonnée de RENDU pure : clé = nom de bloc, aucune
 * modification de FicheBlocs ni des builders. Record (pas Partial) → le compilateur
 * exige une entrée pour les 10 clés (les 9 + cabinets).
 */
export const BLOC_LEVELS: Record<keyof FicheBlocs, FicheNiveau> = {
  pourquoi: 'essentiel',
  verdict: 'essentiel',
  ceQueNeDitPas: 'pour-comprendre',
  enClair: 'essentiel',
  question: 'pour-comprendre',
  methode: 'pour-verifier', // modèle de réf. : Données et méthode → Niveau 3 (pour vérifier)
  resultats: 'pour-verifier', // modèle de réf. : Résultats → Niveau 3 (pour vérifier)
  interpretation: 'pour-comprendre',
  limites: 'pour-verifier',
  misePerspective: 'pour-verifier',
  implications: 'pour-comprendre', // modèle de réf. : Implications → Niveau 2 (pour comprendre)
  annexe: 'pour-verifier',
  cabinets: 'pour-verifier', // non couvert par le modèle — choix explicite (détail par cabinet)
};

export interface RenderedBloc {
  key: keyof FicheBlocs;
  heading: string;
  body: string;
}

export interface LevelGroup {
  niveau: FicheNiveau;
  label: string;
  blocs: RenderedBloc[];
}

/**
 * Regroupe les blocs PRÉSENTS (non vides) de `blocs` en niveaux ordonnés (NIVEAU_ORDER).
 * Dans chaque niveau, les blocs suivent l'ordre de `order` (le BLOCS du renderer).
 * Un niveau sans bloc présent est OMIS (ex. fiche sans `cabinets` n'ajoute pas de
 * niveau vide). Le renderer consomme directement le résultat.
 */
export function groupBlocsByLevel(
  blocs: FicheBlocs,
  order: ReadonlyArray<{ key: keyof FicheBlocs; heading: string }>,
): LevelGroup[] {
  const groups: LevelGroup[] = [];
  for (const niveau of NIVEAU_ORDER) {
    const items: RenderedBloc[] = [];
    for (const { key, heading } of order) {
      if (BLOC_LEVELS[key] !== niveau) continue;
      const body = blocs[key];
      if (!body) continue; // bloc optionnel absent (cabinets) ou vide
      items.push({ key, heading, body });
    }
    if (items.length > 0) groups.push({ niveau, label: NIVEAU_LABELS[niveau], blocs: items });
  }
  return groups;
}
