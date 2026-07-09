// core/fiche-preamble-content.ts

/**
 * Scaffolding éditorial — pur-rendu, anonyme, statique.
 * Rendu directement dans le PDF (fiche-pdf.ts), JAMAIS dans serializeFicheContent
 * (même patron que guide-methodes-content.ts). Anonymat garanti par le test dédié,
 * pas par la garde runtime. N'altère ni les chiffres ni le datasetHash.
 */

import { alphaValueLabel, ciPercentLabel } from './significance';

/** En-tête « Comment lire » injecté en haut de chaque fiche, sous le bandeau-titre. */
export const COMMENT_LIRE: { heading: string; body: string } = {
  heading: 'Comment lire cette fiche',
  body:
    "Cette fiche se lit en trois niveaux, du plus simple au plus détaillé — arrêtez-vous " +
    "au niveau qui vous suffit. « L'essentiel » (niveau 1) donne la conclusion en quelques " +
    "phrases. « Pour comprendre » (niveau 2) expose la question posée, son interprétation " +
    "et les implications. « Pour vérifier » (niveau 3) détaille les données et la méthode, " +
    "les résultats, les limites, la mise en perspective et les métadonnées. Rappel " +
    "important : le score mesure le niveau de satisfaction des exigences du référentiel " +
    "par la structure, tel que coté par l'évaluateur, pas la qualité réelle des soins — " +
    "et comme l'open data ne fournit que le score, pas le contenu du rapport, la justesse " +
    "de la cotation elle-même n'y est pas vérifiable ; de plus, une association observée " +
    "entre deux facteurs n'établit pas un lien de cause à effet. Les termes statistiques (écart ajusté, intervalle de " +
    "confiance, p-value...) sont expliqués en langage courant dans le glossaire ci-dessous " +
    "et dans le guide des méthodes statistiques en fin de document.",
};

export interface GlossaireEntry {
  terme: string;
  definition: string;
}

/**
 * Glossaire des termes méthodo et domaine, canonique et anonyme.
 * FONCTION (pas une constante figée) : l'entrée « Significativité » cite le
 * niveau de confiance / seuil α courants (cf. significance.ts).
 */
export function glossaire(): readonly GlossaireEntry[] {
  return [
    { terme: 'HAS', definition: "Haute Autorité de santé : l'autorité publique qui définit le référentiel d'évaluation des établissements." },
    { terme: 'ESSMS', definition: 'Établissement ou service social ou médico-social (la catégorie qui inclut notamment les EHPAD).' },
    { terme: 'EHPAD', definition: "Établissement d'hébergement pour personnes âgées dépendantes." },
    { terme: 'FINESS', definition: "Répertoire national officiel des établissements sanitaires et sociaux ; chaque établissement y a un identifiant unique." },
    { terme: 'Entité juridique (EJ)', definition: "La structure gestionnaire ; une même entité juridique peut gérer plusieurs établissements." },
    { terme: 'Mono / multi', definition: "Un établissement est « multi » quand son entité juridique gère au moins deux établissements, « mono » sinon." },
    { terme: 'Écart brut', definition: "Différence de notation moyenne entre deux groupes, sans ajustement (méthode M1). Positif = le groupe cible est mieux noté que le groupe de référence." },
    { terme: 'Écart ajusté', definition: "Le même écart recalculé « à profil comparable » : région, statut et catégorie d'établissement neutralisés (régression OLS). Quand brut et ajusté divergent, c'est l'ajusté qui fait foi." },
    { terme: 'Intervalle de confiance (IC)', definition: "Fourchette dans laquelle se situe très vraisemblablement le vrai écart. Si elle contient 0, on ne peut pas exclure qu'il n'y ait aucun écart réel." },
    { terme: 'p-value', definition: "Probabilité d'observer un écart au moins aussi grand s'il n'existait en réalité aucune différence. Plus elle est petite, plus l'écart est crédible — mais une petite p-value ne veut pas dire un grand écart." },
    { terme: 'Palier de fiabilité', definition: "Qualifie la robustesse d'un écart selon l'effectif disponible : Fiable, Tendance, ou Descriptif (méthode M2). Un écart Descriptif peut être spectaculaire et ne rien vouloir dire : trop peu d'observations." },
    { terme: 'Significativité', definition: `Test statistique (d de Cohen, intervalle de confiance à ${ciPercentLabel()}, test de Welch) indiquant si un écart dépasse vraisemblablement le hasard, au seuil alpha = ${alphaValueLabel()} (méthode M3). Significatif = « l'écart existe très probablement », pas « l'écart est grand ».` },
    { terme: 'Score HAS (cotation de la structure)', definition: "Niveau auquel la structure satisfait les exigences du référentiel, tel que coté par l'évaluateur ; ce n'est pas une mesure directe de la qualité des soins prodigués, et comme l'open data ne fournit que le score, pas le contenu du rapport, la justesse de la cotation elle-même n'y est pas vérifiable." },
  ];
}
