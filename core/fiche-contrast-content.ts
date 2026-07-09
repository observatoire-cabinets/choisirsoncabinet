/**
 * Contenu éditorial GÉNÉRIQUE des fiches « contraste » de l'Observatoire
 * (fiches 4 région, 5 secteur, 6 capacité, 7 groupe lucratif, 8 temporel,
 * 9 étab/service, 11 DROM).
 *
 * Toutes ces fiches partagent la même structure que la fiche n°002 (axe
 * catégoriel décomposé en contrastes binaires vs une référence) : chiffres de
 * tête = écarts nationaux bruts par contraste ; restitution par cabinet en
 * synthèse PDF + CSV nominatif joint. Plutôt que 6 fichiers quasi identiques, un
 * builder paramétré par `ContrastFicheConfig` garantit cohérence et anonymat.
 *
 * Lecture DESCRIPTIVE : écarts BRUTS (non ajustés des confondants) sur données
 * publiques. Association ≠ causalité ; le score mesure la conformité au
 * référentiel, pas la qualité réelle des soins. Livrable ANONYME.
 */

import {
  type FicheContent,
  type CabinetContrastSummary,
  frDec,
  frSigned,
  buildCabinetsBloc,
} from './fiche-001-content';
import { buildTwoGroupVerification, type GroupVerifPayload } from './fiche-verification';
import { significanceAlpha, ciLabel } from './significance';
import type { FicheBuilder } from './fiche-calendar';

/** Écart national brut d'un contraste (chiffre de tête). */
export interface ContrastNationalGap {
  label: string;
  /** Écart BRUT (différence des moyennes) — conservé en contexte. */
  gap: number | null;
  /** Écart AJUSTÉ (OLS, contrôles neutralisés) — chiffre de tête quand présent. */
  gapAdj?: number | null;
  ciLow?: number | null;
  ciHigh?: number | null;
  p?: number | null;
  n?: number;
  /** Effet ajusté par strate de statut (interaction) — affiché si divergent. */
  byStatut?: { stratum: string; gap: number | null }[];
  /** Interaction axe×statut statistiquement significative (modèle à interactions). */
  byStatutSignificant?: boolean;
  /** Ingrédients de la table de vérification (par groupe + OLS), exposés par le moteur. */
  verif?: GroupVerifPayload;
}

export interface BuildContrastFicheOpts {
  /** Écarts nationaux par contraste (brut + ajusté), recalculés sur les données. */
  nationalGaps?: ContrastNationalGap[];
  /** Libellé des facteurs neutralisés par l'ajustement (PROPRE à l'axe : exclut
   *  la variable d'axe). Ex. « statut et région » pour la fiche secteur. */
  adjustControls?: string;
  hasSourceLabel?: string;
  finessSourceLabel?: string;
}

/** Paramètres éditoriaux propres à un axe (le reste du gabarit est partagé). */
export interface ContrastFicheConfig {
  numero: number;
  titre: string;
  famille: string;
  /** Défaut : « Brouillon » (généré automatiquement, non encore relu). */
  statut?: string;
  /** Nom de l'axe, ex. « la capacité installée de l'établissement ». */
  axisNoun: string;
  /** Libellé du niveau de référence, ex. « les petits établissements (<30 places) ». */
  referenceLabel: string;
  /** 1–2 phrases d'enjeu propres à l'axe (bloc « la question »). */
  questionSpecific: string;
  /** Description de la décomposition de l'axe (bloc « méthode »). */
  methodeAxis: string;
  /** Limites additionnelles propres à l'axe. */
  limitesExtra: string[];
  /** Implications propres à l'axe (bloc « implications »). */
  implicationsSpecific: string;
  /** Mise en perspective additionnelle (optionnel). */
  misePerspectiveSpecific?: string;
  /**
   * Caveat de PORTÉE propre à l'axe, repris dans `ceQueNeDitPas` (optionnel).
   * Ex. fiche 7 « groupe » : le proxy mesure une entité juridique FINESS, pas le
   * groupe corporate réel → la fiche ne dit rien des groupes opérant via plusieurs EJ.
   */
  caveatPortee?: string;
}

function fgap(g: number | null | undefined): string {
  return g === null || g === undefined ? '—' : `${frSigned(g)} pts`;
}

function isAdjusted(g: ContrastNationalGap): boolean {
  return g.gapAdj !== null && g.gapAdj !== undefined;
}

function shortStatut(s: string): string {
  if (/non lucratif/i.test(s)) return 'non lucratif';
  if (/commercial/i.test(s)) return 'commercial';
  if (/public/i.test(s)) return 'public';
  return s;
}

/**
 * Ventilation « par statut » de l'effet ajusté — affichée SEULEMENT quand les
 * strates divergent nettement (étendue ≥ 3 pts ou changement de signe), pour
 * révéler une interaction que le chiffre global moyenne et masque.
 */
function statutBreakdown(g: ContrastNationalGap): string {
  const by = g.byStatut;
  if (!by || by.length < 2) return '';
  const vals = by.map((b) => b.gap).filter((x): x is number => x !== null && x !== undefined);
  if (vals.length < 2) return '';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const diverges = max - min >= 3 || (min < 0 && max > 0);
  // Affiché si l'écart visible diverge OU si l'interaction est significative.
  if (!diverges && !g.byStatutSignificant) return '';
  const parts = by
    .map((b) => `${shortStatut(b.stratum)} ${b.gap === null || b.gap === undefined ? '—' : frSigned(b.gap)}`)
    .join(' ; ');
  const sig = g.byStatutSignificant ? ' (interaction significative)' : '';
  return ` — par statut : ${parts}${sig}`;
}

function gapsList(gaps: ContrastNationalGap[]): string {
  if (gaps.length === 0) return '—';
  return gaps
    .map((g) => {
      if (!isAdjusted(g)) return `${g.label} ${fgap(g.gap)}`;
      const ci =
        g.ciLow !== null && g.ciLow !== undefined && g.ciHigh !== null && g.ciHigh !== undefined
          ? ` [${ciLabel()} ${frSigned(g.ciLow)} à ${frSigned(g.ciHigh)}]`
          : '';
      return `${g.label} : ajusté ${fgap(g.gapAdj)}${ci} (brut ${fgap(g.gap)})${statutBreakdown(g)}`;
    })
    .join(' ; ');
}

/**
 * Significativité d'un écart ajusté au seuil α courant : on décide sur la
 * p-value (`p < α`). L'IC affiché est à 1−α (cf. `ciLabel`), donc « IC exclut 0 »
 * COÏNCIDE avec la décision ; l'IC sert de secours pour la décision si la p est
 * absente (rare).
 */
function isSignificant(g: ContrastNationalGap): boolean {
  if (g.p !== null && g.p !== undefined) return g.p < significanceAlpha();
  if (g.ciLow !== null && g.ciLow !== undefined && g.ciHigh !== null && g.ciHigh !== undefined) {
    return g.ciLow > 0 || g.ciHigh < 0;
  }
  return false;
}

/**
 * Choisit l'écart « phare » à citer dans le verdict : celui de plus forte
 * amplitude (sur l'ajusté quand il existe, sinon le brut) parmi ceux qui ont une
 * valeur. Renvoie `undefined` si aucun écart chiffré.
 */
function headlineGap(gaps: ContrastNationalGap[]): ContrastNationalGap | undefined {
  const valued = gaps.filter((g) => {
    const v = isAdjusted(g) ? g.gapAdj : g.gap;
    return v !== null && v !== undefined;
  });
  if (valued.length === 0) return undefined;
  const mag = (g: ContrastNationalGap) => Math.abs((isAdjusted(g) ? g.gapAdj : g.gap) as number);
  return valued.reduce((best, g) => (mag(g) > mag(best) ? g : best));
}

/**
 * Verdict (N1) — 1 phrase CITABLE, accroche en tête, avec le CHIFFRE clé.
 * Cite l'écart AJUSTÉ quand il existe (sur les axes secteur/étab-service, le brut
 * peut être de signe opposé — effet de composition — donc on ne cite QUE l'ajusté
 * comme effet propre). Reflète signe, ampleur et significativité ; aucune
 * sur-affirmation (association, pas causalité).
 */
/** « à » + contraction française de l'article initial (à le → au, à les → aux ; sinon « à … »). */
function aContracte(label: string): string {
  if (/^les\s+/i.test(label)) return `aux ${label.replace(/^les\s+/i, '')}`;
  if (/^le\s+/i.test(label)) return `au ${label.replace(/^le\s+/i, '')}`;
  return `à ${label}`; // « la … », « l'… », autres : pas de contraction
}
function parRapportA(label: string): string {
  return `par rapport ${aContracte(label)}`;
}

function buildVerdict(cfg: ContrastFicheConfig, gaps: ContrastNationalGap[], ctrlLabel: string): string {
  const head = headlineGap(gaps);
  if (!head) {
    return [
      `Sur les données disponibles, l’écart de score HAS associé ${aContracte(cfg.axisNoun)} n’est pas chiffrable`,
      'à ce stade (effectifs insuffisants) — la fiche reste descriptive et sans conclusion nationale.',
    ].join(' ');
  }
  const adj = isAdjusted(head);
  const value = (adj ? head.gapAdj : head.gap) as number;
  const sig = adj && isSignificant(head);
  const sens = value >= 0 ? 'un score HAS supérieur' : 'un score HAS inférieur';
  // Accord point/points basé sur la valeur AFFICHÉE (arrondie à 1 déc.), pas la brute,
  // sinon « 2,0 point » (1,96 affiché 2,0 mais brut < 2).
  const ampleur = `d’environ ${frDec(Math.abs(value))} point${Math.round(Math.abs(value) * 10) / 10 >= 2 ? 's' : ''} sur 100`;
  const fiabilite = adj
    ? sig
      ? '— un écart statistiquement solide'
      : '— un écart non significatif statistiquement'
    : '— écart brut, descriptif et non ajusté';
  const ajustMention = adj ? `, à conditions comparables (${ctrlLabel} neutralisés),` : ',';
  return [
    `Sur le contraste le plus marqué de ${head.label}${ajustMention} l’appartenance au groupe cible`,
    `est associée à ${sens} ${ampleur} ${parRapportA(cfg.referenceLabel)} ${fiabilite}.`,
  ].join(' ');
}

/** Pourquoi (N1) — 1-2 phrases : de quoi il s'agit + l'enjeu d'équité. */
function buildPourquoi(cfg: ContrastFicheConfig): string {
  return [
    `Le bilan annuel HAS publie des moyennes nationales sans distinguer le score selon ${cfg.axisNoun}.`,
    'Cette fiche mesure s’il existe un écart systématique — au national comme dans la pratique d’un même',
    'cabinet — et ce qu’il révèle sur l’égalité de traitement lors de l’évaluation externe.',
  ].join(' ');
}

/**
 * Ce que ne dit pas (N2) — limites de PORTÉE. Association ≠ causalité ; score =
 * cotation de la structure par l'évaluateur (satisfaction des exigences), PAS la qualité réelle des soins ; ce que la fiche ne
 * tranche pas (mécanisme, niveau cabinet brut). Reprend le caveat de l'axe si présent.
 */
function buildCeQueNeDitPas(cfg: ContrastFicheConfig, adjusted: boolean): string {
  const parts = [
    'Elle n’établit pas de lien de cause à effet : c’est une association mesurée sur données publiques,',
    'pas une preuve causale. Elle ne mesure pas la qualité réelle des soins, seulement la cotation',
    'de la structure par l’évaluateur (satisfaction des exigences du référentiel).',
    adjusted
      ? 'L’écart national est ajusté des confondants observables, mais le niveau cabinet reste BRUT (non ajusté) — à lire comme descriptif, jamais comme un classement de qualité.'
      : 'Les écarts sont BRUTS (non ajustés des facteurs corrélés : taille, statut, secteur, territoire) et restent descriptifs, jamais un classement de qualité.',
    `Et elle ne dit pas POURQUOI l’écart existe : il peut traduire des différences réelles de fonctionnement liées ${aContracte(cfg.axisNoun)} ou un biais de l’exercice d’évaluation, sans qu’elle puisse trancher.`,
  ];
  if (cfg.caveatPortee) parts.push(cfg.caveatPortee);
  return parts.join(' ');
}

export function buildContrastFicheContent(
  cfg: ContrastFicheConfig,
  opts: BuildContrastFicheOpts = {},
  cabinets: CabinetContrastSummary[] = [],
): FicheContent {
  const gaps = opts.nationalGaps ?? [];
  const hasSource = opts.hasSourceLabel ?? '(snapshot courant)';
  const finessSource = opts.finessSourceLabel ?? '(snapshot courant)';
  const list = gapsList(gaps);
  const adjusted = gaps.some(isAdjusted);
  const ctrlLabel = opts.adjustControls ?? 'les autres facteurs observables';
  const verification = buildTwoGroupVerification(gaps, {
    controls: ctrlLabel,
    sources: [
      { libelle: 'HAS / Synaé open_data_par_essms (ODbL)', date: opts.hasSourceLabel ?? null },
      { libelle: 'FINESS national', date: opts.finessSourceLabel ?? null },
    ],
    note: 'Détail par cabinet : voir le fichier joint.',
  });

  return {
    numero: cfg.numero,
    titre: cfg.titre,
    famille: cfg.famille,
    statut: cfg.statut ?? 'Brouillon',
    blocs: {
      verdict: buildVerdict(cfg, gaps, ctrlLabel),
      pourquoi: buildPourquoi(cfg),
      ceQueNeDitPas: buildCeQueNeDitPas(cfg, adjusted),

      enClair: [
        `Le score HAS consolidé (échelle 0–100) varie selon ${cfg.axisNoun}.`,
        `En prenant ${cfg.referenceLabel} comme référence, ${
          adjusted
            ? `les écarts ajustés (régression OLS neutralisant ${ctrlLabel} ; écart brut entre parenthèses)`
            : 'les écarts bruts observés'
        } sont : ${list}.`,
        adjusted
          ? 'L’ajustement isole l’effet propre de l’axe du biais de composition (qui, sur certains axes, inverse le signe de l’écart brut).'
          : 'Ces écarts sont BRUTS (non ajustés des autres facteurs) et descriptifs.',
        'Surtout, ils varient fortement d’un cabinet évaluateur à l’autre — la fiche révèle, pour chacun,',
        'comment il note les différents groupes. Le score mesure le niveau de satisfaction des exigences du',
        'référentiel par la structure, tel que coté par l’évaluateur, pas directement la qualité réelle des soins.',
      ].join(' '),

      question: [
        cfg.questionSpecific,
        'Enjeu : un écart systématique — au national comme au niveau d’un cabinet — interroge l’égalité',
        'de traitement lors de l’évaluation, que l’écart traduise des différences réelles de',
        'fonctionnement ou un biais de l’exercice.',
        'Valeur ajoutée : le bilan annuel HAS ne publie pas cette lecture croisée aux cabinets',
        'évaluateurs sur données publiques.',
      ].join(' '),

      methode: [
        `Sources : HAS / Synaé open data (\`open_data_par_essms\`, extraction du ${hasSource}, licence ODbL)`,
        `et répertoire FINESS national (${finessSource}).`,
        cfg.methodeAxis,
        'Outcome : score consolidé « moyenne des objectifs ramenée à 100 ».',
        adjusted
          ? `Niveau national : écart AJUSTÉ par régression OLS (neutralise ${ctrlLabel}), erreurs-standards robustes ; l’écart brut (différence des moyennes) est indiqué en contexte.`
          : 'Niveau national : écart brut = différence des moyennes entre groupes.',
        'Niveau cabinet : pour chaque organisme évaluateur, écart sur ses seules évaluations (M1),',
        'palier de fiabilité selon l’effectif (M2), test de significativité Cohen’s d + IC + Welch (M3).',
        'Voir le guide des méthodes statistiques.',
      ].join(' '),

      resultats: [
        `${adjusted ? 'Au national (écarts ajustés ; brut en contexte)' : 'Au national (écarts bruts)'} : ${list}.`,
        adjusted
          ? 'Comment lire chaque contraste : l’écart « ajusté » est la meilleure estimation, en points sur 100, à conditions comparables (facteurs neutralisés) ; la fourchette entre crochets (intervalle de confiance) encadre le vrai écart le plus vraisemblable — si elle contient 0, l’écart n’est pas établi ; l’écart « brut » entre parenthèses est celui observé avant neutralisation des autres facteurs.'
          : 'Comment lire : chaque écart est exprimé en points sur 100 ; positif = le groupe cible est mieux noté que la référence, négatif = moins bien noté.',
        'La dispersion entre cabinets est l’information centrale : certains notent nettement plus haut',
        'tel groupe, d’autres l’inverse. Le détail nominatif — rang, effectifs, écart, intervalle de',
        'confiance, p-value, palier de fiabilité — figure dans le ou les fichiers joints, et la',
        'synthèse par contraste est résumée ci-dessous.',
      ].join(' '),

      interpretation: [
        `Ce que le résultat montre : une association entre ${cfg.axisNoun} et le score, et surtout une`,
        'hétérogénéité des pratiques d’un cabinet à l’autre sur ce critère.',
        adjusted
          ? 'L’écart national est ajusté des confondants observables ; le niveau cabinet reste brut.'
          : 'À ce stade les écarts ne sont pas ajustés des autres facteurs (taille, statut, secteur, territoire).',
        'Les écarts d’un cabinet à faible effectif sont à lire comme descriptifs (palier le plus prudent).',
        'Les limites de portée (causalité, qualité réelle des soins, mécanisme) sont détaillées dans « ce que cette fiche ne dit pas ».',
      ].join(' '),

      limites: [
        adjusted
          ? 'Niveau national AJUSTÉ (OLS, contrôles secteur/statut/région) : l’écart isolé approche l’effet propre de l’axe. Le niveau CABINET reste BRUT (effectifs par cabinet trop faibles pour un ajustement fiable) — à lire comme descriptif.'
          : 'Écarts BRUTS non ajustés : un écart peut refléter d’autres facteurs corrélés (taille, statut, secteur, territoire). Une version ajustée (OLS multivarié) est une amélioration prévue.',
        'Causalité non démontrée ; association sur données publiques.',
        'Cohorte non exhaustive : seuls les établissements déjà évalués figurent.',
        'Outcome = cotation de la structure par l’évaluateur (satisfaction des exigences du référentiel), pas la qualité de soin réelle.',
        'Effectifs par cabinet souvent faibles → beaucoup de paliers descriptifs, à ne pas',
        'sur-interpréter.',
        ...cfg.limitesExtra,
      ].join(' '),

      misePerspective: [
        'Le bilan annuel HAS publie des moyennes nationales sans cette lecture conjointe axe × cabinet ;',
        'la présente fiche éclaire la question d’équité de traitement lors de l’évaluation externe.',
        ...(cfg.misePerspectiveSpecific ? [cfg.misePerspectiveSpecific] : []),
        'Comparaison internationale et littérature (HAL / Cairn sur la régulation du médico-social) à',
        'compléter en accès ouvert.',
      ].join(' '),

      implications: [
        cfg.implicationsSpecific,
        'Pour les cabinets évaluateurs : invitation à vérifier l’homogénéité d’exigence entre groupes.',
        'Pour le régulateur : suggestion d’introduire cette stratification dans les statistiques',
        'publiques annuelles.',
      ].join(' '),

      annexe: [
        `Données : HAS Synaé \`open_data_par_essms\` (${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        adjusted
          ? 'Méthode : écart national ajusté OLS (contrôles secteur/statut/région), SE robustes ; par cabinet M1/M2/M3 brut (cf. guide).'
          : 'Méthode : écarts bruts par contraste (national) ; par cabinet M1/M2/M3 (cf. guide).',
        'Reproductibilité : chiffres recalculés sur le snapshot courant ; classement complet en fichier joint.',
        'Document généré à partir de données publiques (HAS/FINESS).',
      ].join(' '),
      ...(cabinets.length ? { cabinets: buildCabinetsBloc(cabinets) } : {}),
    },
    ...(verification ? { verification } : {}),
  };
}

/** Adapte un builder de fiche (signature du calendrier) à partir d'une config. */
export function makeContrastFicheBuilder(cfg: ContrastFicheConfig): FicheBuilder {
  return (opts, cabinets) => buildContrastFicheContent(cfg, opts, cabinets ?? []);
}

// ─── Les 7 configs « fiches saines » ──────────────────────────────────────────
export const CONTRAST_FICHE_CONFIGS: Readonly<Record<number, ContrastFicheConfig>> = {
  4: {
    numero: 4,
    statut: 'Relue',
    titre: 'Effet régional — l’écart de score HAS entre régions',
    famille: 'D. Territoire d’implantation de la structure évaluée',
    axisNoun: 'la région d’implantation de la structure',
    referenceLabel: 'la région au plus grand nombre d’évaluations',
    questionSpecific:
      'Hypothèse : la cotation HAS varie d’une région à l’autre, au national comme dans la pratique d’un même cabinet opérant sur plusieurs régions.',
    methodeAxis:
      'Axe : région d’implantation (libellé FINESS). Pour rester lisible, la fiche contraste les principales régions par volume à la région de référence (la plus dotée en évaluations) ; le nombre de régions cibles est plafonné.',
    limitesExtra: [
      'Nombre de régions cibles plafonné (cap de lisibilité) : les régions de plus faible volume ne font pas l’objet d’un contraste dédié.',
      'Un cabinet n’opérant que sur une seule région n’a pas d’écart régional calculable (palier descriptif).',
    ],
    implicationsSpecific:
      'Pour les ARS : visualiser les écarts inter-régionaux d’un même cabinet. Pour les cabinets nationaux : repère d’homogénéité géographique de leurs cotations.',
  },
  5: {
    numero: 5,
    statut: 'Relue',
    titre: 'Secteur d’accompagnement — l’écart de score HAS (âgées, handicap, autres)',
    famille: 'C. Secteur d’activité de la structure évaluée',
    axisNoun: 'le secteur d’accompagnement de la structure',
    referenceLabel: 'le secteur personnes âgées (PA)',
    questionSpecific:
      'Hypothèse : la cotation HAS diffère selon le secteur d’accompagnement (personnes âgées ; personnes handicapées adultes ; personnes handicapées enfants ; autres).',
    methodeAxis:
      'Axe : secteur dérivé de la catégorie d’établissement FINESS, regroupée en quatre niveaux (PA / PH adultes / PH enfants / Autres), décomposé en trois contrastes vs le secteur personnes âgées. Les services à domicile (aide, soins) sont rangés en « Autres ».',
    limitesExtra: [
      'Le regroupement des ~80 catégories FINESS en quatre secteurs comporte des choix : le niveau « Autres » est hétérogène (protection de l’enfance, inclusion sociale, addictologie, services à domicile).',
    ],
    implicationsSpecific:
      'Pour les fédérations sectorielles : visualiser si un secteur est systématiquement noté différemment par tel cabinet. Pour les ARS : repère d’équité inter-secteurs.',
  },
  6: {
    numero: 6,
    statut: 'Relue',
    titre: 'Capacité de l’établissement — l’écart de score HAS selon la taille',
    famille: 'A. Taille et structure de l’organisation évaluée',
    axisNoun: 'la capacité installée de l’établissement (nombre de lits ou de places)',
    referenceLabel: 'les petits établissements (moins de 30 places)',
    questionSpecific:
      'Hypothèse : la cotation HAS varie avec la capacité installée de l’établissement (petit <30, moyen 30–99, grand ≥100 places).',
    methodeAxis:
      'Axe : capacité installée (somme des places FINESS, source « équipements sociaux et médico-sociaux », hors installations supprimées), discrétisée en trois classes (petit <30 / moyen 30–99 / grand ≥100), décomposée en deux contrastes vs les petits établissements.',
    limitesExtra: [
      'Capacité = capacité installée FINESS, qui peut différer de la capacité autorisée ou réellement occupée.',
      'Les établissements sans capacité FINESS appariée sont exclus de cette fiche.',
    ],
    implicationsSpecific:
      'Pour les petites structures : repère sur un éventuel désavantage de taille à l’évaluation. Pour les ARS et fédérations : visualiser si la taille module la sévérité d’un cabinet.',
  },
  7: {
    numero: 7,
    statut: 'Relue',
    titre: 'Groupe lucratif national — l’écart de score HAS vs commercial indépendant',
    famille: 'A. Taille et structure de l’organisation évaluée',
    axisNoun: 'l’appartenance à un grand groupe privé commercial (vs un établissement commercial indépendant)',
    referenceLabel: 'les établissements privés commerciaux indépendants (mono-établissement)',
    questionSpecific:
      'Hypothèse : au sein du secteur privé commercial, la cotation HAS diffère entre les établissements appartenant à un grand groupe national et les établissements indépendants.',
    methodeAxis:
      'Axe : au sein du seul secteur privé commercial, contraste entre « grand groupe » (entité juridique FINESS d’au moins 50 établissements, proxy d’un groupe national) et « indépendant » (entité juridique mono-établissement). Les établissements commerciaux d’entité juridique intermédiaire (2 à 49) sont exclus, comme les structures publiques et non lucratives.',
    limitesExtra: [
      'CAVEAT FORT sur l’identification du « groupe » : la taille mesure UNE entité juridique FINESS, pas le groupe corporate réel. Un groupe national opère via plusieurs entités juridiques → son périmètre est sous-estimé, et certains « grands EJ » ne sont pas des groupes nationaux.',
      'L’identification par nom est inopérante (les raisons sociales ne portent quasiment jamais le nom du groupe). Une identification rigoureuse passerait par le SIREN et les contours de groupes INSEE — non mobilisés ici.',
      'En revanche le caractère « lucratif/commercial » est fiable (statut juridique, FINESS-fondé). Le proxy ne porte que sur la dimension « groupe national ».',
    ],
    implicationsSpecific:
      'Pour les fédérations du secteur commercial : visualiser si les grands groupes sont notés différemment des indépendants par tel cabinet. Pour le régulateur : piste sur un éventuel effet de standardisation/mutualisation des grands groupes à l’évaluation.',
    caveatPortee:
      'Enfin, le « groupe » est ici un PROXY : la taille mesure une entité juridique FINESS, pas le groupe corporate réel — un groupe national opérant via plusieurs entités juridiques voit son périmètre sous-estimé. La fiche ne dit donc rien de fiable sur ces groupes-là, seulement sur le contraste « grande EJ » vs « EJ mono-établissement » au sein du commercial.',
  },
  8: {
    numero: 8,
    statut: 'Relue',
    titre: 'Effet temporel — l’écart de score HAS entre premier et second semestre',
    famille: 'E. Cabinet et conditions d’évaluation',
    axisNoun: 'le semestre de clôture de l’évaluation',
    referenceLabel: 'le premier semestre (janvier–juin)',
    questionSpecific:
      'Hypothèse : la cotation HAS diffère selon le moment de l’année où l’évaluation est clôturée (premier vs second semestre).',
    methodeAxis:
      'Axe : semestre de la date de clôture technique de l’évaluation (S1 janvier–juin / S2 juillet–décembre), un contraste S2 vs S1. L’écart est AJUSTÉ DE L’ANNÉE de clôture : sans cela, S1/S2 serait confondu par la baisse pluriannuelle des scores (le brut, quasi nul, masque un effet intra-année).',
    limitesExtra: [
      'L’écart S1/S2 est ajusté de l’année de clôture (la baisse pluriannuelle des scores, sinon confondante, est neutralisée) ; l’effet propre restant est de FAIBLE AMPLEUR même s’il est statistiquement net. Le semestre repose sur la date de clôture technique, qui peut différer de la date de la visite.',
    ],
    implicationsSpecific:
      'Pour les cabinets : repère sur une éventuelle dérive de sévérité en cours d’année (montée en charge, fin d’année). Pour le régulateur : piste de contrôle de stabilité temporelle.',
  },
  9: {
    numero: 9,
    statut: 'Relue',
    titre: 'Établissement vs service — l’écart de score HAS selon le mode d’accompagnement',
    famille: 'C. Secteur d’activité de la structure évaluée',
    axisNoun: 'le mode d’accompagnement (établissement avec hébergement vs service)',
    referenceLabel: 'les établissements',
    questionSpecific:
      'Hypothèse : la cotation HAS diffère entre établissements (accueil / hébergement) et services (intervention à domicile ou ambulatoire : SAAD, SSIAD, SESSAD, SAVS, SAMSAH…).',
    methodeAxis:
      'Axe : type de structure dérivé de la catégorie FINESS — établissement vs service — un contraste service vs établissement. Les ESAT sont classés établissements.',
    limitesExtra: [
      'La distinction établissement/service est dérivée de la catégorie FINESS ; quelques catégories mixtes relèvent d’un choix de classement (ESAT → établissement).',
    ],
    implicationsSpecific:
      'Pour les fédérations du domicile : visualiser si les services sont notés différemment des établissements par tel cabinet. Pour les ARS : repère d’équité entre modes d’accompagnement.',
  },
  11: {
    numero: 11,
    statut: 'Relue',
    titre: 'Outre-mer vs métropole — l’écart de score HAS',
    famille: 'D. Territoire d’implantation de la structure évaluée',
    axisNoun: 'l’implantation en outre-mer (DROM/COM) ou en métropole',
    referenceLabel: 'la métropole',
    questionSpecific:
      'Hypothèse : la cotation HAS diffère entre les structures d’outre-mer (DROM/COM) et de métropole.',
    methodeAxis:
      'Axe : territoire dérivé du code département : sont classés outre-mer (DROM/COM) les codes à préfixe 97/98 ET les codes lettrés 9A–9F que l’open data HAS utilise pour l’outre-mer (9A Guadeloupe … 9F Mayotte) ; un contraste DROM vs métropole.',
    limitesExtra: [
      'Les effectifs ultramarins sont faibles : la plupart des contrastes par cabinet seront en palier descriptif.',
    ],
    implicationsSpecific:
      'Pour les ARS d’outre-mer : repère sur un éventuel écart systématique de cotation. Pour le régulateur : piste d’équité territoriale.',
  },
};
