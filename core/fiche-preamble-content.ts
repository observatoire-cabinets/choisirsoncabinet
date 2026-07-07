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
    "important : le score mesure la conformité méthodologique de l'évaluation, pas la " +
    "qualité réelle des soins ; et une association observée entre deux facteurs n'établit " +
    "pas un lien de cause à effet.",
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
    { terme: 'Écart brut', definition: "Différence de notation moyenne entre deux groupes, sans ajustement (méthode M1)." },
    { terme: 'Palier de fiabilité', definition: "Qualifie la robustesse d'un écart selon l'effectif disponible : Fiable, Tendance, ou Descriptif (méthode M2)." },
    { terme: 'Significativité', definition: `Test statistique (d de Cohen, intervalle de confiance à ${ciPercentLabel()}, test de Welch) indiquant si un écart dépasse vraisemblablement le hasard, au seuil alpha = ${alphaValueLabel()} (méthode M3).` },
    { terme: 'Conformité méthodologique', definition: "Respect de la méthode d'évaluation attendue ; ce n'est pas une mesure directe de la qualité des soins prodigués." },
  ];
}
