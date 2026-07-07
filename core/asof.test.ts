// core/asof.test.ts
import { describe, it, expect } from 'vitest';
import { pickAsOfSnapshot } from './asof';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('pickAsOfSnapshot — règle as-of FINESS', () => {
  const snaps = [d('2021-12-31'), d('2022-12-31'), d('2023-12-31'), d('2024-12-31')];

  it('choisit la snapshot la plus récente <= date de clôture', () => {
    expect(pickAsOfSnapshot(snaps, d('2023-06-15'))).toEqual(d('2022-12-31'));
  });

  it('égalité exacte : la snapshot du jour même est éligible', () => {
    expect(pickAsOfSnapshot(snaps, d('2023-12-31'))).toEqual(d('2023-12-31'));
  });

  it('clôture postérieure à toutes : prend la plus récente', () => {
    expect(pickAsOfSnapshot(snaps, d('2030-01-01'))).toEqual(d('2024-12-31'));
  });

  it('clôture antérieure à toutes (avant historique) : repli sur la plus ancienne', () => {
    expect(pickAsOfSnapshot(snaps, d('2010-01-01'))).toEqual(d('2021-12-31'));
  });

  it('date de clôture NULL : repli sur la plus ancienne', () => {
    expect(pickAsOfSnapshot(snaps, null)).toEqual(d('2021-12-31'));
  });

  it('ordre d’entrée non trié : indifférent', () => {
    const shuffled = [d('2024-12-31'), d('2021-12-31'), d('2023-12-31'), d('2022-12-31')];
    expect(pickAsOfSnapshot(shuffled, d('2023-06-15'))).toEqual(d('2022-12-31'));
  });

  it('aucune snapshot : null', () => {
    expect(pickAsOfSnapshot([], d('2023-06-15'))).toBeNull();
  });
});
