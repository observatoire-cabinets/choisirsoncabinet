/**
 * FINESS national répertoire — parser for the etalab "Établissements" stock CSV
 * (resource `etalab-cs1100502-stock-*` on data.gouv.fr).
 *
 * Parser autonome — aucune dépendance Prisma/réseau. Le cœur autonome est
 * complet et ne référence aucun module externe.
 *
 * Format: latin-1, ';'-delimited, one record per line. The first line is a
 * header marker (`finess;etalab;<n>;<YYYY-MM-DD>`) carrying the extraction date.
 * Establishment rows start with `structureet`; field 1 = finess_geo (FINESS ET),
 * field 2 = finess_ej (FINESS entité juridique = gestionnaire).
 *
 * This mapping drives the mono/multi classification (dérivation V1.0):
 * an ESSMS is `multi` iff its finess_ej groups ≥ 2 establishments in the FULL
 * national répertoire. `ej_size` is therefore counted over every structureet
 * row here, not only the HAS-evaluated cohort.
 */

export interface FinessEjMappingRow {
  finessGeo: string;
  finessEj: string;
  ejSize: number;
}

export interface ParsedFinessStock {
  snapshotDate: Date | null;
  rows: FinessEjMappingRow[];
}

/** FINESS codes are 9 digits; pad defensively to keep join keys consistent. */
function pad9(code: string): string {
  return code.padStart(9, '0');
}

/**
 * Parse one CSV line into a geo→ej pair. Returns null for the header, non-
 * `structureet` records, and rows missing either identifier.
 */
export function parseFinessStockLine(
  line: string,
): { finessGeo: string; finessEj: string } | null {
  if (!line || !line.trim()) return null;
  const parts = line.split(';');
  if (parts[0] !== 'structureet') return null;
  const geo = (parts[1] ?? '').trim();
  const ej = (parts[2] ?? '').trim();
  if (!geo || !ej) return null;
  return { finessGeo: pad9(geo), finessEj: pad9(ej) };
}

/**
 * Parse the extraction date from the header line
 * (`finess;etalab;<n>;<YYYY-MM-DD>`). Returns a UTC-midnight Date, or null when
 * the line is not a header or carries no parseable date.
 */
export function parseFinessSnapshotDate(line: string): Date | null {
  const parts = line.split(';');
  if (parts[0] !== 'finess') return null;
  const raw = (parts[3] ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build the deduplicated geo→ej mapping with precomputed `ej_size` from a
 * stream/iterable of CSV lines. Repeated finess_geo keeps the last mapping seen.
 */
export function buildFinessEjMapping(lines: Iterable<string>): ParsedFinessStock {
  let snapshotDate: Date | null = null;
  const geoToEj = new Map<string, string>();

  for (const line of lines) {
    if (snapshotDate === null) {
      const d = parseFinessSnapshotDate(line);
      if (d) {
        snapshotDate = d;
        continue;
      }
    }
    const parsed = parseFinessStockLine(line);
    if (parsed) geoToEj.set(parsed.finessGeo, parsed.finessEj);
  }

  const ejSize = new Map<string, number>();
  for (const ej of geoToEj.values()) {
    ejSize.set(ej, (ejSize.get(ej) ?? 0) + 1);
  }

  const rows: FinessEjMappingRow[] = [];
  for (const [finessGeo, finessEj] of geoToEj) {
    rows.push({ finessGeo, finessEj, ejSize: ejSize.get(finessEj) ?? 1 });
  }

  return { snapshotDate, rows };
}
