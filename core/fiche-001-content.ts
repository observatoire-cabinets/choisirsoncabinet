/**
 * Contenu éditorial de la FICHE n°001 — Mono vs Multi-établissements.
 *
 * Cadre : livrable ANONYME. Aucune identification d'auteur ni de marque ne
 * doit figurer dans le contenu.
 *
 * Chiffres : par défaut, l'analyse de référence V1.0/V1.3 du 19/05/2026 (HAS
 * Synaé `open_data_par_essms` + FINESS, OLS SE robustes). En passant `stats`
 * les CHIFFRES DE TÊTE (N, %, moyennes, écart brut/ajusté, IC, p) sont
 * recalculés sur le snapshot courant via `analyzeMonoMultiFromProd`. Les
 * analyses détaillées (classes A/B/C/D, hétérogénéité par segment, dose-réponse,
 * R²) restent celles de l'étude de référence, signalées comme telles.
 */

import type { MonoMultiResult } from './mono-multi-analysis';
import type { CabinetAxisSummary } from './cabinet-axis-report';
import { type VerificationData } from './fiche-verification';
import { ciPercentLabel } from './significance';

export interface FicheBlocs {
  /** N1 — « Pourquoi cette fiche » (1-2 phrases). Optionnel. */
  pourquoi?: string;
  /** N1 — « Verdict en une phrase » (citable). Optionnel. */
  verdict?: string;
  /** N2 — « Ce que cette fiche ne dit pas » (périmètre/limites de portée). Optionnel. */
  ceQueNeDitPas?: string;
  enClair: string;
  question: string;
  methode: string;
  resultats: string;
  interpretation: string;
  limites: string;
  misePerspective: string;
  implications: string;
  annexe: string;
  /** Synthèse par cabinet (présent si `cabinetSummary` fourni). */
  cabinets?: string;
}

export interface FicheContent {
  numero: number;
  titre: string;
  famille: string;
  statut: string;
  blocs: FicheBlocs;
  /**
   * Données de calcul et vérification (optionnel). Pur-rendu, HORS
   * serializeFicheContent et HORS datasetHash. Présent uniquement quand les
   * agrégats sont disponibles (chemin dynamique recalculé) ; absent en dégradé.
   */
  verification?: VerificationData;
}

export interface BuildFiche001Opts {
  /** Stats recalculées sur les données. Absent → chiffres de référence V1.0. */
  stats?: MonoMultiResult;
  /** Libellé de la source HAS (ex. "01/07/2026"). */
  hasSourceLabel?: string;
  /** Libellé de la source FINESS (ex. "01/06/2026"). */
  finessSourceLabel?: string;
}

/** Une synthèse par cabinet pour un contraste donné (libellé + agrégats). */
export interface CabinetContrastSummary {
  label: string;
  summary: CabinetAxisSummary;
}

/** Bloc de synthèse par cabinet — un ou plusieurs contrastes (détail dans le fichier joint). */
export function buildCabinetsBloc(contrasts: CabinetContrastSummary[]): string {
  const fr1 = (n: number | null) => (n === null ? '—' : frDec(n, 2));
  const multi = contrasts.length > 1;
  const parts: string[] = [];
  for (const { label, summary: s } of contrasts) {
    const head = multi ? `[${label}] ` : '';
    // proMulti/proMono/neutre ne comptent que les cabinets à écart CALCULABLE
    // (deux groupes observés). Les autres (un seul groupe) sont dans le total
    // mais hors direction — on les explicite pour réconcilier les comptes.
    const calculable = s.proMulti + s.proMono + s.neutre;
    const sansEcart = s.totalCabinets - calculable;
    const sansEcartTail =
      sansEcart > 0
        ? ` ; ${sansEcart} cabinet(s) à écart non calculable (un seul groupe observé), hors direction`
        : '';
    parts.push(
      `${head}Sur ${s.totalCabinets} cabinets : ${s.nFiable} fiables, ${s.nTendance} en tendance, ${s.nDescriptif} descriptifs (paliers de fiabilité). ` +
        `Direction (sur les ${calculable} cabinets à écart calculable) : ${s.proMulti} pro-cible, ${s.proMono} pro-référence, ${s.neutre} neutres${sansEcartTail}. ` +
        `Écarts : médiane ${fr1(s.medianGap)} pts [Q1 ${fr1(s.q1Gap)} ; Q3 ${fr1(s.q3Gap)}], de ${fr1(s.minGap)} à ${fr1(s.maxGap)} pts.`,
    );
  }
  parts.push(
    `Comment lire : chaque cabinet est mesuré sur SES seules évaluations (écart brut M1 : moyenne du groupe cible moins moyenne du groupe de référence, chez lui), qualifié par un palier de fiabilité (M2 : assez d'évaluations pour conclure ?) et un test de significativité (M3 : l'écart dépasse-t-il le hasard ?) — détail dans le guide des méthodes statistiques joint/référencé.`,
  );
  parts.push(
    `Ce que veulent dire ces chiffres : « pro-cible » signifie que le cabinet note mieux le groupe cible que le groupe de référence ; « pro-référence », l'inverse ; « neutre », un écart quasi nul. La médiane est l'écart du cabinet du milieu (la moitié des cabinets fait plus, l'autre moitié moins) ; [Q1 ; Q3] encadre la moitié centrale des cabinets — plus cet intervalle est large, plus les pratiques divergent d'un cabinet à l'autre.`,
  );
  parts.push(
    `Le classement complet nominatif figure dans le(s) fichier(s) joint(s) (rang, effectifs, écart, IC, p, palier, Δ vs national).`,
  );
  parts.push(
    `Lecture descriptive : ces écarts par cabinet sont BRUTS (non ajustés des facteurs de composition — secteur, statut, taille, territoire) et descriptifs ; à lire avec le palier de fiabilité, jamais comme un classement de qualité. Association sur données publiques, pas de preuve causale ; le score mesure le niveau de satisfaction des exigences du référentiel par la structure, tel que coté par l’évaluateur, pas la qualité réelle des soins.`,
  );
  return parts.join(' ');
}

// ── Formatage français (partagé par les fiches) ──────────────────────────────
/** Entier avec espaces de milliers (espace simple, pour matcher la V1.0). */
export function frInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
/** Décimal à `d` chiffres, virgule décimale. */
export function frDec(n: number, d = 1): string {
  return n.toFixed(d).replace('.', ',');
}
/** Décimal signé (+ explicite pour les positifs). */
export function frSigned(n: number, d = 1): string {
  return (n >= 0 ? '+' : '') + frDec(n, d);
}
/** Fraction 0–1 → pourcentage. */
export function frPct(x: number, d = 1): string {
  return `${frDec(x * 100, d)} %`;
}
/** p-value en phrase "= m × 10^e" ; borne défendable si underflow (p≈0). */
function formatPResult(p: number): string {
  if (!(p > 0) || p < 1e-16) return '< 10^-16';
  const exp = Math.floor(Math.log10(p));
  return `= ${frDec(p / 10 ** exp)} × 10^${exp}`;
}
/** p-value en seuil "< 10^e" pour le bloc « en clair ». */
function formatPPhrase(p: number): string {
  if (!(p > 0) || p < 1e-16) return '< 10^-16';
  return `< 10^${Math.floor(Math.log10(p)) + 1}`;
}

interface FicheFigures {
  n: string;
  pctMulti: string;
  pctMono: string;
  meanMulti: string;
  meanMono: string;
  gapAbs: string;
  gapSigned: string;
  beta: string;
  ciLow: string;
  ciHigh: string;
  pResult: string;
  pPhrase: string;
  hasSource: string;
  finessSource: string;
  dynamic: boolean;
}

function resolveFigures(opts: BuildFiche001Opts): FicheFigures {
  const s = opts.stats;
  if (!s) {
    // Chiffres de référence V1.0 (littéraux — back-compat strict).
    return {
      n: '18 795',
      pctMulti: '82,9 %',
      pctMono: '17,1 %',
      meanMulti: '81,4',
      meanMono: '76,2',
      gapAbs: '5,3',
      gapSigned: '+5,3',
      beta: '+4,1',
      ciLow: '+3,4',
      ciHigh: '+4,7',
      pResult: '= 5,8 × 10^-33',
      pPhrase: '< 10^-30',
      hasSource: opts.hasSourceLabel ?? '19/05/2026',
      finessSource: opts.finessSourceLabel ?? '04/05/2026',
      dynamic: false,
    };
  }
  return {
    n: frInt(s.n),
    pctMulti: frPct(s.nMulti / s.n),
    pctMono: frPct(s.nMono / s.n),
    meanMulti: frDec(s.meanMulti),
    meanMono: frDec(s.meanMono),
    gapAbs: frDec(Math.abs(s.gapRaw)),
    gapSigned: frSigned(s.gapRaw),
    beta: frSigned(s.betaAdj),
    ciLow: frSigned(s.ciLow),
    ciHigh: frSigned(s.ciHigh),
    pResult: formatPResult(s.p),
    pPhrase: formatPPhrase(s.p),
    hasSource: opts.hasSourceLabel ?? '(snapshot courant)',
    finessSource: opts.finessSourceLabel ?? '(snapshot courant)',
    dynamic: true,
  };
}

export function buildFiche001Content(
  opts: BuildFiche001Opts = {},
  cabinets: CabinetContrastSummary[] = [],
): FicheContent {
  const f = resolveFigures(opts);
  // Libellé des SE robustes : l'étude de référence (Python statsmodels) utilise
  // HC3 ; le recalcul utilise HC0 (HC3 dégénère en NaN sur les strates FINESS
  // à une seule observation — cf. mono-multi-analysis.ts). À ce N, HC0 ≈ HC3.
  const seLabel = f.dynamic ? 'HC0' : 'HC3';
  // IC : dynamique = IC courant (cohérent avec le seuil α actif, cf. significance.ts) ;
  // statique = littéraux V1.0 publiés à 95 % (chiffres figés, non recalculés).
  const ciPct = f.dynamic ? ciPercentLabel() : '95 %';
  // Données de calcul et vérification — uniquement en chemin dynamique (les
  // chiffres de référence V1.0 littéraux ne portent pas les écarts-types par groupe).
  const s = opts.stats;
  const verification: VerificationData | undefined = s
    ? {
        kind: 'two-group',
        contrasts: [
          {
            label: 'Multi vs Mono — score HAS consolidé (/100)',
            groups: [
              { label: 'Mono (référence)', n: s.nMono, mean: s.meanMono, sd: Number.isNaN(s.sdMono) ? null : s.sdMono },
              { label: 'Multi (cible)', n: s.nMulti, mean: s.meanMulti, sd: Number.isNaN(s.sdMulti) ? null : s.sdMulti },
            ],
            ecartBrut: s.gapRaw,
            ajuste: {
              beta: s.betaAdj,
              se: s.se,
              t: s.t,
              ddl: s.n - s.k,
              ciLow: s.ciLow,
              ciHigh: s.ciHigh,
              ciLevel: s.ciLevel,
              p: s.p,
              pMethod: 'normale',
              seType: seLabel,
              controls: 'région, statut juridique, catégorie d’établissement',
              k: s.k,
            },
          },
        ],
        sources: [
          { libelle: 'HAS / Synaé open_data_par_essms (ODbL)', date: f.hasSource },
          { libelle: 'FINESS national', date: f.finessSource },
        ],
        note: 'Détail par cabinet : voir le fichier joint.',
      }
    : undefined;
  return {
    numero: 1,
    titre: 'Mono vs Multi-établissements — l’écart de score HAS',
    famille: 'A. Taille et structure de l’organisation évaluée',
    statut: 'Relue',
    blocs: {
      pourquoi: [
        'Le bilan national de la HAS publie des moyennes sans distinguer les établissements',
        'indépendants (mono) de ceux rattachés à un gestionnaire de plusieurs établissements (multi).',
        'Cette fiche mesure si un écart existe et ce qu’il révèle sur l’équité du dispositif d’évaluation.',
      ].join(' '),

      verdict: [
        'À conditions comparables (région, statut juridique et catégorie d’établissement neutralisés),',
        `être rattaché à un groupe multi-établissements est associé à un score HAS supérieur d’environ`,
        `${f.beta} points sur 100 par rapport à un établissement indépendant — un écart modéré mais`,
        'très solide statistiquement.',
      ].join(' '),

      enClair: [
        'Les ESSMS rattachés à un gestionnaire de plusieurs établissements (multi) obtiennent en',
        `moyenne ${f.gapAbs} points de plus sur 100 au score HAS consolidé que les établissements`,
        'indépendants (mono). Après neutralisation de la région, du statut juridique et de la',
        `catégorie d’établissement, l’écart reste de ${f.beta} points et reste très solide statistiquement`,
        `(p ${f.pPhrase}), mesuré sur ${f.n} établissements évalués. Le score HAS reflète le niveau de`,
        'satisfaction des exigences du référentiel par la structure, tel que coté par l’évaluateur, pas directement la qualité réelle des soins. Trois mécanismes',
        'plausibles coexistent — mutualisation des ressources qualité, sélection des portefeuilles, et',
        'familiarité avec l’exercice d’évaluation — sans que la présente fiche tranche entre eux.',
      ].join(' '),

      question: [
        'Hypothèse : la cotation HAS diffère significativement entre ESSMS mono et multi-établissements.',
        'Enjeu : si une différence subsiste après contrôle des facteurs observables, elle révèle une',
        'inégalité structurelle d’accès aux ressources de préparation, un effet de sélection des',
        'portefeuilles, ou un biais de l’exercice d’évaluation — questions d’équité du dispositif.',
        'Valeur ajoutée : le bilan annuel HAS publie des moyennes nationales sans cette stratification',
        'mono/multi sur données publiques.',
      ].join(' '),

      methode: [
        `Sources : HAS / Synaé open data (\`open_data_par_essms\`, extraction du ${f.hasSource}, licence ODbL)`,
        `et répertoire FINESS national (extraction du ${f.finessSource}, 103 022 établissements).`,
        `Échantillon : N = ${f.n} ESSMS évalués dont les résultats sont publics (${f.pctMulti} multi, ${f.pctMono} mono).`,
        'Exposition : statut mono (gestionnaire FINESS juridique avec un seul FINESS géographique) vs multi.',
        'Outcome : score consolidé « moyenne des objectifs ramenée à 100 » (échelle 0–100).',
        'Contrôles : région, statut juridique, catégorie d’établissement.',
        `Tests : Mann-Whitney U, Welch, Chi², Cohen’s d, OLS avec erreurs standards robustes ${seLabel},`,
        'régression logistique (classe A/B vs D), bootstrap 500 itérations, correction Holm-Bonferroni.',
      ].join(' '),

      resultats: [
        `Scores moyens : multi ${f.meanMulti} / 100 ; mono ${f.meanMono} / 100 ; écart brut ${f.gapSigned} points.`,
        `Écart ajusté (région, statut, catégorie contrôlés) : ${f.beta} points [IC ${ciPct} : ${f.ciLow} à ${f.ciHigh}] ;`,
        `p ${f.pResult}. Lecture : la meilleure estimation de l'écart, à profil comparable, est ${f.beta} points`,
        `sur 100, et le vrai écart se situe très vraisemblablement entre ${f.ciLow} et ${f.ciHigh} points ; la`,
        'p-value est la probabilité d\'observer un tel écart s\'il n\'existait en réalité aucune différence',
        '(plus elle est petite, plus l\'écart est crédible).',
        'Indice qualité A/B/C/D : les mono sont 2,9 fois plus souvent classés D',
        '(9,6 % vs 3,3 %). Toutes choses égales par ailleurs, l’appartenance à un groupe multiplie par',
        '1,8 la probabilité d’obtenir A ou B et divise par 2,6 la probabilité d’être classé D.',
        'Relation monotone : chaque doublement de la taille du gestionnaire ajoute en moyenne +0,85 point',
        'sur l’échelle 0–100. Le modèle explique 21 % de la variance (R² = 0,21).',
      ].join(' '),

      interpretation: [
        'Ce que le résultat montre : après neutralisation des facteurs observables, il subsiste un écart',
        'd’environ +4 points sur 100 en défaveur des établissements indépendants — soit, statistiquement,',
        'l’écart typique entre un B et un C, ou entre un C et un D.',
        'Ce qu’il ne montre pas : il n’établit pas de causalité, et ne mesure pas la qualité réelle des',
        'soins — seulement la cotation de la structure par l’évaluateur (satisfaction des exigences du référentiel).',
        'Hypothèses alternatives : mutualisation des ressources qualité (effet maximal dans le public',
        '+7,2 pts et l’associatif +6,0 pts, nul dans le privé commercial +2,0 pts non significatif),',
        'sélection des portefeuilles à l’intégration, et familiarité accrue des groupes avec l’exercice.',
      ].join(' '),

      ceQueNeDitPas: [
        'Elle n’établit pas de lien de cause à effet : c’est une association mesurée sur données',
        'publiques, pas une preuve causale. Elle ne mesure pas la qualité réelle des soins, seulement la',
        'cotation de la structure par l’évaluateur (satisfaction des exigences du référentiel). Et elle ne dit pas POURQUOI l’écart existe :',
        'plusieurs mécanismes plausibles coexistent (évoqués plus haut) sans qu’elle puisse trancher.',
      ].join(' '),

      limites: [
        'Causalité non démontrée : association robuste, pas preuve de cause à effet.',
        `Cohorte non exhaustive : ${f.n} ESSMS évalués sur ~103 000 référencés — les non encore évalués`,
        'peuvent présenter une distribution différente.',
        'Outcome = cotation de la structure par l’évaluateur (satisfaction des exigences du référentiel), pas la qualité de soin réelle.',
        'Effet hétérogène par segment : nul dans le privé commercial, +1,5 pt sur les EHPAD, +7,0 pts sur',
        'les résidences autonomie, +5,6 pts sur les services autonomie — à lire segment par segment.',
        'Confondants non testés : capacité, ancienneté, urbain/rural, identité du cabinet évaluateur.',
        `Le modèle laisse 79 % de la variance inexpliquée. Snapshot arrêté au ${f.hasSource}.`,
      ].join(' '),

      misePerspective: [
        'Comparaison officielle : le bilan annuel HAS publie des moyennes nationales par chapitre sans',
        'stratification mono/multi ; la présente fiche éclaire ces moyennes en révélant une disparité',
        'structurelle qu’elles masquent.',
        'Comparaison internationale : le système américain Nursing Home Compare (CMS) documente des effets',
        'de chaîne (groupes) versus établissements indépendants — référence à explorer en accès ouvert.',
        'Littérature : recherche HAL / Cairn à compléter (mots-clés monoétablissement, groupe, qualité',
        'médico-social, régulation soins longue durée).',
      ].join(' '),

      implications: [
        'Pour les établissements indépendants : argument pour solliciter auprès des ARS et fédérations un',
        'appui spécifique à la préparation de l’évaluation.',
        'Pour les groupes : argument valorisant la mutualisation des ressources méthodologiques.',
        'Pour les cabinets évaluateurs : invitation à vérifier l’homogénéité d’exigence entre un mono et',
        'un grand groupe.',
        'Pour le régulateur : suggestion d’introduire une stratification mono/multi dans les statistiques',
        'publiques annuelles. Pour la recherche : piste sur les effets structurels d’une évaluation',
        'externalisée standardisée.',
      ].join(' '),

      annexe: [
        `Données : HAS Synaé \`open_data_par_essms\` (${f.hasSource}, ODbL) + FINESS national (${f.finessSource}).`,
        `Méthode : OLS SE robustes ${seLabel}, logistique, bootstrap 500, Holm-Bonferroni.`,
        `Période : évaluations publiques au ${f.hasSource}.`,
        'Reproductibilité : code statistique ouvert, calcul rejouable hors ligne sur les données embarquées.',
        ...(f.dynamic
          ? [
              'Provenance : chiffres de tête (N, moyennes, écart brut/ajusté, IC, p) recalculés sur le',
              'snapshot courant ; analyses détaillées (classes A/B/C/D, hétérogénéité par segment,',
              'dose-réponse, R²) issues de l’étude de référence du 19/05/2026.',
            ]
          : []),
        'Document généré à partir de données publiques (HAS/FINESS).',
      ].join(' '),
      ...(cabinets.length ? { cabinets: buildCabinetsBloc(cabinets) } : {}),
    },
    ...(verification ? { verification } : {}),
  };
}

/** Sérialise titre + métadonnées + tous les blocs en un seul texte (pour rendu / contrôles). */
export function serializeFicheContent(fiche: FicheContent): string {
  const b = fiche.blocs;
  return [
    fiche.titre,
    fiche.famille,
    fiche.statut,
    ...(b.verdict ? [b.verdict] : []),
    ...(b.pourquoi ? [b.pourquoi] : []),
    b.enClair,
    b.question,
    b.methode,
    b.resultats,
    b.interpretation,
    ...(b.ceQueNeDitPas ? [b.ceQueNeDitPas] : []),
    b.limites,
    b.misePerspective,
    b.implications,
    ...(b.cabinets ? [b.cabinets] : []),
    b.annexe,
  ].join('\n\n');
}
