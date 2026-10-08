/**
 * Textes partagés décrivant le calcul d'un axe « non conforme » par cabinet
 * (`buildCabinetProfiles`, cabinet-profile.ts) : une seule source pour la fiche 12,
 * la légende de son méta-classement joint et la fiche 3, afin qu'elles ne
 * divergent pas du calcul.
 *
 * Calcul décrit : un axe est « non conforme » s'il réunit quatre conditions
 * cumulatives — palier Fiable (≥ 30 évaluations par groupe), ampleur |d| ≥ EFFECT_SIZE_FLOOR,
 * même sens que l'écart ajusté national, et rejet par la procédure de Holm appliquée,
 * cabinet par cabinet, à la seule famille de ses axes au palier Fiable dotés d'une
 * valeur p (taille de famille variable, de 0 au nombre d'axes phares).
 *
 * Caractères : « ≥ » est translittéré en « >= » par sanitizeForWinAnsi ; aucun
 * caractère supprimé au rendu PDF (pas de ≠, de − ni de lettre grecque).
 */
import { EFFECT_SIZE_FLOOR, PHARE_CONTRASTS } from './cabinet-profile';
import { frDec } from './fiche-001-content';
import { alphaValueLabel } from './significance';

/** Périmètre de la correction de Holm, tel que calculé. */
export function holmParCabinetLabel(): string {
  return (
    'correction de Holm appliquée, pour chaque cabinet, à ses seuls axes au palier Fiable ' +
    `(de 0 à ${PHARE_CONTRASTS.length} axes selon le cabinet)`
  );
}

/**
 * Définition complète d'un axe « non conforme » : les quatre conditions cumulatives.
 * Le seuil est global à la famille d'axes du cabinet (procédure de Holm), et non
 * une comparaison de chaque valeur p brute au seuil.
 */
export function axeNonConformeDefinition(): string {
  return (
    'palier Fiable (≥ 30 évaluations par groupe), ' +
    `ampleur notable (d de Cohen ≥ ${frDec(EFFECT_SIZE_FLOOR, 1)}), ` +
    'même sens que l’écart ajusté national (garde-fou d’inversion), ' +
    `et significatif au seuil global de ${alphaValueLabel()} après ${holmParCabinetLabel()}`
  );
}

/**
 * Rappel court des quatre conditions, pour les blocs de synthèse (verdict) ; la
 * définition complète figure dans la règle de calcul, « Données et méthode » et l'annexe.
 */
export function axeNonConformeResume(): string {
  return (
    'quatre conditions cumulatives (palier Fiable, ampleur notable, même sens qu’au national ajusté, ' +
    `significativité au seuil global de ${alphaValueLabel()} après correction de Holm par cabinet), ` +
    'détaillées dans « Données et méthode »'
  );
}
