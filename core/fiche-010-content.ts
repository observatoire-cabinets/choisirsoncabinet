/**
 * Contenu éditorial de la FICHE n°010 — Spécialisation sectorielle du cabinet (méta).
 * Portefeuille sectoriel par cabinet (secteur dominant, HHI, spécialisé/généraliste)
 * en regard du niveau global brut, cabinet par cabinet (aucune moyenne par groupe
 * n'est calculée ni imprimée). Détail en PDF joint. ANONYME.
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
    titre: 'Spécialisation sectorielle du cabinet — portefeuilles et niveau de notation, cabinet par cabinet',
    famille: 'C. Secteur d’activité de la structure évaluée',
    statut: 'Relue',
    verification: {
      kind: 'meta',
      regle:
        'Cabinet « spécialisé » = un secteur ≥ 60 % de ses évaluations ; HHI = somme des carrés des ' +
        'parts sectorielles (0,25 = réparti également entre les 4 secteurs, 1 = mono-secteur). ' +
        // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi dans le rendu PDF)
        'Niveau = moyenne des scores du cabinet - moyenne nationale (écart BRUT, sans ajustement). ' +
        'Lecture DESCRIPTIVE, cabinet par cabinet : aucune moyenne par groupe ni aucun test ' +
        'spécialisés / généralistes n’est calculé.',
      renvoi: 'Détail par cabinet (secteur dominant, part, HHI, niveau, profil) : voir le fichier joint.',
      sources: [
        { libelle: 'HAS / Synaé open_data_par_essms (ODbL)', date: opts.hasSourceLabel ?? null },
        { libelle: 'FINESS national', date: opts.finessSourceLabel ?? null },
      ],
    },
    blocs: {
      pourquoi: [
        'Certains cabinets concentrent leurs évaluations sur un secteur (personnes âgées, PH adultes,',
        'PH enfants, autres), d’autres évaluent un peu de tout. Cette méta-fiche cartographie ces',
        'portefeuilles et place en regard, cabinet par cabinet et à titre descriptif, le niveau de notation',
        'de chacun — une question d’égalité de traitement absente des publications officielles.',
      ].join(' '),

      verdict: [
        'Constat descriptif : un cabinet est dit « spécialisé » lorsqu’un secteur pèse au moins 60 % de',
        'ses évaluations, « généraliste » sinon ; le fichier joint donne, cabinet par cabinet, ce profil à',
        'côté de son niveau global de notation (écart brut au national), sans moyenne par groupe ni',
        'ajustement — chaque cabinet ne comptant que pour un seul point, ce n’est pas une preuve d’un effet',
        'de la spécialisation.',
      ].join(' '),

      enClair: [
        'Cette méta-fiche décrit, pour chaque cabinet, la composition de son portefeuille par secteur',
        '(personnes âgées, PH adultes, PH enfants, autres) et son degré de concentration. Un cabinet est dit',
        '« spécialisé » si un secteur représente au moins 60 % de ses évaluations, sinon « généraliste ». Elle',
        'place en regard de ce profil le niveau global de notation de chaque cabinet (écart brut au national),',
        'pour une lecture cabinet par cabinet ; elle ne calcule ni moyenne par groupe ni test de différence',
        'entre spécialisés et généralistes. Le score mesure le niveau de satisfaction',
        'des exigences du référentiel par la structure, tel que coté par l’évaluateur, pas la qualité réelle des soins.',
      ].join(' '),
      question: [
        'Question : la spécialisation d’un cabinet va-t-elle de pair avec un niveau de notation particulier ?',
        'La fiche ne la tranche pas par un test : elle fournit, cabinet par cabinet, le profil et le niveau qui',
        'permettent de l’examiner. Enjeu : un effet de spécialisation interrogerait la comparabilité des',
        'évaluations selon le profil du cabinet. Valeur ajoutée : lecture absente des publications officielles.',
      ].join(' '),
      methode: [
        `Sources : HAS / Synaé open data (\`open_data_par_essms\`, ${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        'Portefeuille = répartition des évaluations du cabinet par secteur (dérivé de la catégorie FINESS) ; secteur',
        'dominant + indice de concentration HHI ; étiquette « spécialisé » si la part du secteur dominant ≥ 60 %.',
        // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi dans le rendu PDF)
        'Niveau = moyenne des scores du cabinet - moyenne nationale (écart BRUT, non ajusté du portefeuille).',
        'Aucune moyenne par groupe ni aucun test entre spécialisés et généralistes n’est calculé. Détail par',
        'cabinet en PDF joint, du plus concentré au plus diversifié (HHI décroissant).',
      ].join(' '),
      resultats: [
        'Le PDF joint liste, cabinet par cabinet (HHI décroissant), son nombre d’évaluations, son secteur dominant,',
        'sa part dominante, son HHI, son niveau global (écart brut au national) et son profil (spécialisé/généraliste).',
        'Aucun résultat chiffré par groupe n’est produit : un éventuel lien entre profil et niveau se lit cabinet par cabinet.',
      ].join(' '),
      interpretation: [
        'Ce que montre la fiche : la structure des portefeuilles (secteur dominant, concentration HHI) et,',
        'en regard, le niveau global brut de chaque cabinet — matière à une lecture DESCRIPTIVE, cabinet par',
        'cabinet, sans mesure du lien entre spécialisation et manière de noter. La « spécialisation » y',
        'reflète le VOLUME d’évaluations par secteur, pas une expertise ni un agrément déclaré. À effectifs',
        'faibles par cabinet, lire le constat avec prudence.',
      ].join(' '),

      ceQueNeDitPas: [
        'Elle ne prouve pas un effet de la spécialisation sur la notation : elle ne compare pas statistiquement',
        'les spécialisés et les généralistes, et le niveau de chaque cabinet est BRUT (non ajusté du profil des',
        'établissements évalués, du statut, de la taille, du territoire) — au mieux une association lue',
        'cabinet par cabinet, pas une preuve causale. Chaque cabinet',
        'compte pour UN point (son profil agrégé), pas pour une distribution : la fiche ne dit rien de la',
        'dispersion interne d’un cabinet ni de la trajectoire d’une évaluation prise isolément. Et le score',
        'mesure le niveau de satisfaction des exigences du référentiel par la structure, tel que coté par l’évaluateur, pas la qualité réelle des soins.',
      ].join(' '),
      limites: [
        'Spécialisation mesurée par le volume, pas par l’expertise déclarée. Seuil 60 % conventionnel (paramétrable).',
        'Regroupement sectoriel des catégories FINESS (le niveau « Autres » est hétérogène). Écarts BRUTS,',
        // « sans preuve de » épelé (pas ≠ U+2260, strippé par sanitizeForWinAnsi → sens inversé dans le PDF)
        'association sans preuve de causalité ; cohorte non exhaustive ; outcome = cotation de la structure par l’évaluateur (satisfaction des exigences du référentiel).',
      ].join(' '),
      misePerspective: [
        'Aucune statistique officielle ne relie spécialisation du cabinet et notation. Cette fiche ouvre la question',
        'de l’effet d’expérience/de focalisation sectorielle sur l’évaluation externe.',
      ].join(' '),
      implications: [
        'Pour les fédérations sectorielles : repérer les cabinets spécialisés sur leur secteur et lire leur niveau',
        'cabinet par cabinet. Pour le régulateur : piste sur l’opportunité d’une rotation ou d’un appariement cabinet/secteur.',
      ].join(' '),
      annexe: [
        `Données : HAS Synaé \`open_data_par_essms\` (${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        'Méthode : portefeuille sectoriel + HHI + niveau global brut, cabinet par cabinet ; pas de moyenne par groupe. Détail par cabinet en PDF joint.',
        'Document généré à partir de données publiques (HAS/FINESS).',
      ].join(' '),
    },
  };
}
