/** Export CSV des cotations (Excel FR : séparateur ';', décimale virgule, BOM UTF-8). */
import type { CotationCabinetRow, CotationCabinetProfile } from './cotations';
import { reliabilityLabel } from './cotations';

const BOM = '﻿';
function cell(v: string | number | null, decimals?: number): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? v.toFixed(decimals ?? 0).replace('.', ',') : v;
  if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
const pct = (x: number | null): string => (x === null ? '' : (x * 100).toFixed(1).replace('.', ','));
const dec2 = (x: number | null): string => (x === null ? '' : x.toFixed(2).replace('.', ','));

export function buildGeneralCsv(rows: CotationCabinetRow[]): string {
  const head = 'Cabinet;n;Fiabilité;A %;B %;C %;D %;Ch.1;Ch.2;Ch.3;CI évalués (moy.);CI atteints %;CI > 3,5 %';
  const lines = rows.map((r) =>
    [
      cell(r.cabinet), cell(r.nStructures), cell(reliabilityLabel(r.reliability)),
      pct(r.gradeShare.A), pct(r.gradeShare.B), pct(r.gradeShare.C), pct(r.gradeShare.D),
      dec2(r.chapterMeans[0]), dec2(r.chapterMeans[1]), dec2(r.chapterMeans[2]),
      cell(r.imperativeSummary.meanEvaluated, 1),
      pct(r.imperativeSummary.metRate), pct(r.imperativeSummary.above35Rate),
    ].join(';'),
  );
  return BOM + [head, ...lines].join('\r\n') + '\r\n';
}

export function buildCabinetCsv(profile: CotationCabinetProfile): string {
  const head = 'FINESS;Structure;Commune;Grade;Ch.1;Ch.2;Ch.3';
  const lines = profile.establishments.map((e) =>
    [cell(e.finessGeo), cell(e.name), cell(e.commune), cell(e.grade ?? ''),
      dec2(e.chapters[0]), dec2(e.chapters[1]), dec2(e.chapters[2])].join(';'),
  );
  return BOM + [head, ...lines].join('\r\n') + '\r\n';
}
