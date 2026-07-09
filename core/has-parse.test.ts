import { describe, it, expect } from 'vitest';
import { essmsRowFromRaw, type RawParquetRow } from './has-parse';

const baseRaw: RawParquetRow = {
  finess_geo: '010000001',
  moy_objectifs_100: 82.5,
  oe_nom: 'CAB A',
  indice_qualite: 'B',
  cotation_chapitre_1: 3.05,
  cotation_chapitre_2: 2.58,
  cotation_chapitre_3: 2.71,
  'cotation_critere_imperatif_2.2.1': 3.1,
  'cotation_critere_imperatif_2.4.3': 2.6,
  'cotation_critere_imperatif_3.8.2': null, // non coté → exclu
  nb_ci: 7,
  nb_ci_atteints: 6,
  nb_ci_sup_3_5: 2,
};

describe('essmsRowFromRaw — cotations', () => {
  it('extrait grade, chapitres, critères impératifs (non nuls, triés) et compteurs', () => {
    const r = essmsRowFromRaw(baseRaw);
    expect(r.grade).toBe('B');
    expect(r.chapters).toEqual([3.05, 2.58, 2.71]);
    expect(r.imperatives).toEqual([
      { code: '2.2.1', value: 3.1 },
      { code: '2.4.3', value: 2.6 },
    ]);
    expect(r.ciEvaluated).toBe(7);
    expect(r.ciMet).toBe(6);
    expect(r.ciAbove35).toBe(2);
  });
  it('valeurs absentes → null / listes vides, grade invalide → null', () => {
    const r = essmsRowFromRaw({ finess_geo: '010000002', indice_qualite: 'Z' });
    expect(r.grade).toBeNull();
    expect(r.chapters).toEqual([null, null, null]);
    expect(r.imperatives).toEqual([]);
    expect(r.ciEvaluated).toBeNull();
  });
  it('bornage véracité : cotations hors échelle 1–4 → null / exclues', () => {
    const r = essmsRowFromRaw({
      finess_geo: '010000003',
      cotation_chapitre_1: 5, cotation_chapitre_2: 0, cotation_chapitre_3: 3,
      'cotation_critere_imperatif_2.2.1': 9, 'cotation_critere_imperatif_2.4.3': 4,
    });
    expect(r.chapters).toEqual([null, null, 3]);            // 5 et 0 hors [1,4] → null
    expect(r.imperatives).toEqual([{ code: '2.4.3', value: 4 }]); // 9 hors échelle exclu
  });
  it('critères impératifs triés numériquement (3.6 avant 3.11, pas lexicographiquement)', () => {
    const r = essmsRowFromRaw({
      finess_geo: '010000004',
      'cotation_critere_imperatif_3.11.1': 3,
      'cotation_critere_imperatif_3.6.2': 2,
    });
    expect(r.imperatives).toEqual([
      { code: '3.6.2', value: 2 },
      { code: '3.11.1', value: 3 },
    ]);
  });
});
