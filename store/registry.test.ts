/**
 * Registre des cabinets : ligne de vie (première/dernière
 * évaluation publiée, volume par année) reconstruite depuis l'historique
 * public des évaluations, + diff entre deux versions du dataset (refresh)
 * pour détecter entrées/sorties. Formulation STRICTEMENT factuelle imposée :
 * un cabinet disparu « n'apparaît plus dans les données
 * publiées », jamais « a fermé » / « a perdu son accréditation » — la donnée
 * publique ne permet pas de conclure sur la cause (y compris renommage, cf
 * limite documentée dans registry.ts).
 */

import { describe, it, expect } from 'vitest';
import { cabinetRegistry, diffRegistries, disappearedLabel } from './registry';
import type { EvalHistoryRow } from './types';

const H = (cabinet: string, date: string): EvalHistoryRow =>
  ({ evalCode: `${cabinet}-${date}`, cabinet, dateCloture: date, region: null });

describe('cabinetRegistry', () => {
  it('ligne de vie : première/dernière éval + volume par année', () => {
    const reg = cabinetRegistry([H('A', '2022-03-01'), H('A', '2024-11-15'), H('B', '2023-06-01')]);
    const a = reg.find((r) => r.cabinet === 'A')!;
    expect(a.firstEval).toBe('2022-03-01');
    expect(a.lastEval).toBe('2024-11-15');
    expect(a.totalEvals).toBe(2);
    expect(a.byYear).toEqual({ 2022: 1, 2024: 1 });
  });

  it('diff entre deux versions : entrées et sorties, formulation factuelle', () => {
    const before = cabinetRegistry([H('A', '2022-01-01'), H('B', '2022-01-01')]);
    const after = cabinetRegistry([H('A', '2022-01-01'), H('C', '2025-01-01')]);
    const d = diffRegistries(before, after);
    expect(d.appeared.map((r) => r.cabinet)).toEqual(['C']);
    expect(d.disappeared.map((r) => r.cabinet)).toEqual(['B']);
    expect(d.disappearedLabel('B', '2022-01-01')).toBe(
      "B : n'apparaît plus dans les données publiées (dernière évaluation publiée le 01/01/2022)"
    );
    // Export autonome (frontière IPC) : même formulation que la propriété.
    expect(disappearedLabel('B', '2022-01-01')).toBe(d.disappearedLabel('B', '2022-01-01'));
  });

  it('agrégation même année : deux évals 2023 → byYear {2023: 2}', () => {
    const reg = cabinetRegistry([H('A', '2023-01-01'), H('A', '2023-09-01')]);
    const a = reg[0];
    expect(a.byYear).toEqual({ 2023: 2 });
    expect(a.totalEvals).toBe(2);
  });

  it('lignes avec cabinet ou dateCloture null sont ignorées (comptage et bornes)', () => {
    const reg = cabinetRegistry([
      H('A', '2022-01-01'),
      { evalCode: 'x', cabinet: null, dateCloture: '2023-01-01', region: null },
      { evalCode: 'y', cabinet: 'A', dateCloture: null, region: null },
    ]);
    expect(reg).toHaveLength(1);
    const a = reg[0];
    expect(a.totalEvals).toBe(1);
    expect(a.firstEval).toBe('2022-01-01');
    expect(a.lastEval).toBe('2022-01-01');
  });

  it('un cabinet présent dans les deux versions n’est ni apparu ni disparu', () => {
    const before = cabinetRegistry([H('A', '2022-01-01')]);
    const after = cabinetRegistry([H('A', '2022-01-01'), H('A', '2023-01-01')]);
    const d = diffRegistries(before, after);
    expect(d.appeared.map((r) => r.cabinet)).not.toContain('A');
    expect(d.disappeared.map((r) => r.cabinet)).not.toContain('A');
  });

  it('registre trié par ordre alphabétique français', () => {
    const reg = cabinetRegistry([H('Zeta', '2022-01-01'), H('Alpha', '2022-01-01'), H('Émile', '2022-01-01')]);
    expect(reg.map((r) => r.cabinet)).toEqual(['Alpha', 'Émile', 'Zeta']);
  });
});
