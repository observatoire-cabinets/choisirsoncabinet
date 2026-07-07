/**
 * Contenu du « Guide des méthodes statistiques » embarqué EN FIN de chaque
 * fiche PDF (le guide doit être dans le PDF, plus
 * seulement référencé). Version condensée et autoportante du guide des
 * méthodes statistiques. ANONYME.
 */

import { alphaValueLabel, ciPercentLabel } from './significance';

export interface GuideSection {
  heading: string;
  body: string;
}

/**
 * FONCTION (pas une constante figée) : la section M3 cite le seuil α et le
 * niveau de confiance courants (cf. significance.ts).
 */
export function guideMethodesSections(): GuideSection[] {
  return [
    {
      heading: 'Principes',
      body:
        // « n’est pas » épelé (pas ≠ U+2260, strippé par sanitizeForWinAnsi → sens inversé dans le PDF)
        'Chaque fiche étudie un axe et son effet sur le score HAS consolidé (échelle 0–100). Le score mesure la ' +
        'conformité méthodologique au référentiel, pas directement la qualité réelle des soins. Une association ' +
        'n’est pas une causalité : on mesure des écarts statistiques sur données publiques, on n’établit pas de ' +
        'lien de cause à effet. Sources publiques et datées (traçabilité). Un écart calculé sur peu ' +
        'd’établissements est instable et signalé comme descriptif.',
    },
    {
      heading: 'Niveau national',
      body:
        'Écart brut = différence des moyennes de score entre le groupe cible et le groupe de référence. Une version ' +
        'ajustée (régression OLS, erreurs-standards robustes) neutralisant région, statut et catégorie ' +
        'corrige le biais de composition. Sur certains axes (secteur, établissement/service), l’ajustement ' +
        'peut réduire, voire inverser, l’écart brut : c’est l’écart ajusté qui fait foi.',
    },
    {
      heading: 'M1 — Écart brut (par cabinet)',
      body:
        // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi dans le rendu PDF)
        'Pour chaque cabinet évaluateur, sur ses seules évaluations : moyenne du score du groupe cible - moyenne du ' +
        'groupe de référence. Vérifiable à la main : deux moyennes, une soustraction.',
    },
    {
      heading: 'M2 — Palier de fiabilité',
      body:
        'Selon les effectifs de chaque groupe : Fiable (≥ 30 dans chaque groupe) → écart interprétable ; Tendance ' +
        '(≥ 10) → indicatif ; Descriptif (sinon) → trop peu d’observations pour conclure. Compter les ' +
        'établissements de chaque groupe suffit à le vérifier.',
    },
    {
      heading: 'M3 — Significativité',
      body:
        'Cohen’s d : taille d’effet = écart ÷ écart-type combiné (repères 0,2 petit / 0,5 moyen / 0,8 grand). ' +
        `p-value : test de Welch (variances inégales) ; l’écart est jugé SIGNIFICATIF si p < ${alphaValueLabel()} (seuil ` +
        'réglable), adapté à une lecture opposable. ' +
        `L’intervalle de confiance à ${ciPercentLabel()} (écart ± z × erreur-standard) est COHÉRENT avec ce seuil : s’il ne ` +
        'contient pas 0, l’écart est significatif — et réciproquement.',
    },
    {
      heading: 'Δ vs national & lecture du classement',
      body:
        // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi dans le rendu PDF)
        'Δ vs national = écart du cabinet - écart national brut (positif : le cabinet creuse l’écart plus que la ' +
        'moyenne ; négatif : moins). Le classement nominatif complet (rang, effectifs, écart, IC, p, Δ national, ' +
        'palier) est fourni en PDF joint, un par contraste. Les paliers descriptifs dominent quand les cabinets ont ' +
        'peu d’évaluations : à lire comme descriptif, jamais comme verdict.',
    },
  ];
}
