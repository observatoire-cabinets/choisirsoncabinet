import { describe, it, expect } from 'vitest';
import { decouperSegments, cotesDesPoints } from './positioning-segments';

describe('decouperSegments', () => {
  it('coupe exactement au croisement et change de côté', () => {
    // cabinet 2 → 0 ; ensemble 1 → 1 : croisement à mi-parcours.
    const s = decouperSegments([2, 0], [1, 1], [false, false]);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ i0: 0, v0: 2, i1: 0.5, v1: 1, cote: 'dessus' });
    expect(s[1]).toMatchObject({ i0: 0.5, v0: 1, i1: 1, v1: 0, cote: 'dessous' });
  });

  it('croisement asymétrique, ensemble en pente : dessus puis dessous', () => {
    // cabinet 4 → 0 ; ensemble 1 → 2 : croisement à t = 0,6, valeur 1,6.
    const s = decouperSegments([4, 0], [1, 2], [false, false]);
    expect(s).toHaveLength(2);
    expect(s[0].i0).toBe(0);
    expect(s[0].v0).toBe(4);
    expect(s[0].i1).toBeCloseTo(0.6);
    expect(s[0].v1).toBeCloseTo(1.6);
    expect(s[0].cote).toBe('dessus');
    expect(s[1].i0).toBeCloseTo(0.6);
    expect(s[1].v0).toBeCloseTo(1.6);
    expect(s[1].i1).toBe(1);
    expect(s[1].v1).toBe(0);
    expect(s[1].cote).toBe('dessous');
  });

  it('croisement asymétrique, ensemble en pente : dessous puis dessus', () => {
    // cabinet 0 → 4 ; ensemble 2 → 1 : croisement à t = 0,4, valeur 1,6.
    const s = decouperSegments([0, 4], [2, 1], [false, false]);
    expect(s).toHaveLength(2);
    expect(s[0].i0).toBe(0);
    expect(s[0].v0).toBe(0);
    expect(s[0].i1).toBeCloseTo(0.4);
    expect(s[0].v1).toBeCloseTo(1.6);
    expect(s[0].cote).toBe('dessous');
    expect(s[1].i0).toBeCloseTo(0.4);
    expect(s[1].v0).toBeCloseTo(1.6);
    expect(s[1].i1).toBe(1);
    expect(s[1].v1).toBe(4);
    expect(s[1].cote).toBe('dessus');
  });

  it('un mois sans valeur cabinet interrompt la courbe', () => {
    const s = decouperSegments([1, null, 1, 1], [0, 0, 0, 0], [false, false, false, false]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ i0: 2, i1: 3 });
  });

  it('un mois sans valeur d’ensemble garde le côté précédent', () => {
    const s = decouperSegments([0, 0, 0], [1, null, null], [false, false, false]);
    expect(s.map((x) => x.cote)).toEqual(['dessous', 'dessous']);
  });

  it('sans aucune courbe d’ensemble (rang) : tout au-dessus', () => {
    const s = decouperSegments([3, 2, 5], [null, null, null], [false, false, false]);
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.cote)).toEqual(['dessus', 'dessus']);
  });

  it('égalité au départ : le côté suit l’autre extrémité', () => {
    const s = decouperSegments([1, 0], [1, 1], [false, false]);
    expect(s).toHaveLength(1);
    expect(s[0].cote).toBe('dessous');
  });

  it('égalité d’un côté, ensemble absent de l’autre : le côté précédent est conservé', () => {
    const s = decouperSegments([0, 0, 1], [1, null, 1], [false, false, false]);
    expect(s.map((x) => x.cote)).toEqual(['dessous', 'dessous']);
  });

  it('égalité aux deux extrémités dès le départ : côté initial « dessus »', () => {
    const s = decouperSegments([0, 0], [0, 0], [false, false]);
    expect(s.map((x) => x.cote)).toEqual(['dessus']);
  });

  it('égalité après un segment en dessous : le côté précédent est conservé', () => {
    const s = decouperSegments([0, 0, 0], [1, 0, 0], [false, false, false]);
    expect(s.map((x) => x.cote)).toEqual(['dessous', 'dessous']);
  });

  it('le côté mémorisé avant une interruption est conservé après elle', () => {
    // Mois 0 en dessous de l'ensemble, puis interruption ; l'ensemble est absent
    // sur le segment final, qui reprend donc le côté mémorisé.
    const s = decouperSegments([0, null, 5, 5], [1, 1, null, null], [false, false, false, false]);
    expect(s.map((x) => x.cote)).toEqual(['dessous']);
    // Égalité au dernier mois avant l'interruption : elle ne change pas le côté
    // mémorisé, que reprend le segment suivant (ensemble absent).
    const t = decouperSegments([0, 0, null, 5, 5], [1, 0, 1, null, null], [false, false, false, false, false]);
    expect(t.map((x) => x.cote)).toEqual(['dessous', 'dessous']);
  });

  it('pointillé si l’une des deux extrémités est en effectif faible', () => {
    const s = decouperSegments([1, 1, 1], [0, 0, 0], [true, false, false]);
    expect(s.map((x) => x.pointille)).toEqual([true, false]);
  });

  it('pointillé si seule l’extrémité d’arrivée est en effectif faible', () => {
    const s = decouperSegments([1, 1], [0, 0], [false, true]);
    expect(s.map((x) => x.pointille)).toEqual([true]);
  });

  it('un croisement avec un mois en effectif faible : les deux moitiés sont en pointillé', () => {
    const s = decouperSegments([2, 0], [1, 1], [true, false]);
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.pointille)).toEqual([true, true]);
  });

  it('série vide ou d’un seul point : aucun segment', () => {
    expect(decouperSegments([], [], [])).toEqual([]);
    expect(decouperSegments([1], [0], [false])).toEqual([]);
  });
});

describe('cotesDesPoints', () => {
  it('signe de l’écart cabinet moins ensemble ; null pour un mois sans valeur du cabinet', () => {
    expect(cotesDesPoints([2, null, 0], [1, 1, 1])).toEqual(['dessus', null, 'dessous']);
  });

  it('égalité ou ensemble absent : côté du point renseigné précédent', () => {
    expect(cotesDesPoints([0, 1, 5, null, 3], [1, 1, null, 0, null])).toEqual(['dessous', 'dessous', 'dessous', null, 'dessous']);
  });

  it('sans écart connu dès le départ (rang) : « dessus »', () => {
    expect(cotesDesPoints([3, 2, 5], [null, null, null])).toEqual(['dessus', 'dessus', 'dessus']);
    expect(cotesDesPoints([1, 0], [1, 1])).toEqual(['dessus', 'dessous']);
  });

  it('même côté que le segment voisin, y compris après une interruption', () => {
    const cabinet = [0, null, 5, 5];
    const ensemble = [1, 1, null, null];
    expect(cotesDesPoints(cabinet, ensemble)).toEqual(['dessous', null, 'dessous', 'dessous']);
    expect(decouperSegments(cabinet, ensemble, [false, false, false, false]).map((x) => x.cote)).toEqual(['dessous']);
  });
});
