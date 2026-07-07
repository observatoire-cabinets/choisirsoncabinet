/**
 * Profil PAR CABINET (brique commune des méta-fiches 3/10/12).
 *
 * Agrège, pour chaque cabinet évaluateur : son niveau global (écart brut de
 * notation au national), son profil sur 7 « contrastes phares » (réutilise
 * `analyzeContrastByCabinet` M1/M2/M3), et son portefeuille sectoriel (HHI).
 *
 * Cadre descriptif (révéler les pratiques non conformes à l'égalité de traitement, volontaires ou non) +
 * EXTENSIBLE : ajouter un axe phare = une entrée dans `PHARE_CONTRASTS`.
 */

import {
  analyzeContrastByCabinet,
  type AxisContrast,
  type CategoricalRow,
} from './cabinet-axis-categorical';
import type { CabinetAxisResult, Reliability } from './cabinet-axis';
import {
  secteurFromCode,
  deriveSecteur,
  deriveCapacity,
  deriveSemestre,
  deriveEtabService,
  deriveGroupeLucratif,
  type Secteur,
} from './fiche-categorical-axes';
import type { RawMonoMultiExtractRow } from './mono-multi-extract';
import { significanceAlpha } from './significance';

type Deriver = (r: RawMonoMultiExtractRow) => string | null;

export interface PhareContrast {
  axisId: string;
  label: string;
  derive: Deriver;
  contrast: AxisContrast;
}

/** Un contraste binaire « phare » par axe (le détail complet reste dans chaque fiche dédiée). */
export const PHARE_CONTRASTS: PhareContrast[] = [
  {
    axisId: 'mono_multi',
    label: 'Multi vs mono',
    derive: (r) =>
      r.is_multi === true || r.is_multi === 't' || r.is_multi === 1 || r.is_multi === '1' ? 'multi' : 'mono',
    contrast: { id: 'mono_multi', label: 'Multi vs mono', reference: 'mono', target: 'multi' },
  },
  {
    axisId: 'statut',
    label: 'Commercial vs public',
    derive: (r) => r.statut ?? null,
    contrast: { id: 'commercial_vs_public', label: 'Commercial vs public', reference: 'Public', target: 'Privé commercial' },
  },
  {
    axisId: 'secteur',
    label: 'PH adultes vs PA',
    derive: deriveSecteur,
    contrast: { id: 'ph_adultes_vs_pa', label: 'PH adultes vs PA', reference: 'PA', target: 'PH adultes' },
  },
  {
    axisId: 'capacite',
    label: 'Grand vs petit',
    derive: deriveCapacity,
    contrast: { id: 'grand_vs_petit', label: 'Grand vs petit', reference: 'petit', target: 'grand' },
  },
  {
    axisId: 'groupe_lucratif',
    label: 'Groupe vs indépendant',
    derive: deriveGroupeLucratif,
    contrast: { id: 'groupe_vs_independant', label: 'Groupe vs indépendant', reference: 'independant', target: 'groupe' },
  },
  {
    axisId: 'temporel',
    label: 'S2 vs S1',
    derive: deriveSemestre,
    contrast: { id: 's2_vs_s1', label: 'S2 vs S1', reference: 'S1', target: 'S2' },
  },
  {
    axisId: 'etab_service',
    label: 'Service vs établissement',
    derive: deriveEtabService,
    contrast: { id: 'service_vs_etablissement', label: 'Service vs établissement', reference: 'établissement', target: 'service' },
  },
];

// ─── Profil par cabinet (Task 2) ──────────────────────────────────────────────
export const SPECIALIZED_DOMINANT_SHARE = 0.6;

export interface AxisHeadline {
  axisId: string;
  label: string;
  gap: number | null;
  reliability: Reliability | null;
  significant: boolean;
}

export interface CabinetPortfolio {
  secteurCounts: Record<Secteur, number>;
  dominantSecteur: Secteur | null;
  dominantShare: number;
  hhi: number;
  specialized: boolean;
}

export interface CabinetProfile {
  cabinet: string;
  n: number;
  niveauGlobal: number | null;
  axes: AxisHeadline[];
  portfolio: CabinetPortfolio;
  nSignificantAxes: number;
}

const SECTEURS: Secteur[] = ['PA', 'PH adultes', 'PH enfants', 'Autres'];

function toCategorical(raw: RawMonoMultiExtractRow[], derive: Deriver): CategoricalRow[] {
  const out: CategoricalRow[] = [];
  for (const r of raw) {
    const cabinet = r.cabinet ?? null;
    const category = derive(r);
    if (!cabinet || !category) continue;
    out.push({ cabinet, score: Number(r.score), category });
  }
  return out;
}

function isSignificant(r: CabinetAxisResult): boolean {
  return r.reliability === 'fiable' && r.p !== null && r.p < significanceAlpha() && r.gap !== null && r.gap !== 0;
}

/** Construit le profil de chaque cabinet, classé par niveau global décroissant. */
export function buildCabinetProfiles(raw: RawMonoMultiExtractRow[]): CabinetProfile[] {
  const withCabinet = raw.filter((r) => (r.cabinet ?? '') !== '');
  const nationalMean =
    withCabinet.length > 0 ? withCabinet.reduce((s, r) => s + Number(r.score), 0) / withCabinet.length : 0;

  const axisIndex = new Map<string, Map<string, CabinetAxisResult>>();
  for (const p of PHARE_CONTRASTS) {
    const results = analyzeContrastByCabinet(toCategorical(raw, p.derive), p.contrast);
    axisIndex.set(p.axisId, new Map(results.map((r) => [r.cabinet, r])));
  }

  const byCabinet = new Map<string, RawMonoMultiExtractRow[]>();
  for (const r of withCabinet) {
    const c = r.cabinet as string;
    const arr = byCabinet.get(c) ?? [];
    arr.push(r);
    byCabinet.set(c, arr);
  }

  const profiles: CabinetProfile[] = [];
  for (const [cabinet, rows] of byCabinet) {
    const n = rows.length;
    const niveauGlobal = n > 0 ? rows.reduce((s, r) => s + Number(r.score), 0) / n - nationalMean : null;

    const counts: Record<Secteur, number> = { 'PA': 0, 'PH adultes': 0, 'PH enfants': 0, 'Autres': 0 };
    for (const r of rows) counts[secteurFromCode(r.code)]++;
    const total = SECTEURS.reduce((s, k) => s + counts[k], 0);
    let dominantSecteur: Secteur | null = null;
    let dominantCount = -1;
    for (const k of SECTEURS) {
      if (counts[k] > dominantCount) {
        dominantCount = counts[k];
        dominantSecteur = k;
      }
    }
    const dominantShare = total > 0 ? dominantCount / total : 0;
    const hhi = total > 0 ? SECTEURS.reduce((s, k) => s + (counts[k] / total) ** 2, 0) : 0;
    const portfolio: CabinetPortfolio = {
      secteurCounts: counts,
      dominantSecteur,
      dominantShare,
      hhi,
      specialized: dominantShare >= SPECIALIZED_DOMINANT_SHARE,
    };

    const axes: AxisHeadline[] = PHARE_CONTRASTS.map((p) => {
      const res = axisIndex.get(p.axisId)!.get(cabinet) ?? null;
      return {
        axisId: p.axisId,
        label: p.label,
        gap: res?.gap ?? null,
        reliability: res?.reliability ?? null,
        significant: res ? isSignificant(res) : false,
      };
    });
    const nSignificantAxes = axes.filter((a) => a.significant).length;

    profiles.push({ cabinet, n, niveauGlobal, axes, portfolio, nSignificantAxes });
  }

  profiles.sort((a, b) => (b.niveauGlobal ?? -Infinity) - (a.niveauGlobal ?? -Infinity));
  return profiles;
}
