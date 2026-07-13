// core/significance.ts
//
// Seuil de significativité statistique — SOURCE DE VÉRITÉ UNIQUE.
//
// Par défaut α = 0,05 / IC 95 % — bascule possible vers α = 0,01 / IC 99 % via
// `setSignificanceAlpha`.
//
// Périmètre : ce seuil pilote la DÉCISION de significativité (« significatif /
// non conforme »). Les intervalles de confiance suivent COHÉREMMENT à 1−α
// (cf. `confidenceLevel`) → « l'IC exclut 0 » ⟺ « p < α » : pas de cas trompeur.
//
// CONCURRENCE : état global module-level → UNE génération à la fois. Ne pas
// basculer α pendant qu'une génération (fiches/PDF) est en cours : le résultat
// mélangerait les deux seuils. Une future UI devra SNAPSHOTTER α par
// génération plutôt que basculer ce global en vol.
export type Alpha = 0.05 | 0.01;

const ALLOWED: readonly Alpha[] = [0.05, 0.01];

let current: Alpha = 0.05; // α = 0,05 par défaut ; bascule 0,01 disponible

/** Change le seuil de significativité courant. Lève si `alpha` ∉ {0,05 ; 0,01}. */
export function setSignificanceAlpha(alpha: Alpha): void {
  if (!ALLOWED.includes(alpha)) throw new Error(`alpha non supporté: ${alpha}`);
  current = alpha;
}

/** Seuil de significativité courant (défaut 0,05). */
export function significanceAlpha(): number {
  return current;
}

/**
 * Niveau de confiance des intervalles AFFICHÉS = 1 − α. Lié au seuil pour que
 * « IC exclut 0 » et « significatif (p < α) » coïncident — cohérence opposable.
 * (z ≈ 1,96 à α=0,05 ; z ≈ 2,576 à α=0,01.)
 */
export function confidenceLevel(): number {
  return 1 - current;
}

/** Libellé court de l'IC courant, ex. « IC 95 % » / « IC 99 % ». */
export function ciLabel(): string {
  return current === 0.01 ? 'IC 99 %' : 'IC 95 %';
}

/**
 * Libellé court d'un seuil donné, ex. « alpha = 0,05 » / « alpha = 0,01 ».
 * Fonction PURE (aucune lecture de l'état global) : à utiliser quand le seuil
 * est passé en paramètre (rendu insensible aux mutations concurrentes du global).
 * « alpha » ÉPELÉ (pas le glyphe grec α) : ce libellé part dans des PDF
 * WinAnsi (StandardFonts pdf-lib) où `sanitizeForWinAnsi` SUPPRIME α
 * (hors plage 0x20-0xFF, non translittéré) — le glyphe rendait
 * « seuil  = 0,05 » (espace double orphelin) dans le document final.
 */
export function alphaLabelFor(alpha: Alpha): string {
  return alpha === 0.01 ? 'alpha = 0,01' : 'alpha = 0,05';
}

/** Libellé court du seuil courant (délègue à alphaLabelFor — zéro duplication). */
export function alphaLabel(): string {
  return alphaLabelFor(current);
}

/** Valeur nue du seuil α courant en rendu FR, ex. « 0,05 » / « 0,01 ». */
export function alphaValueLabel(): string {
  return current === 0.01 ? '0,01' : '0,05';
}

/** Pourcentage nu du niveau de confiance courant, ex. « 95 % » / « 99 % ». */
export function ciPercentLabel(): string {
  return current === 0.01 ? '99 %' : '95 %';
}
