/**
 * Contenu du « Guide des méthodes statistiques » embarqué EN FIN de chaque
 * fiche PDF (le guide doit être dans le PDF, plus
 * seulement référencé). Version condensée et autoportante du guide des
 * méthodes statistiques. ANONYME.
 *
 * STYLE (décision produit) : chaque section suit trois couches — la question
 * en langage courant, le terme technique et son calcul, puis « ce que ça veut
 * dire / ne veut pas dire » avec un exemple chiffré. Les termes exacts (OLS,
 * Welch, Cohen's d, IC...) sont CONSERVÉS et traduits, jamais supprimés.
 */

import { alphaValueLabel, ciPercentLabel } from './significance';

export interface GuideSection {
  heading: string;
  body: string;
}

/**
 * FONCTION (pas une constante figée) : les sections M3 et « Comment lire »
 * citent le seuil α et le niveau de confiance courants (cf. significance.ts).
 */
export function guideMethodesSections(): GuideSection[] {
  return [
    {
      heading: 'Principes — ce que mesurent ces fiches',
      body:
        // « n’est pas » épelé (pas ≠ U+2260, strippé par sanitizeForWinAnsi → sens inversé dans le PDF)
        'Chaque fiche étudie un axe (taille, statut, région, secteur...) et son lien avec le score HAS ' +
        'consolidé (échelle 0–100). Trois repères avant toute lecture. 1) Le score mesure le niveau de ' +
        'satisfaction des exigences du référentiel par la structure, tel que coté par l’évaluateur, pas ' +
        'directement la qualité réelle des soins — et comme l’open data ne fournit que le score, pas le ' +
        'contenu du rapport, la justesse de la cotation elle-même n’y est pas vérifiable : un ' +
        'établissement peut bien accompagner et mal documenter, ou l’inverse. 2) Une association ' +
        'n’est pas une causalité : on mesure des écarts statistiques sur données publiques, on n’établit ' +
        'pas de lien de cause à effet — constater que deux choses vont ensemble ne dit ni que l’une ' +
        'produit l’autre, ni pourquoi. 3) Un écart calculé sur peu d’établissements est instable : il est ' +
        'signalé comme descriptif et ne permet pas de conclure. Toutes les sources sont publiques et ' +
        'datées (traçabilité).',
    },
    {
      heading: 'Niveau national — écart brut, écart ajusté',
      body:
        'La question : à l’échelle du pays, le groupe étudié est-il noté différemment du groupe de ' +
        'référence ? L’écart brut est la simple différence des moyennes de score entre les deux groupes. ' +
        'L’écart ajusté est le même écart recalculé « à profil comparable » : une régression (OLS, ' +
        'erreurs-standards robustes) neutralise l’effet de la région, du statut et de la catégorie ' +
        'd’établissement, pour ne pas comparer des populations trop différentes. Ce que ça veut dire : ' +
        'si les grands établissements sont plus souvent publics et urbains, un écart brut « grands vs ' +
        'petits » mélange l’effet taille avec l’effet statut et l’effet territoire ; l’ajustement met ' +
        'ces facteurs de côté pour isoler l’effet propre de l’axe. Sur certains axes (secteur, ' +
        'établissement/service), l’ajustement peut réduire, voire inverser, l’écart brut : c’est ' +
        'l’écart ajusté qui fait foi.',
    },
    {
      heading: 'Comment lire une ligne de résultat',
      body:
        // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi dans le rendu PDF)
        `Exemple fictif : « ajusté +2,3 pts [IC ${ciPercentLabel()} : +1,1 à +3,5] (brut +4,0 pts) ». ` +
        'Lecture : à conditions comparables, la meilleure estimation de l’écart est +2,3 points sur 100 ' +
        'en faveur du groupe cible ; le vrai écart se situe très vraisemblablement entre +1,1 et +3,5 ' +
        'points (c’est l’intervalle de confiance) ; avant neutralisation des autres facteurs, l’écart ' +
        'observé était de +4,0 points. Si la fourchette contient 0 (par exemple « de -0,5 à +2,1 »), on ' +
        'ne peut pas exclure qu’il n’y ait aucun écart réel : prudence. Ordre de grandeur : sur une ' +
        'échelle de 0 à 100, un écart de 2 points est modeste, un écart de 5 points est substantiel — ' +
        'à rapporter aussi à la dispersion des scores (cf. M3).',
    },
    {
      heading: 'M1 — Écart brut (par cabinet)',
      body:
        // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi dans le rendu PDF)
        'La question : CE cabinet note-t-il différemment les deux groupes ? Le calcul, vérifiable à la ' +
        'main : sur les seules évaluations du cabinet, moyenne du score du groupe cible - moyenne du ' +
        'groupe de référence. Deux moyennes, une soustraction. Ce que ça veut dire : un écart de +3 ' +
        'signifie que, dans la pratique de ce cabinet, le groupe cible obtient en moyenne 3 points de ' +
        'plus sur 100 que le groupe de référence. Cela ne dit ni pourquoi (portefeuilles différents, ' +
        'territoires différents, sévérité différente...), ni si l’écart est fiable (cf. M2) ou ' +
        'significatif (cf. M3).',
    },
    {
      heading: 'M2 — Palier de fiabilité',
      body:
        'La question : peut-on se fier à cet écart, vu le nombre d’évaluations disponibles ? La règle, ' +
        'selon l’effectif de CHAQUE groupe : Fiable (>= 30 évaluations dans chaque groupe) : écart ' +
        'interprétable ; Tendance (>= 10) : indicatif seulement ; Descriptif (moins de 10) : trop peu ' +
        'd’observations pour conclure. Ce que ça veut dire : une moyenne calculée sur 3 évaluations ' +
        'bouge du tout au tout à la moindre évaluation atypique — un écart descriptif peut être ' +
        'spectaculaire et ne rien vouloir dire. À l’inverse, un écart Fiable repose sur assez ' +
        'd’observations pour être pris au sérieux. Compter les établissements de chaque groupe suffit ' +
        'à vérifier le palier.',
    },
    {
      heading: 'M3 — Significativité : réel ? important ? dans quelle fourchette ?',
      body:
        'Trois questions complémentaires. 1) Le hasard peut-il expliquer l’écart ? C’est la p-value ' +
        '(test de Welch, qui tolère des variances inégales entre groupes) : la probabilité d’observer ' +
        'un écart au moins aussi grand alors qu’en réalité il n’y aurait aucune différence. L’écart est ' +
        `jugé SIGNIFICATIF si p < ${alphaValueLabel()} (seuil réglable, imprimé sur chaque fiche). Ce que ça veut ` +
        'dire : significatif = « cet écart existe très probablement » — pas plus. Cela ne dit ni qu’il ' +
        'est grand, ni qu’il est grave : avec des milliers d’évaluations, un écart minuscule devient ' +
        'significatif. 2) L’écart est-il important en pratique ? C’est la taille d’effet (Cohen’s d) : ' +
        'l’écart rapporté à la dispersion habituelle des scores. Repères : 0,2 petit / 0,5 moyen / ' +
        '0,8 grand. C’est cette mesure qui dit si l’écart « compte », pas la p-value. 3) Dans quelle ' +
        `fourchette se situe le vrai écart ? C’est l’intervalle de confiance à ${ciPercentLabel()} : l’écart ` +
        'estimé accompagné de sa marge d’erreur (calculée avec la loi de Student adaptée aux effectifs, ' +
        'la même que celle de la p-value). Il est COHÉRENT avec le seuil : s’il ne contient pas 0, ' +
        'l’écart est significatif — et réciproquement.',
    },
    {
      heading: 'Δ vs national et lecture du classement',
      body:
        // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi dans le rendu PDF)
        'La question : ce cabinet amplifie-t-il ou atténue-t-il la tendance nationale ? Δ vs national = ' +
        'écart du cabinet - écart national brut. Ce que ça veut dire : si l’écart national est +4 et que ' +
        'ce cabinet affiche +9, son Δ est +5 — il creuse l’écart nettement plus que la moyenne des ' +
        'évaluateurs ; un Δ proche de 0 signifie qu’il suit la tendance nationale ; un Δ négatif, qu’il ' +
        'la contrarie. Un cabinet peut donc afficher un écart positif simplement parce que la tendance ' +
        'nationale l’est : le Δ isole sa contribution propre. Le classement nominatif complet (rang, ' +
        'effectifs, écart, IC, p, Δ national, palier) est fourni en PDF joint, un par contraste. ' +
        'Attention en le lisant : les paliers descriptifs dominent quand les cabinets ont peu ' +
        'd’évaluations — ces lignes se lisent comme descriptives, jamais comme un verdict.',
    },
  ];
}
