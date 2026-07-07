/**
 * Registre des « fournisseurs d'axe » par numéro de fiche : centralise, pour
 * chaque fiche, comment calculer (a) les opts de contenu (chiffres de tête +
 * dates) et (b) le(s) rapport(s) par cabinet (synthèse + CSV nominatif).
 *
 * Le worker mensuel résout le fournisseur via `getFicheAxisProvider(numero)` au
 * lieu de coder en dur l'axe mono/multi → ajouter une fiche = ajouter une entrée.
 */

import { logger } from './log';
import {
  analyzeMonoMultiFromProd,
  analyzeMonoMultiByCabinetFromProd,
  analyzeStatutByCabinetFromProd,
  extractRaw,
  type MonoMultiExtractPrisma,
} from './mono-multi-extract';
import { summarizeCabinetAxis, type ContrastReport } from './cabinet-axis-report';
import {
  analyzeCategoricalAxisByCabinet,
  adjustedNationalGapsForAxis,
  type ControlDim,
  type AdjustedNationalGap,
  analyzeRegionByCabinetFromProd,
  adjustedRegionNationalGaps,
  adjustedStatutNationalGaps,
  deriveCapacity,
  deriveSecteur,
  deriveEtabService,
  deriveDrom,
  deriveSemestre,
  deriveGroupeLucratif,
  CAPACITY_CONTRASTS,
  SECTEUR_CONTRASTS,
  ETAB_SERVICE_CONTRASTS,
  DROM_CONTRASTS,
  SEMESTRE_CONTRASTS,
  GROUPE_LUCRATIF_CONTRASTS,
  type CategoryDeriver,
} from './fiche-categorical-axes';
import type { AxisContrast } from './cabinet-axis-categorical';
import type { FicheBuilderOpts } from './fiche-calendar';

export interface FicheAxisPrisma extends MonoMultiExtractPrisma {
  finessEjMapping: {
    aggregate: (args: {
      _max: { snapshotDate: true };
    }) => Promise<{ _max: { snapshotDate: Date | null } }>;
  };
  hasEssmsOpen: {
    aggregate: (args: {
      _max: { syncedAt: true };
    }) => Promise<{ _max: { syncedAt: Date | null } }>;
  };
}

export interface FicheAxisProvider {
  buildOpts: (prisma: FicheAxisPrisma) => Promise<FicheBuilderOpts | undefined>;
  cabinetReport: (prisma: FicheAxisPrisma) => Promise<ContrastReport[] | null>;
}

function frDate(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

async function sourceLabels(prisma: FicheAxisPrisma) {
  const [finessAgg, hasAgg] = await Promise.all([
    prisma.finessEjMapping.aggregate({ _max: { snapshotDate: true } }),
    prisma.hasEssmsOpen.aggregate({ _max: { syncedAt: true } }),
  ]);
  return {
    finessSourceLabel: frDate(finessAgg._max.snapshotDate),
    hasSourceLabel: frDate(hasAgg._max.syncedAt),
  };
}

/** Fiche 1 — axe mono/multi (un seul contraste). */
export const monoMultiProvider: FicheAxisProvider = {
  async buildOpts(prisma) {
    try {
      const stats = await analyzeMonoMultiFromProd(prisma);
      return { stats, ...(await sourceLabels(prisma)) };
    } catch (err) {
      logger.warn({ err }, '[fiche-axis] mono/multi buildOpts échoué — chiffres de référence');
      return undefined;
    }
  },
  async cabinetReport(prisma) {
    try {
      const results = await analyzeMonoMultiByCabinetFromProd(prisma);
      return [
        {
          id: 'mono_multi',
          label: 'Mono vs multi-établissement',
          summary: summarizeCabinetAxis(results),
          results,
        },
      ];
    } catch (err) {
      logger.warn({ err }, '[fiche-axis] mono/multi cabinetReport échoué');
      return null;
    }
  },
};

/** Fiche 2 — axe statut juridique (contrastes vs public). */
export const statutProvider: FicheAxisProvider = {
  async buildOpts(prisma) {
    try {
      const statutNational = (await adjustedStatutNationalGaps(prisma)).map(toContrastGap);
      return { statutNational, ...(await sourceLabels(prisma)) };
    } catch (err) {
      logger.warn({ err }, '[fiche-axis] statut buildOpts échoué');
      return undefined;
    }
  },
  async cabinetReport(prisma) {
    try {
      const reports = await analyzeStatutByCabinetFromProd(prisma);
      return reports.map((r) => ({
        id: r.contrast.id,
        label: r.contrast.label,
        summary: summarizeCabinetAxis(r.results),
        results: r.results,
      }));
    } catch (err) {
      logger.warn({ err }, '[fiche-axis] statut cabinetReport échoué');
      return null;
    }
  },
};

const CTRL_LABEL: Record<ControlDim, string> = { secteur: 'secteur', statut: 'statut', region: 'région', annee: 'année' };
/** Libellé humain des contrôles d'un axe (« statut et région ») — exclut l'axe lui-même. */
function controlsLabel(dims: ControlDim[]): string {
  const ls = dims.map((d) => CTRL_LABEL[d]);
  if (ls.length <= 1) return ls[0] ?? '';
  return `${ls.slice(0, -1).join(', ')} et ${ls[ls.length - 1]}`;
}

/** Mappe un gap ajusté (analyse) vers la forme attendue par le contenu de fiche. */
function toContrastGap(g: AdjustedNationalGap) {
  return {
    label: g.label,
    gap: g.gapRaw,
    gapAdj: g.gapAdj,
    ciLow: g.ciLow,
    ciHigh: g.ciHigh,
    p: g.p,
    n: g.n,
    byStatut: g.byStratum?.map((s) => ({ stratum: s.stratum, gap: s.gap })),
    byStatutSignificant: g.interactionSignificant,
    verif: g.verif,
  };
}

/**
 * Fabrique un provider pour un axe catégoriel statique (contrastes fixes) :
 * buildOpts = écarts nationaux AJUSTÉS (OLS, neutralise `controlDims`) + brut en
 * contexte + libellés de source ; cabinetReport = un rapport par contraste.
 * `controlDims` exclut l'axe lui-même et les colinéaires. `stratifyBy` (optionnel)
 * ajoute la ventilation par strate (statut) pour révéler les interactions.
 */
function makeCategoricalProvider(
  derive: CategoryDeriver,
  contrasts: AxisContrast[],
  axisName: string,
  controlDims: ControlDim[],
  stratifyBy?: ControlDim,
): FicheAxisProvider {
  return {
    async buildOpts(prisma) {
      try {
        const raw = await extractRaw(prisma);
        const nationalGaps = adjustedNationalGapsForAxis(raw, derive, contrasts, controlDims, stratifyBy).map(toContrastGap);
        return { nationalGaps, adjustControls: controlsLabel(controlDims), ...(await sourceLabels(prisma)) };
      } catch (err) {
        logger.warn({ err }, `[fiche-axis] ${axisName} buildOpts échoué`);
        return undefined;
      }
    },
    async cabinetReport(prisma) {
      try {
        return analyzeCategoricalAxisByCabinet(await extractRaw(prisma), derive, contrasts);
      } catch (err) {
        logger.warn({ err }, `[fiche-axis] ${axisName} cabinetReport échoué`);
        return null;
      }
    },
  };
}

/** Fiche 4 — région (contrastes dynamiques : top-K régions vs la plus dotée). */
export const regionProvider: FicheAxisProvider = {
  async buildOpts(prisma) {
    try {
      const nationalGaps = (await adjustedRegionNationalGaps(prisma)).map(toContrastGap);
      return { nationalGaps, adjustControls: controlsLabel(['secteur', 'statut']), ...(await sourceLabels(prisma)) };
    } catch (err) {
      logger.warn({ err }, '[fiche-axis] région buildOpts échoué');
      return undefined;
    }
  },
  async cabinetReport(prisma) {
    try {
      return await analyzeRegionByCabinetFromProd(prisma);
    } catch (err) {
      logger.warn({ err }, '[fiche-axis] région cabinetReport échoué');
      return null;
    }
  },
};

// Contrôles par axe : on neutralise les AUTRES dimensions, jamais l'axe lui-même
// ni un colinéaire (ex. pas de région pour DROM ; pas de statut pour le groupe
// lucratif qui est par construction « privé commercial » seul).
// Les axes ci-dessous sont en plus STRATIFIÉS par statut (5e arg) → ventilation
// par statut affichée quand l'effet interagit (cf. secteur public/commercial).
/** Fiche 5 — secteur (PA réf) ; ajusté sur statut + région, stratifié statut. */
export const secteurProvider = makeCategoricalProvider(deriveSecteur, SECTEUR_CONTRASTS, 'secteur', ['statut', 'region'], 'statut');
/** Fiche 6 — capacité (petit réf) ; ajusté sur secteur + statut + région, stratifié statut. */
export const capaciteProvider = makeCategoricalProvider(deriveCapacity, CAPACITY_CONTRASTS, 'capacité', ['secteur', 'statut', 'region'], 'statut');
/** Fiche 8 — temporel (S1 réf) ; ajusté sur secteur + statut + région + ANNÉE (neutralise
 *  la tendance séculaire qui confond S1/S2), stratifié statut. */
export const semestreProvider = makeCategoricalProvider(deriveSemestre, SEMESTRE_CONTRASTS, 'semestre', ['secteur', 'statut', 'region', 'annee'], 'statut');
/** Fiche 9 — établissement vs service (établissement réf) ; ajusté sur secteur + statut + région, stratifié statut. */
export const etabServiceProvider = makeCategoricalProvider(deriveEtabService, ETAB_SERVICE_CONTRASTS, 'étab/service', ['secteur', 'statut', 'region'], 'statut');
/** Fiche 11 — DROM vs métropole (métropole réf) ; ajusté sur secteur + statut (PAS région, colinéaire), stratifié statut. */
export const dromProvider = makeCategoricalProvider(deriveDrom, DROM_CONTRASTS, 'DROM', ['secteur', 'statut'], 'statut');
/** Fiche 7 — groupe lucratif national ; ajusté sur secteur + région (statut constant = commercial, pas de stratification). */
export const groupeLucratifProvider = makeCategoricalProvider(
  deriveGroupeLucratif,
  GROUPE_LUCRATIF_CONTRASTS,
  'groupe lucratif',
  ['secteur', 'region'],
);

/**
 * Méta-fiches (3/10/12) : pas de contraste d'axe (leurs données passent par les
 * PJ méta), mais on fournit les LIBELLÉS DE SOURCE (dates HAS + FINESS) pour que
 * le contenu n'affiche pas le placeholder « (snapshot courant) ».
 */
export const metaSourceProvider: FicheAxisProvider = {
  async buildOpts(prisma) {
    try {
      return { ...(await sourceLabels(prisma)) };
    } catch (err) {
      logger.warn({ err }, '[fiche-axis] méta libellés de source échoué');
      return undefined;
    }
  },
  async cabinetReport() {
    return null;
  },
};

const FICHE_AXIS_PROVIDERS: Readonly<Record<number, FicheAxisProvider>> = {
  1: monoMultiProvider,
  2: statutProvider,
  3: metaSourceProvider,
  4: regionProvider,
  5: secteurProvider,
  6: capaciteProvider,
  7: groupeLucratifProvider,
  8: semestreProvider,
  9: etabServiceProvider,
  10: metaSourceProvider,
  11: dromProvider,
  12: metaSourceProvider,
};

export function getFicheAxisProvider(numero: number): FicheAxisProvider | null {
  return FICHE_AXIS_PROVIDERS[numero] ?? null;
}
