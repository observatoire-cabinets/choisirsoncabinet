/**
 * Contenu éditorial de la FICHE n°010 — Spécialisation sectorielle du cabinet (méta).
 * Portefeuille sectoriel par cabinet (secteur dominant, HHI, spécialisé/généraliste)
 * + effet de la spécialisation. Détail en PDF joint. ANONYME.
 */
import {
  type FicheContent,
  type CabinetContrastSummary,
} from './fiche-001-content';
import type { FicheBuilderOpts } from './fiche-calendar';

export function buildFiche010Content(
  opts: FicheBuilderOpts = {},
  _cabinets: CabinetContrastSummary[] = [],
): FicheContent {
  const hasSource = opts.hasSourceLabel ?? '(snapshot courant)';
  const finessSource = opts.finessSourceLabel ?? '(snapshot courant)';
  return {
    numero: 10,
    titre: 'Spécialisation sectorielle du cabinet — portefeuilles et effet sur la notation',
    famille: 'C. Secteur d’activité de la structure évaluée',
    statut: 'Relue',
    verification: {
      kind: 'meta',
      regle:
        'Cabinet « spécialisé » = un secteur ≥ 60 % de ses évaluations ; HHI = somme des carrés des ' +
        'parts sectorielles (0 = diversifié, proche de 1 = mono-secteur). Comparaison DESCRIPTIVE ' +
        '(sans ajustement) des spécialisés vs généralistes — chaque cabinet compte pour un point.',
      renvoi: 'Détail par cabinet (secteur dominant, part, HHI) : voir le fichier joint.',
      sources: [
        { libelle: 'HAS / Synaé open_data_par_essms (ODbL)', date: opts.hasSourceLabel ?? null },
        { libelle: 'FINESS national', date: opts.finessSourceLabel ?? null },
      ],
    },
    blocs: {
      pourquoi: [
        'Certains cabinets concentrent leurs évaluations sur un secteur (personnes âgées, PH adultes,',
        'PH enfants, autres), d’autres évaluent un peu de tout. Cette méta-fiche cartographie ces',
        'portefeuilles et regarde, à titre descriptif, si la spécialisation va de pair avec une manière',
        'de noter particulière — une question d’égalité de traitement absente des publications officielles.',
      ].join(' '),

      verdict: [
        'Constat descriptif : un cabinet est dit « spécialisé » lorsqu’un secteur pèse au moins 60 % de',
        'ses évaluations, « généraliste » sinon ; la fiche met en regard, sans ajustement, le niveau et',
        'l’écart à l’égalité de traitement des deux groupes — chaque cabinet ne comptant que pour un seul',
        'point, ce n’est pas une preuve d’un effet de la spécialisation.',
      ].join(' '),

      enClair: [
        'Cette méta-fiche décrit, pour chaque cabinet, la composition de son portefeuille par secteur',
        '(personnes âgées, PH adultes, PH enfants, autres) et son degré de concentration. Un cabinet est dit',
        '« spécialisé » si un secteur représente au moins 60 % de ses évaluations, sinon « généraliste ». Elle',
        'compare ensuite le comportement de notation des spécialisés et des généralistes. Objectif : repérer',
        'd’éventuelles pratiques non conformes à l’égalité de traitement (écart systématique et significatif',
        'entre groupes) liées à la spécialisation. Le score mesure la conformité',
        'méthodologique, pas la qualité réelle des soins.',
      ].join(' '),
      question: [
        'Hypothèse : la spécialisation d’un cabinet est associée à un comportement de notation particulier',
        '(niveau, intensité de non-conformité à l’égalité de traitement). Enjeu : un effet de spécialisation interrogerait la comparabilité',
        'des évaluations selon le profil du cabinet. Valeur ajoutée : lecture absente des publications officielles.',
      ].join(' '),
      methode: [
        `Sources : HAS / Synaé open data (\`open_data_par_essms\`, ${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        'Portefeuille = répartition des évaluations du cabinet par secteur (dérivé de la catégorie FINESS) ; secteur',
        'dominant + indice de concentration HHI ; étiquette « spécialisé » si la part du secteur dominant ≥ 60 %.',
        'Effet = comparaison descriptive spécialisés vs généralistes (niveau global moyen + nombre moyen d’axes',
        'présentant un écart significatif, dits « non conformes » à l’égalité de traitement). Détail par cabinet en PDF joint.',
      ].join(' '),
      resultats: [
        'Le PDF joint liste, par cabinet, son secteur dominant, sa part dominante, son HHI, son niveau et son profil',
        '(spécialisé/généraliste). La synthèse comparative met en regard les deux groupes : on regarde si les cabinets',
        'spécialisés notent en moyenne plus haut/bas et s’écartent davantage de l’égalité de traitement que les généralistes.',
      ].join(' '),
      interpretation: [
        'Ce que montre la fiche : la structure des portefeuilles (secteur dominant, concentration HHI) et',
        'un éventuel lien DESCRIPTIF entre spécialisation et manière de noter. La « spécialisation » y',
        'reflète le VOLUME d’évaluations par secteur, pas une expertise ni un agrément déclaré. À effectifs',
        'faibles par cabinet, lire le constat avec prudence.',
      ].join(' '),

      ceQueNeDitPas: [
        'Elle ne prouve pas un effet de la spécialisation sur la notation : la comparaison spécialisés /',
        'généralistes est BRUTE (non ajustée du profil des établissements évalués, du statut, de la taille,',
        'du territoire) et purement descriptive — une association, pas une preuve causale. Chaque cabinet',
        'compte pour UN point (son profil agrégé), pas pour une distribution : la fiche ne dit rien de la',
        'dispersion interne d’un cabinet ni de la trajectoire d’une évaluation prise isolément. Et le score',
        'mesure la conformité méthodologique au référentiel, pas la qualité réelle des soins.',
      ].join(' '),
      limites: [
        'Spécialisation mesurée par le volume, pas par l’expertise déclarée. Seuil 60 % conventionnel (paramétrable).',
        'Regroupement sectoriel des catégories FINESS (le niveau « Autres » est hétérogène). Écarts BRUTS,',
        // « sans preuve de » épelé (pas ≠ U+2260, strippé par sanitizeForWinAnsi → sens inversé dans le PDF)
        'association sans preuve de causalité ; cohorte non exhaustive ; outcome = conformité méthodologique.',
      ].join(' '),
      misePerspective: [
        'Aucune statistique officielle ne relie spécialisation du cabinet et notation. Cette fiche ouvre la question',
        'de l’effet d’expérience/de focalisation sectorielle sur l’évaluation externe.',
      ].join(' '),
      implications: [
        'Pour les fédérations sectorielles : repérer si les cabinets spécialisés sur leur secteur ont une pratique',
        'distincte. Pour le régulateur : piste sur l’opportunité d’une rotation ou d’un appariement cabinet/secteur.',
      ].join(' '),
      annexe: [
        `Données : HAS Synaé \`open_data_par_essms\` (${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        'Méthode : portefeuille sectoriel + HHI ; comparaison spécialisés/généralistes. Détail par cabinet en PDF joint.',
        'Document généré à partir de données publiques (HAS/FINESS).',
      ].join(' '),
    },
  };
}
