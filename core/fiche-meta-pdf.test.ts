import { describe, it, expect } from 'vitest';
import { renderCabinetMatrixPdf, renderPortfolioPdf, renderMetaRankingPdf, buildMatrixTable } from './fiche-meta-pdf';
import { extractPdfText } from './__fixtures__/pdf-text';
import type { CabinetProfile } from './cabinet-profile';

const prof = (over: Partial<CabinetProfile>): CabinetProfile => ({
  cabinet: 'CAB X',
  n: 40,
  niveauGlobal: 2.5,
  axes: [
    { axisId: 'mono_multi', label: 'Multi vs mono', gap: 4, reliability: 'fiable', significant: true },
    { axisId: 'statut', label: 'Commercial vs public', gap: null, reliability: null, significant: false },
  ],
  portfolio: {
    secteurCounts: { 'PA': 30, 'PH adultes': 5, 'PH enfants': 3, 'Autres': 2 },
    dominantSecteur: 'PA', dominantShare: 0.75, hhi: 0.6, specialized: true,
  },
  nSignificantAxes: 1,
  ...over,
});

describe('buildMatrixTable', () => {
  it('une ligne par cabinet : rang, cabinet, N, niveau, puis écart phare par axe', () => {
    const t = buildMatrixTable([prof({ cabinet: 'CAB A' })]);
    expect(t.columns[0]).toBe('Rang');
    expect(t.columns).toContain('Niveau');
    expect(t.rows[0][1]).toBe('CAB A');
    expect(t.rows[0]).toContain('+4,0 F'); // écart phare + marqueur palier
    expect(t.rows[0]).toContain('—'); // axe non calculable
  });
});

describe('renderers PDF méta', () => {
  it('matrice → PDF paysage', async () => {
    const pdf = await renderCabinetMatrixPdf([prof({})], 'Juin 2026');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
  it('portefeuille → PDF', async () => {
    const pdf = await renderPortfolioPdf([prof({})], 'Juin 2026');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
  it('méta-classement → PDF', async () => {
    const pdf = await renderMetaRankingPdf([prof({})], 'Juin 2026');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('légendes : « association/causalité » épelé lisiblement (≠ U+2260 strippé par WinAnsi)', async () => {
    // « association ≠ causalité » rendait « association causalité » — sens INVERSÉ.
    // Regex tolérante au wrapping PDF (l'extraction concatène les lignes sans espace).
    const matrix = extractPdfText(await renderCabinetMatrixPdf([prof({})], 'Juin 2026'));
    expect(matrix).toMatch(/une association n'est ?pas ?une ?causalité/);
    const ranking = extractPdfText(await renderMetaRankingPdf([prof({})], 'Juin 2026'));
    expect(ranking).toMatch(/une association n'est ?pas ?une ?causalité/);
  });
});
