import { describe, it, expect } from 'vitest';
import { buildGeneralCsv, buildCabinetCsv } from './cotations-csv';
import type { CotationCabinetRow, CotationCabinetProfile } from './cotations';

const row: CotationCabinetRow = {
  cabinet: 'CAB; A', nStructures: 40, reliability: 'fiable',
  gradeShare: { A: 0.26, B: 0.48, C: 0.24, D: 0.02 }, chapterMeans: [3.05, 2.58, null],
  imperativeSummary: { meanEvaluated: 7.4, metRate: 0.82, above35Rate: 0.19 },
};

describe('cotations CSV', () => {
  it('vue générale : BOM, entêtes, séparateur ;, décimale virgule, champ échappé', () => {
    const csv = buildGeneralCsv([row]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Cabinet;n;Fiabilité;A %;B %;C %;D %;Ch.1;Ch.2;Ch.3;CI évalués (moy.);CI atteints %;CI > 3,5 %');
    expect(csv).toContain('"CAB; A";40;suffisante;26,0;48,0;24,0;2,0;3,05;2,58;;7,4;82,0;19,0');
  });
  it('profil cabinet : une ligne par structure', () => {
    const profile = { ...row, cabinet: 'CAB A', imperatives: [],
      establishments: [{ finessGeo: '100000001', name: 'EHPAD X', commune: 'Paris', grade: 'C' as const, chapters: [2, null, 3] }],
    } as CotationCabinetProfile;
    const csv = buildCabinetCsv(profile);
    expect(csv).toContain('FINESS;Structure;Commune;Grade;Ch.1;Ch.2;Ch.3');
    expect(csv).toContain('100000001;EHPAD X;Paris;C;2,00;;3,00');
  });
  it('échappe un retour-chariot \\r isolé (RFC-4180 : sinon la ligne serait scindée)', () => {
    const profile = { ...row, cabinet: 'CAB A', imperatives: [],
      establishments: [{ finessGeo: '1', name: 'Maison\rBleue', commune: 'Lyon', grade: 'A' as const, chapters: [1, 2, 3] }],
    } as CotationCabinetProfile;
    const csv = buildCabinetCsv(profile);
    // Le nom contenant \r doit être mis entre guillemets → un seul enregistrement.
    expect(csv).toContain('"Maison\rBleue"');
  });
});
