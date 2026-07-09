import { describe, it, expect } from 'vitest';
import { buildCabinetRankingTable, renderCabinetRankingPdf } from './cabinet-ranking-pdf';
import { extractPdfText } from './__fixtures__/pdf-text';
import type { CabinetDetail } from '../store/cabinet-detail';

const DETAIL: CabinetDetail = {
  cabinet: 'CABINET EXEMPLE',
  nEvaluations: 3,
  meanCabinet: 72.5,
  meanNational: 78.0,
  gapVsNational: -5.5,
  establishments: [
    { finessGeo: '750000001', name: 'EHPAD Les Tilleuls', address: '1 rue A, 75001 Paris', score: 61, evalDate: '2025-03-10' },
    { finessGeo: '750000002', name: 'SSIAD du Centre', address: '2 rue B, 75002 Paris', score: 74, evalDate: '2024-11-02' },
    { finessGeo: '750000003', name: 'Residence Autonomie', address: '', score: 88, evalDate: null },
  ],
};

describe('buildCabinetRankingTable', () => {
  it('colonnes + une ligne par structure, rang 1..N, tri croissant conservé', () => {
    const t = buildCabinetRankingTable(DETAIL);
    expect(t.columns).toEqual(['Rang', 'Structure', 'Adresse', 'Score /100', 'Date']);
    expect(t.rows).toHaveLength(3);
    expect(t.rows[0][0]).toBe('1');
    expect(t.rows[2][0]).toBe('3');
    // 1re ligne = score le plus bas
    expect(t.rows[0][1]).toBe('EHPAD Les Tilleuls');
    expect(t.rows[0][3]).toBe('61');
    // date null -> tiret
    expect(t.rows[2][4]).toBe('—');
    // date ISO -> JJ/MM/AAAA
    expect(t.rows[0][4]).toBe('10/03/2025');
  });
});

describe('renderCabinetRankingPdf', () => {
  it('rend un PDF lisible : cabinet, structures, cadrage factuel, aucun glyphe strippé', async () => {
    const buf = await renderCabinetRankingPdf(DETAIL, 'HAS du 25/06/2026');
    expect(buf.length).toBeGreaterThan(1000);
    const text = extractPdfText(buf).replace(/\s+/g, ' ');
    expect(text).toContain('CABINET EXEMPLE');
    expect(text).toContain('EHPAD Les Tilleuls');
    expect(text).toContain('du score le plus bas au plus élevé');
    expect(text).toContain('conformité méthodologique');
    // aucun caractère avalé par WinAnsi (α β − ≠)
    expect(text).not.toMatch(/[αβ−≠]/);
    // charte anti-dénigrement : pas de qualificatif
    expect(text).not.toMatch(/pire|mauvais/i);
  });
});
