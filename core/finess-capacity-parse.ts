/**
 * FINESS — capacité installée par ESSMS (fiche n°006 « capacité »).
 *
 * Parser autonome — aucune dépendance Prisma/réseau.
 *
 * Source : jeu data.gouv.fr `finess-extraction-des-equipements-sociaux-et-medico-sociaux`
 * (résource cs1100505, CSV latin-1, ';'-délimité). Format à 2 sections :
 *   - ligne d'en-tête `finess;etalab;<n>;<YYYY-MM-DD>` (date d'extraction)
 *   - lignes `structureet;<geo>;<ej>` (ignorées ici)
 *   - lignes `equipementsocial;<geo>;de;libde;ta;libta;client;libclient;sourceinfo;
 *     capinstot;...;indsupinst;...` (spec etalab_cs1100505).
 *
 * Capacité installée d'un ESSMS = SOMME de `capinstot` (champ 10, idx 9) sur ses
 * lignes d'équipement NON supprimées (`indsupinst` ≠ 'O', champ 16, idx 15).
 * Validé : moyenne EHPAD ≈ 85,8 lits (médiane 80).
 */

import { parseFinessSnapshotDate } from './finess-parse';

export interface FinessCapacityRow {
  finessGeo: string;
  capacityInstalled: number;
}

export interface ParsedFinessCapacity {
  snapshotDate: Date | null;
  rows: FinessCapacityRow[];
}

function pad9(code: string): string {
  return code.padStart(9, '0');
}

/** Parse une ligne `equipementsocial` → geo + capacité installée + drapeau supprimée. */
export function parseEquipementLine(
  line: string,
): { finessGeo: string; capInstTot: number; suppressed: boolean } | null {
  if (!line || !line.trim()) return null;
  const parts = line.split(';');
  if (parts[0] !== 'equipementsocial') return null;
  const geo = (parts[1] ?? '').trim();
  if (!geo) return null;
  const capRaw = (parts[9] ?? '').trim();
  const capInstTot = capRaw === '' ? 0 : Math.trunc(Number(capRaw)) || 0;
  const suppressed = (parts[15] ?? '').trim() === 'O';
  return { finessGeo: pad9(geo), capInstTot, suppressed };
}

/** Agrège la capacité installée par finess_geo (hors installations supprimées). */
export function buildFinessCapacity(lines: Iterable<string>): ParsedFinessCapacity {
  let snapshotDate: Date | null = null;
  const byGeo = new Map<string, number>();

  for (const line of lines) {
    if (snapshotDate === null) {
      const d = parseFinessSnapshotDate(line);
      if (d) {
        snapshotDate = d;
        continue;
      }
    }
    const eq = parseEquipementLine(line);
    if (!eq || eq.suppressed) continue;
    byGeo.set(eq.finessGeo, (byGeo.get(eq.finessGeo) ?? 0) + eq.capInstTot);
  }

  const rows: FinessCapacityRow[] = [];
  for (const [finessGeo, capacityInstalled] of byGeo) {
    rows.push({ finessGeo, capacityInstalled });
  }
  return { snapshotDate, rows };
}
