/**
 * Équivalent EN MÉMOIRE de MONO_MULTI_EXTRACT_SQL (core/mono-multi-extract.ts),
 * clause par clause — la parité des deux chemins est verrouillée par les tests :
 *   - WHERE e.raw->>'moy_objectifs_100' IS NOT NULL  → `if (e.score === null) continue`
 *   - JOIN LATERAL (INNER) finess_ej_mapping as-of   → geo sans snapshot EJ = ligne éliminée
 *   - LEFT JOIN LATERAL finess_capacity as-of        → capacité null si aucun snapshot
 *   - lpad(finess_geo, 9, '0') DES DEUX CÔTÉS        → `lpad9` (complète ET tronque à 9,
 *     comme lpad Postgres)
 *   - ORDER BY … LIMIT 1 du LATERAL                  → pickAsOfSnapshot (dernier snapshot
 *     <= clôture, sinon repli sur le plus ANCIEN — clôture null incluse)
 *   - COALESCE(région/statut/catégorie/code/département, '') ; cabinet (oe_nom) SANS
 *     coalesce (null passe tel quel) ; eval_date en Date (timestamptz Prisma) ;
 *     score float8 → number ; is_multi = (ej_size >= 2).
 *
 * Note ::date : le SQL compare `snapshot_date <= eval_date_cloture_tech::date`. Les
 * snapshots étant des DATE (minuit UTC), comparer les timestamps complets côté JS est
 * équivalent tant que la clôture reste dans son jour UTC (session Postgres en UTC).
 */

import type { Dataset } from './types';
import type { RawMonoMultiExtractRow } from '../core/mono-multi-extract';
import { pickAsOfSnapshot } from '../core/asof';

/** lpad(x, 9, '0') Postgres : complète à gauche ET tronque à 9 si plus long. */
const lpad9 = (s: string) => (s.length >= 9 ? s.slice(0, 9) : s.padStart(9, '0'));

interface DatedValue {
  date: Date;
  value: number;
}

/** Sélection as-of dans une liste datée : même règle que le LATERAL (via pickAsOfSnapshot). */
function pickValueAsOf(list: DatedValue[], close: Date | null): number {
  const picked = pickAsOfSnapshot(list.map((s) => s.date), close)!;
  return list.find((s) => s.date.getTime() === picked.getTime())!.value;
}

export function extractRows(ds: Dataset): RawMonoMultiExtractRow[] {
  const ejByGeo = new Map<string, DatedValue[]>();
  for (const r of ds.ejSnapshots) {
    const k = lpad9(r.finessGeo);
    const list = ejByGeo.get(k) ?? [];
    list.push({ date: new Date(r.snapshotDate), value: r.ejSize });
    ejByGeo.set(k, list);
  }
  const capByGeo = new Map<string, DatedValue[]>();
  for (const r of ds.capacitySnapshots) {
    const k = lpad9(r.finessGeo);
    const list = capByGeo.get(k) ?? [];
    list.push({ date: new Date(r.snapshotDate), value: r.capacityInstalled });
    capByGeo.set(k, list);
  }

  const out: RawMonoMultiExtractRow[] = [];
  for (const e of ds.essms) {
    if (e.score === null) continue; // WHERE raw->>'moy_objectifs_100' IS NOT NULL
    const geo = lpad9(e.finessGeo);
    const ejList = ejByGeo.get(geo);
    if (!ejList || ejList.length === 0) continue; // JOIN LATERAL (INNER) finess_ej_mapping
    const close = e.evalDate ? new Date(e.evalDate) : null;
    const ejSize = pickValueAsOf(ejList, close);
    const capList = capByGeo.get(geo);
    const capacity = capList && capList.length > 0 ? pickValueAsOf(capList, close) : null; // LEFT JOIN LATERAL

    out.push({
      score: e.score,
      is_multi: ejSize >= 2,
      ej_size: ejSize,
      // Les types du Dataset garantissent déjà des strings, mais on garde le
      // COALESCE défensif du SQL si un générateur laissait passer un null.
      region: e.region ?? '',
      statut: e.statut ?? '',
      categ: e.categ ?? '',
      code: e.categCode ?? '',
      departement: e.departement ?? '',
      eval_date: close,
      capacity,
      cabinet: e.cabinet, // oe_nom : PAS de COALESCE dans le SQL — null passe tel quel
    });
  }
  return out;
}
