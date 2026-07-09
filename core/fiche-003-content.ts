/**
 * Contenu éditorial de la FICHE n°003 — Cartographie de l'effet cabinet (méta).
 * Vue par cabinet : niveau global (écart brut au national) + profil sur 7 axes
 * phares. Le détail (matrice cabinets × axes) est en PDF joint. ANONYME.
 */
import {
  type FicheContent,
  type CabinetContrastSummary,
} from './fiche-001-content';
import type { FicheBuilderOpts } from './fiche-calendar';

export function buildFiche003Content(
  opts: FicheBuilderOpts = {},
  _cabinets: CabinetContrastSummary[] = [],
): FicheContent {
  const hasSource = opts.hasSourceLabel ?? '(snapshot courant)';
  const finessSource = opts.finessSourceLabel ?? '(snapshot courant)';
  return {
    numero: 3,
    titre: 'Cartographie de l’effet cabinet — niveau et profil de chaque organisme évaluateur',
    famille: 'E. Cabinet et conditions d’évaluation',
    statut: 'Relue',
    verification: {
      kind: 'meta',
      regle:
        // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi dans le rendu PDF)
        'Niveau global d’un cabinet = moyenne de ses scores - moyenne nationale (écart BRUT). ' +
        'Profil par axe : écart phare (M1), palier de fiabilité selon l’effectif (M2), ' +
        'significativité par test de Welch (M3).',
      renvoi: 'Matrice complète cabinet × 7 axes (écart, palier, p) : voir le fichier joint.',
      sources: [
        { libelle: 'HAS / Synaé open_data_par_essms (ODbL)', date: opts.hasSourceLabel ?? null },
        { libelle: 'FINESS national', date: opts.finessSourceLabel ?? null },
      ],
    },
    blocs: {
      pourquoi: [
        'Le bilan annuel HAS publie des moyennes sans regarder QUI a réalisé l’évaluation.',
        'Cette méta-fiche cartographie chaque cabinet évaluateur — son niveau global de notation et son',
        'profil sur sept dimensions — pour rendre visible l’hétérogénéité des pratiques et la question',
        'd’équité de traitement qu’elle soulève.',
      ].join(' '),

      verdict: [
        'Les cabinets évaluateurs ne notent pas de façon homogène : il existe un « effet cabinet » —',
        'des niveaux globaux et des profils par dimension dispersés d’un organisme à l’autre — que cette',
        'carte rend visible, sans en établir la cause ni en faire un classement de qualité (écarts BRUTS,',
        'non ajustés de ce que chaque cabinet évalue).',
      ].join(' '),

      ceQueNeDitPas: [
        'Elle ne classe pas les cabinets par qualité : c’est une cartographie DESCRIPTIVE, pas un',
        'palmarès. Le niveau global est un écart BRUT, non ajusté de la composition du portefeuille',
        '(secteur, statut, taille, territoire). Elle ne dit pas POURQUOI un cabinet se distingue ni si l’écart est délibéré :',
        'c’est une association observée sur données publiques, pas une preuve de cause à effet. Enfin, le',
        'score mesure le niveau de satisfaction des exigences du référentiel par la structure, tel que coté par l’évaluateur, pas la qualité réelle des soins ;',
        'beaucoup de paliers sont descriptifs (effectifs faibles par cabinet) et ne valent pas verdict.',
      ].join(' '),

      enClair: [
        'Cette méta-fiche cartographie chaque cabinet évaluateur selon (1) son NIVEAU GLOBAL de notation —',
        'l’écart brut entre la moyenne de ses scores et la moyenne nationale — et (2) son PROFIL sur sept',
        'dimensions (mono/multi, statut, secteur, capacité, groupe lucratif, temporel, établissement/service).',
        'Objectif : rendre visible l’hétérogénéité des cabinets et identifier d’éventuelles pratiques NON',
        'CONFORMES à l’égalité de traitement attendue lors de l’évaluation externe — volontaires ou',
        'involontaires. « Non conforme » s’entend ici au sens strictement statistique (écart fiable, d’ampleur',
        'notable — Cohen d ≥ 0,2 —, significatif après correction Holm-Bonferroni et de même sens qu’au national',
        'ajusté), non au sens d’une non-conformité d’accréditation. Le score mesure le niveau de',
        'satisfaction des exigences du référentiel par la structure, tel que coté par l’évaluateur, pas la qualité réelle des soins.',
      ].join(' '),
      question: [
        'Hypothèse : à profil d’établissements comparable, le choix du cabinet évaluateur influence le score.',
        'Enjeu d’équité : un cabinet systématiquement plus sévère ou plus clément, ou qui traite différemment',
        'certaines catégories, interroge l’égalité de traitement du dispositif d’évaluation externe.',
        'Valeur ajoutée : aucune publication officielle ne croise ainsi niveau et profil par cabinet sur données publiques.',
      ].join(' '),
      methode: [
        `Sources : HAS / Synaé open data (\`open_data_par_essms\`, ${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi dans le rendu PDF)
        'Niveau global = moyenne des scores du cabinet - moyenne nationale (écart BRUT, non ajusté du portefeuille).',
        'Profil = pour chaque axe, l’écart « phare » du cabinet (M1) avec son palier de fiabilité (M2) et sa',
        'significativité (M3 : Cohen’s d + IC + Welch). Région et DROM sont exclus de la matrice (par cabinet, ils',
        'sont le plus souvent non calculables). Voir le guide des méthodes. La matrice complète est en PDF joint.',
      ].join(' '),
      resultats: [
        'Le PDF joint classe les cabinets par niveau global décroissant et donne, pour chacun, son écart phare',
        'et son palier sur chaque axe. La dispersion des niveaux et des profils est l’information centrale :',
        'certains cabinets notent globalement plus haut/bas, d’autres se distinguent surtout sur une dimension précise.',
      ].join(' '),
      interpretation: [
        'Ce que montre la carte : l’existence d’un « effet cabinet » — des niveaux globaux et des profils',
        'par dimension hétérogènes d’un organisme à l’autre. Nuance d’interprétation : ce niveau est BRUT,',
        'donc partiellement confondu par ce que chaque cabinet évalue (un cabinet qui évalue surtout des',
        'segments bas paraît sévère sans l’être) ; un cabinet ne se distingue parfois que sur une seule',
        'dimension. Les limites de portée de cette carte sont détaillées au bloc « Ce que cette fiche ne dit pas ».',
      ].join(' '),
      limites: [
        'Niveau global NON ajusté (portefeuille non neutralisé) — une version ajustée (effets fixes cabinet) est une',
        'amélioration prévue. Région et DROM exclus de la matrice. Cohorte non exhaustive (seuls les évalués figurent).',
        'L’axe « groupe lucratif » est un PROXY (statut privé commercial croisé avec une grande entité juridique FINESS), pas un vrai groupe corporate.',
        'Outcome = cotation de la structure par l’évaluateur (satisfaction des exigences du référentiel), pas la qualité de soin. Effectifs souvent faibles par cabinet → beaucoup de',
        'paliers descriptifs.',
      ].join(' '),
      misePerspective: [
        'Le bilan annuel HAS ne publie pas de lecture par cabinet évaluateur. Cette carte éclaire la question de',
        'l’homogénéité d’exigence entre organismes. Littérature sur la fiabilité inter-évaluateurs à compléter en accès ouvert.',
      ].join(' '),
      implications: [
        'Pour les cabinets : repère d’auto-contrôle de leur niveau et de leur homogénéité. Pour les ARS et le régulateur :',
        'visualiser l’effet cabinet et envisager une harmonisation/un contrôle qualité inter-évaluateurs. Pour les',
        'établissements : comprendre la pratique du cabinet qui les évalue.',
      ].join(' '),
      annexe: [
        `Données : HAS Synaé \`open_data_par_essms\` (${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        'Méthode : niveau brut au national ; profil par cabinet M1/M2/M3 (cf. guide). Matrice complète en PDF joint.',
        'Document généré à partir de données publiques (HAS/FINESS).',
      ].join(' '),
    },
  };
}
