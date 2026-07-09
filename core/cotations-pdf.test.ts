import { describe, it, expect } from 'vitest';
import { buildGeneralPdfTable, renderCotationsGeneralPdf, renderCotationCabinetPdf } from './cotations-pdf';
import type { CotationCabinetRow, CotationCabinetProfile } from './cotations';

const row: CotationCabinetRow = {
  cabinet: 'CAB A', nStructures: 40, reliability: 'fiable',
  gradeShare: { A: 0.26, B: 0.48, C: 0.24, D: 0.02 }, chapterMeans: [3.05, 2.58, 2.71],
  imperativeSummary: { meanEvaluated: 7.4, metRate: 0.82, above35Rate: 0.19 },
};

describe('cotations PDF', () => {
  it('table de la vue générale : entêtes + ligne formatée', () => {
    const t = buildGeneralPdfTable([row]);
    expect(t.columns).toEqual(['Cabinet', 'n', 'Fiab.', 'A%', 'B%', 'C%', 'D%', 'Ch.1', 'Ch.2', 'Ch.3', 'CI atteints']);
    expect(t.rows[0]).toEqual(['CAB A', '40', 'suffisante', '26', '48', '24', '2', '3,05', '2,58', '2,71', '82 %']);
  });
  it('génère des PDF non vides', async () => {
    const general = await renderCotationsGeneralPdf([row], 'Données HAS 2026');
    expect(general.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const profile = { ...row, imperatives: [{ code: '2.2.1', mean: 3.1, nStructures: 40 }],
      establishments: [{ finessGeo: '1', name: 'EHPAD X', commune: 'Paris', grade: 'C' as const, chapters: [2, 2, 2] }] } as CotationCabinetProfile;
    const cab = await renderCotationCabinetPdf(profile, 'Données HAS 2026');
    expect(cab.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
