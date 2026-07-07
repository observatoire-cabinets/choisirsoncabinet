/**
 * Contenu éditorial de la FICHE n°002 — Effet du statut juridique.
 *
 * Axe = statut juridique de l'ESSMS (Public / Privé à but non lucratif / Privé
 * commercial), décomposé en contrastes vs le PUBLIC (référence). Même cadre et
 * restitution que la fiche n°001 (anonyme par construction — aucun identifiant
 * d'origine) : chiffres de tête recalculés sur les données ;
 * classement nominatif par cabinet en fichier joint ; synthèse par contraste
 * dans le bloc « pratique par cabinet ».
 *
 * Lecture DESCRIPTIVE : écarts BRUTS (non ajustés des confondants) sur données
 * publiques. Association ≠ causalité ; le score mesure la conformité au
 * référentiel, pas la qualité réelle des soins.
 */

import {
  type FicheContent,
  type CabinetContrastSummary,
  frSigned,
  frDec,
  buildCabinetsBloc,
} from './fiche-001-content';
import { buildTwoGroupVerification, type GroupVerifPayload } from './fiche-verification';
import { significanceAlpha, ciLabel } from './significance';

export interface StatutNationalGap {
  /** Libellé du contraste, ex. "Privé commercial vs Public". */
  label: string;
  /** Écart national BRUT (moyenne cible − moyenne référence) — contexte. */
  gap: number | null;
  /** Écart AJUSTÉ (OLS, neutralise secteur + région) — chiffre de tête. */
  gapAdj?: number | null;
  ciLow?: number | null;
  ciHigh?: number | null;
  p?: number | null;
  n?: number;
  /** Ingrédients de la table de vérification (par groupe + OLS), exposés par le moteur. */
  verif?: GroupVerifPayload;
}

export interface BuildFiche002Opts {
  /** Écarts nationaux par contraste (ordre : non lucratif, commercial). */
  statutNational?: StatutNationalGap[];
  hasSourceLabel?: string;
  finessSourceLabel?: string;
}

function fgap(g: number | null | undefined): string {
  return g === null || g === undefined ? '—' : `${frSigned(g)} pts`;
}

function isAdjusted(g: StatutNationalGap | undefined): boolean {
  return !!g && g.gapAdj !== null && g.gapAdj !== undefined;
}

/** Rendu d'un contraste : ajusté + IC en tête, brut en contexte ; sinon brut seul. */
function fgapAdj(g: StatutNationalGap | undefined): string {
  if (!g) return '—';
  if (!isAdjusted(g)) return `brut ${fgap(g.gap)}`;
  const ci =
    g.ciLow !== null && g.ciLow !== undefined && g.ciHigh !== null && g.ciHigh !== undefined
      ? ` [${ciLabel()} ${frSigned(g.ciLow)} à ${frSigned(g.ciHigh)}]`
      : '';
  return `ajusté ${fgap(g.gapAdj)}${ci} (brut ${fgap(g.gap)})`;
}

/** Valeur de tête d'un contraste : l'ajusté s'il existe, sinon le brut. */
function effectiveGap(g: StatutNationalGap | undefined): number | null {
  if (!g) return null;
  if (isAdjusted(g)) return g.gapAdj ?? null;
  return g.gap ?? null;
}

/**
 * Phrase de direction pour le VERDICT (synthèse) : décrit, pour un contraste,
 * le sens et l'ampleur de l'écart sur la valeur de tête (ajustée si disponible).
 * Aucune sur-affirmation : « supérieur / inférieur / au même niveau » selon le
 * signe ; ampleur via la valeur absolue ; significativité signalée si p connue.
 */
function verdictDirection(label: string, g: StatutNationalGap | undefined): string {
  const v = effectiveGap(g);
  if (v === null) return `${label} un écart non chiffrable sur ce snapshot`;
  const mag = `${frDec(Math.abs(v), 1)} pts`;
  const sens =
    v > 0
      ? `un score supérieur d’environ ${mag}`
      : v < 0
        ? `un score inférieur d’environ ${mag}`
        : 'un score au même niveau';
  // Nature de la valeur de tête : « écart brut » explicite si CE contraste n'est pas
  // ajusté, sinon un brut (cas mixte : un contraste converge, l'autre non) serait lu
  // comme ajusté — défaut de défensabilité.
  const nature = isAdjusted(g) ? '' : ' (écart brut)';
  // Significativité : si p connue et > α (cf. significance.ts), on signale la prudence.
  const sig = g && g.p !== null && g.p !== undefined && g.p > significanceAlpha() ? ' (non significatif)' : '';
  return `${label} ${sens}${nature}${sig}`;
}

export function buildFiche002Content(
  opts: BuildFiche002Opts = {},
  cabinets: CabinetContrastSummary[] = [],
): FicheContent {
  const gaps = opts.statutNational ?? [];
  const nonLuc = gaps.find((g) => /non lucratif/i.test(g.label)) ?? gaps[0];
  const comm = gaps.find((g) => /commercial/i.test(g.label)) ?? gaps[1];
  const adjusted = gaps.some(isAdjusted);
  // TOUS les contrastes ajustés (≠ « au moins un ») : seul ce cas autorise à qualifier
  // globalement les valeurs de tête d'« ajustées ». Cas mixte → étiquetage par contraste.
  const allAdjusted = gaps.length > 0 && gaps.every(isAdjusted);
  const hasSource = opts.hasSourceLabel ?? '(snapshot courant)';
  const finessSource = opts.finessSourceLabel ?? '(snapshot courant)';
  const verification = buildTwoGroupVerification(gaps, {
    controls: 'secteur et région',
    sources: [
      { libelle: 'HAS / Synaé open_data_par_essms (ODbL)', date: opts.hasSourceLabel ?? null },
      { libelle: 'FINESS national', date: opts.finessSourceLabel ?? null },
    ],
    note: 'Détail par cabinet : voir le fichier joint.',
  });

  return {
    numero: 2,
    titre: 'Statut juridique — l’écart de score HAS selon public / privé',
    famille: 'B. Statut juridique de la structure évaluée',
    statut: 'Relue',
    blocs: {
      verdict: [
        // ACCROCHE : le message central de la fiche = l'hétérogénéité entre cabinets,
        // pas l'écart national (qui sert de contexte). Les écarts repris ici sont
        // les valeurs de tête réelles (ajustées si disponibles, sinon brutes).
        `Selon le statut juridique, le score HAS varie : par rapport au secteur public,`,
        `le ${verdictDirection('privé à but non lucratif obtient', nonLuc)}`,
        `et le ${verdictDirection('privé commercial obtient', comm)} —`,
        allAdjusted
          ? 'écarts nationaux ajustés (secteur, région) ;'
          : adjusted
            ? 'ajustement national (secteur, région) appliqué quand l’estimation converge ;'
            : 'écarts nationaux bruts ;',
        `mais l’écart varie surtout fortement d’un cabinet évaluateur à l’autre, ce que la fiche`,
        'révèle cabinet par cabinet. Association observée sur données publiques, pas une preuve causale.',
      ].join(' '),

      pourquoi: [
        'Le bilan national de la HAS publie des moyennes sans croiser le statut juridique de',
        'l’établissement (public, privé non lucratif, privé commercial) avec le cabinet qui l’évalue.',
        'Cette fiche mesure l’écart de score par statut et, surtout, comment il diffère d’un',
        'cabinet à l’autre — une question d’égalité de traitement entre secteurs lors de l’évaluation.',
      ].join(' '),

      enClair: [
        'Le statut juridique de l’établissement est associé à des écarts de score HAS consolidé',
        '(échelle 0–100). En prenant le secteur PUBLIC comme référence, le privé à but non lucratif',
        `obtient en moyenne ${fgapAdj(nonLuc)} et le privé commercial ${fgapAdj(comm)}.`,
        allAdjusted
          ? 'L’ajustement (OLS, secteur + région) isole l’effet propre du statut de la composition. Surtout, ces écarts varient'
          : 'Ces écarts sont BRUTS (non ajustés des autres facteurs) et descriptifs. Surtout, ils varient',
        'fortement d’un cabinet évaluateur à l’autre — la fiche révèle, pour chacun, comment il note',
        'le privé par rapport au public. Le score mesure la conformité méthodologique au référentiel,',
        'pas directement la qualité réelle des soins.',
      ].join(' '),

      question: [
        'Hypothèse : la cotation HAS diffère selon le statut juridique de l’établissement (public,',
        'privé non lucratif, privé commercial). Enjeu : un écart systématique — au national comme au',
        'niveau d’un cabinet — interroge l’égalité de traitement entre secteurs lors de l’évaluation,',
        'que l’écart traduise des différences réelles de fonctionnement ou un biais de l’exercice.',
        'Valeur ajoutée : le bilan annuel HAS ne publie pas cette lecture par statut croisée aux',
        'cabinets sur données publiques.',
      ].join(' '),

      methode: [
        `Sources : HAS / Synaé open data (\`open_data_par_essms\`, extraction du ${hasSource}, ODbL)`,
        `et répertoire FINESS national (${finessSource}).`,
        'Axe : statut juridique à trois niveaux, décomposé en deux contrastes contre la référence',
        'PUBLIC : « privé non lucratif vs public » et « privé commercial vs public ».',
        'Outcome : score consolidé « moyenne des objectifs ramenée à 100 ».',
        adjusted
          ? 'Niveau national : écart AJUSTÉ par régression OLS (neutralise secteur, région), erreurs-standards robustes ; le brut (différence des moyennes) est indiqué en contexte.'
          : 'Niveau national : écart brut = différence des moyennes par statut.',
        'Niveau cabinet : pour chaque organisme évaluateur, écart sur ses seules évaluations (M1),',
        'palier de fiabilité selon l’effectif (M2), test de significativité Cohen’s d + IC + Welch (M3).',
        'Voir le guide des méthodes statistiques.',
      ].join(' '),

      resultats: [
        `Au national, privé non lucratif ${fgapAdj(nonLuc)} vs public ;`,
        `privé commercial ${fgapAdj(comm)} vs public.`,
        'La dispersion entre cabinets est l’information centrale : certains notent nettement plus haut',
        'le privé (commercial ou non lucratif), d’autres l’inverse. Le détail nominatif, le rang, l’écart,',
        'l’intervalle de confiance, la p-value et le palier de chaque cabinet figurent dans le ou les',
        'fichiers joints, et la synthèse par contraste est résumée ci-dessous.',
      ].join(' '),

      interpretation: [
        'Ce que le résultat montre : une association entre statut et score, et surtout une hétérogénéité',
        'des pratiques d’un cabinet à l’autre sur ce critère.',
        adjusted
          ? 'Portée des chiffres : l’écart national est ajusté (secteur, région), mais le niveau cabinet reste brut ;'
          : 'Portée des chiffres : à ce stade, ni le national ni le niveau cabinet ne sont ajustés (taille, région, catégorie) ;',
        'les écarts d’un cabinet à faible effectif sont à lire comme descriptifs (palier le plus prudent).',
        '(Les limites de portée — causalité, qualité de soin — sont détaillées dans « Ce que cette fiche ne dit pas ».)',
      ].join(' '),

      ceQueNeDitPas: [
        'Elle n’établit pas de lien de cause à effet : c’est une association mesurée sur données',
        'publiques, pas une preuve causale — un écart par statut peut refléter d’autres facteurs.',
        'Elle ne mesure pas la qualité réelle des soins, seulement la conformité méthodologique au',
        'référentiel. Et elle ne tranche pas POURQUOI un cabinet note un secteur plus haut ou plus bas',
        'qu’un autre : elle décrit l’écart, sans dire s’il traduit des différences réelles de',
        'fonctionnement ou un biais de l’exercice d’évaluation.',
      ].join(' '),

      limites: [
        adjusted
          ? 'Niveau national AJUSTÉ (OLS, contrôles secteur/région) : l’écart isolé approche l’effet propre du statut. Le niveau CABINET reste BRUT (effectifs par cabinet trop faibles pour ajuster) — à lire comme descriptif.'
          : 'Écarts BRUTS non ajustés : un écart par statut peut refléter d’autres facteurs corrélés (taille, secteur, territoire). Une version ajustée (OLS multivarié) est une amélioration prévue.',
        'Causalité non démontrée ; association sur données publiques.',
        'Cohorte non exhaustive : seuls les établissements déjà évalués figurent.',
        'Outcome = conformité méthodologique, pas qualité de soin réelle.',
        'Effectifs par cabinet souvent faibles → beaucoup de paliers descriptifs, à ne pas',
        'sur-interpréter.',
      ].join(' '),

      misePerspective: [
        'Le bilan annuel HAS publie des moyennes nationales sans cette lecture conjointe statut ×',
        'cabinet. La présente fiche éclaire la question d’équité de traitement entre secteurs lors de',
        'l’évaluation externe. Comparaison internationale et littérature (HAL / Cairn sur la régulation',
        'du médico-social) à compléter en accès ouvert.',
      ].join(' '),

      implications: [
        'Pour les fédérations et ARS : visualiser si un secteur est systématiquement avantagé/désavantagé',
        'par tel cabinet. Pour les établissements : repère sur la pratique du cabinet qui les évalue.',
        'Pour les cabinets évaluateurs : invitation à vérifier l’homogénéité d’exigence entre statuts.',
        'Pour le régulateur : suggestion d’une stratification par statut dans les statistiques publiques.',
      ].join(' '),

      annexe: [
        `Données : HAS Synaé \`open_data_par_essms\` (${hasSource}, ODbL) + FINESS national (${finessSource}).`,
        adjusted
          ? 'Méthode : écart national ajusté OLS (contrôles secteur/région), SE robustes ; par cabinet M1/M2/M3 brut (cf. guide).'
          : 'Méthode : écarts bruts par contraste (national) ; par cabinet M1/M2/M3 (cf. guide).',
        'Reproductibilité : chiffres recalculés sur le snapshot courant ; classement complet en fichier joint.',
        'Document généré à partir de données publiques (HAS/FINESS).',
      ].join(' '),
      ...(cabinets.length ? { cabinets: buildCabinetsBloc(cabinets) } : {}),
    },
    ...(verification ? { verification } : {}),
  };
}
