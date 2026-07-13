/**
 * Historique mensuel de la Fiche cabinet — série LÉGÈRE (Mois, n, niveau global,
 * % grade A). La fiche complète d'un mois donné se recalcule à la demande via
 * buildFicheCabinet(ds, cabinet, mois) — rien n'est pré-généré.
 *
 * Univers : n et niveauGlobal sur l'univers du moteur 7 axes (extractRows,
 * lignes avec cabinet) — mêmes chiffres que la fiche PDF du même mois ;
 * gradeAShare sur l'univers cotations (essms gradées du cabinet).
 * Les évaluations sans date de clôture sont EXCLUES (impossible de les situer
 * dans le temps) et comptées dans `nUndated` — limite affichée par l'écran/PDF.
 */

import type { Dataset } from '../store/types';
import { extractRows } from '../store/extract';

export interface FicheHistoryRow {
  month: string; // 'YYYY-MM' (borne = fin de ce mois)
  n: number;
  niveauGlobal: number | null;
  gradeAShare: number | null;
}

export interface FicheCabinetHistory {
  cabinet: string;
  rows: FicheHistoryRow[];
  /** Évaluations du cabinet sans date de clôture (exclues de l'historique). */
  nUndated: number;
}

const nextMonth = (m: string): string => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

/**
 * Clé de mois UTC d'une date d'extraction (Date ou chaîne ISO).
 * Invariants : (a) ici, extractRows produit toujours des `Date` (la branche
 * chaîne est défensive, alignée sur le type RawMonoMultiExtractRow) ;
 * (b) l'équivalence avec la clé chaîne `evalDate.slice(0, 7)` utilisée par
 * asOfDataset et par `graded` tient parce que les dates du jeu sont des ISO
 * date-only ('AAAA-MM-JJ'), parsées à minuit UTC — toISOString restitue alors
 * le même mois. Invariant du jeu de données.
 */
const monthKey = (v: Date | string): string =>
  v instanceof Date ? v.toISOString().slice(0, 7) : v.slice(0, 7);

export function cabinetFicheHistory(ds: Dataset, cabinet: string): FicheCabinetHistory | null {
  const raw = extractRows(ds).filter((r) => (r.cabinet ?? '') !== '');
  if (!raw.some((r) => r.cabinet === cabinet)) return null;

  const dated: { month: string; score: number; mine: boolean }[] = [];
  let nUndated = 0;
  for (const r of raw) {
    const mine = r.cabinet === cabinet;
    if (r.eval_date == null) {
      if (mine) nUndated++;
      continue;
    }
    dated.push({ month: monthKey(r.eval_date), score: Number(r.score), mine });
  }

  const mineMonths = dated.filter((r) => r.mine).map((r) => r.month).sort();
  if (mineMonths.length === 0) return { cabinet, rows: [], nUndated };
  const first = mineMonths[0];
  const monthsSorted = dated.map((r) => r.month).sort();
  const last = monthsSorted[monthsSorted.length - 1];

  const graded = ds.essms
    .filter((e) => e.cabinet === cabinet && e.score !== null && e.grade !== null && e.evalDate !== null)
    .map((e) => ({ month: e.evalDate!.slice(0, 7), a: e.grade === 'A' }));

  const rows: FicheHistoryRow[] = [];
  for (let m = first; m <= last; m = nextMonth(m)) {
    const upto = dated.filter((r) => r.month <= m);
    const mine = upto.filter((r) => r.mine);
    const meanAll = upto.length ? upto.reduce((s, r) => s + r.score, 0) / upto.length : null;
    const meanMine = mine.length ? mine.reduce((s, r) => s + r.score, 0) / mine.length : null;
    const g = graded.filter((r) => r.month <= m);
    rows.push({
      month: m,
      n: mine.length,
      niveauGlobal: meanAll !== null && meanMine !== null ? meanMine - meanAll : null,
      gradeAShare: g.length ? g.filter((r) => r.a).length / g.length : null,
    });
  }
  return { cabinet, rows, nUndated };
}
