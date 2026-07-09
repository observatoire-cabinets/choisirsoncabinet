/**
 * Contenu éditorial de la FICHE n°012 — Synthèse annuelle (méta).
 * Bilan : cohorte + méta-classement des cabinets par intensité de non-conformité à
 * l'égalité de traitement (nb de dimensions où la notation s'écarte significativement).
 * Détail en PDF joint. ANONYME.
 */
import {
  type FicheContent,
  type CabinetContrastSummary,
} from './fiche-001-content';
import type { FicheBuilderOpts } from './fiche-calendar';
import { alphaValueLabel } from './significance';

export function buildFiche012Content(
  opts: FicheBuilderOpts = {},
  _cabinets: CabinetContrastSummary[] = [],
): FicheContent {
  const hasSource = opts.hasSourceLabel ?? '(snapshot courant)';
  const finessSource = opts.finessSourceLabel ?? '(snapshot courant)';
  return {
    numero: 12,
    titre: 'Synthèse annuelle — bilan de l’Observatoire et méta-classement des cabinets',
    famille: 'Toutes dimensions',
    statut: 'Relue',
    verification: {
      kind: 'meta',
      regle:
        'Axe « non conforme » pour un cabinet = écart Fiable (≥ 30 obs par groupe), d’ampleur notable ' +
        '(Cohen d ≥ 0,2), de MÊME SENS que l’écart ajusté national (garde-fou d’inversion), ET significatif ' +
        `après correction Holm-Bonferroni sur les 7 axes (p < ${alphaValueLabel()}). Méta-classement = nombre d’axes non conformes par cabinet.`,
      renvoi: 'Classement complet, anonyme (cabinet par rang → nombre d’axes) : voir le fichier joint.',
      sources: [
        { libelle: 'HAS / Synaé open_data_par_essms (ODbL)', date: opts.hasSourceLabel ?? null },
        { libelle: 'FINESS national', date: opts.finessSourceLabel ?? null },
      ],
    },
    blocs: {
      pourquoi: [
        'Le bilan annuel HAS publie des moyennes nationales sans synthèse transversale par cabinet.',
        'Cette méta-fiche compte, pour chaque cabinet, sur combien de dimensions sa notation s’écarte',
        'significativement de l’égalité de traitement — un repère d’intensité, toutes dimensions confondues.',
      ].join(' '),

      verdict: [
        'Sur les sept dimensions examinées (taille, statut, secteur, capacité, groupe lucratif, temporel,',
        'établissement/service), le méta-classement compte, pour chaque cabinet, le nombre de dimensions où',
        `sa notation s’écarte de façon fiable, d’ampleur notable (Cohen d ≥ 0,2) et significative après correction Holm-Bonferroni (p < ${alphaValueLabel()}) de l’égalité de traitement ;`,
        'le rang 1 en cumule le plus grand nombre. Le classement complet, anonyme, est en PDF joint —',
        'c’est une mesure d’intensité statistique, pas un verdict sur la qualité des soins.',
      ].join(' '),

      enClair: [
        'Cette méta-fiche dresse le bilan annuel de l’Observatoire : un rappel des écarts observés sur chaque',
        'dimension (taille, statut, secteur, capacité, groupe lucratif, temporel, établissement/service)',
        'et un MÉTA-CLASSEMENT des cabinets selon le nombre de dimensions où leur notation s’écarte',
        'significativement de l’égalité de traitement. Objectif : une vue d’ensemble des pratiques s’écartant',
        'le plus de cette égalité — volontaires ou involontaires. Le score mesure le niveau de satisfaction',
        'des exigences du référentiel par la structure, tel que coté par l’évaluateur, pas la qualité réelle des soins.',
      ].join(' '),
      question: [
        'Hypothèse : certains cabinets concentrent des écarts significatifs sur plusieurs dimensions à la fois.',
        'Enjeu : identifier, toutes dimensions confondues, les organismes dont la pratique s’écarte le plus de',
        'l’homogénéité attendue. Valeur ajoutée : une synthèse transversale absente des publications officielles.',
      ].join(' '),
      methode: [
        `Sources : HAS / Synaé open data (\`open_data_par_essms\`, ${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        'Méta-classement : pour chaque cabinet, nombre de contrastes phares où son écart est Fiable (≥ 30/30),',
        `d’ampleur notable (Cohen d ≥ 0,2), de même sens que l’écart ajusté national, ET significatif après correction Holm-Bonferroni (p < ${alphaValueLabel()}). Les écarts nationaux de chaque fiche d’axe sont rappelés dans leurs`,
        'fiches respectives. Le classement complet est en PDF joint.',
      ].join(' '),
      resultats: [
        'Le PDF joint classe les cabinets par nombre de dimensions non conformes (écart significatif), avec leur niveau',
        'global. Il fait ressortir les cabinets dont la pratique se distingue sur le plus grand nombre de critères.',
      ].join(' '),
      interpretation: [
        'Ce que montre la synthèse : une mesure d’INTENSITÉ (sur combien de dimensions un cabinet s’écarte),',
        'pas sa direction ni son ampleur dimension par dimension. Un nombre élevé signale un cabinet à examiner,',
        'pas un verdict. Les cabinets à faible effectif sortent rarement (palier non fiable), ce qui est volontaire (prudence).',
      ].join(' '),

      ceQueNeDitPas: [
        'Elle ne dit PAS pourquoi un cabinet s’écarte : « non conforme » s’entend au sens statistique (écart',
        'systématique et significatif d’égalité de traitement entre groupes), pas au sens d’une non-conformité',
        'd’accréditation, et il s’agit d’une association sur données publiques, jamais d’une preuve causale.',
        'Elle ne mesure pas la qualité réelle des soins, seulement la cotation de la structure par l’évaluateur (satisfaction des exigences du référentiel).',
        'Enfin, c’est la photographie d’UN snapshot annuel : ni tendance pluriannuelle, ni évolution, ni',
        'comparaison de l’intensité des dimensions entre elles (toutes ne se valent pas).',
      ].join(' '),
      limites: [
        // « sans preuve de » épelé (pas ≠ U+2260, strippé par sanitizeForWinAnsi → sens inversé dans le PDF)
        'Le compte agrège des dimensions hétérogènes (toutes ne se valent pas). Association sans preuve de causalité. L’axe « groupe lucratif » est un PROXY (statut privé commercial croisé avec une grande entité juridique FINESS), pas l’appartenance à un groupe corporate réel.',
        'Cohorte non exhaustive ; région/DROM non inclus dans les contrastes phares ; outcome = cotation de la',
        'structure par l’évaluateur (satisfaction des exigences du référentiel). Synthèse annuelle = photographie d’un snapshot, pas une tendance pluriannuelle.',
      ].join(' '),
      misePerspective: [
        'Le bilan annuel HAS publie des moyennes nationales sans synthèse par cabinet. Cette méta-fiche propose une',
        'lecture transversale, à enrichir de futurs indicateurs (extensible).',
      ].join(' '),
      implications: [
        'Pour le régulateur et les ARS : prioriser un éventuel contrôle qualité des cabinets les plus souvent non conformes,',
        'toutes dimensions confondues. Pour les cabinets : repère d’auto-évaluation. Pour la recherche : base d’un',
        'suivi pluriannuel.',
      ].join(' '),
      annexe: [
        `Données : HAS Synaé \`open_data_par_essms\` (${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        `Méthode : méta-classement par nombre de contrastes Fiable, d’ampleur d≥0,2, de signe cohérent avec l’ajusté national et significatifs après Holm-Bonferroni (p<${alphaValueLabel()}, cf. guide). Classement complet en PDF joint.`,
        'Document généré à partir de données publiques (HAS/FINESS).',
      ].join(' '),
    },
  };
}
