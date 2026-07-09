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
    { finessGeo: '750000001', name: 'EHPAD Les Tilleuls', address: '1 rue A, 75001 Paris', evalDate: '2025-03-10' },
    { finessGeo: '750000002', name: 'SSIAD du Centre', address: '2 rue B, 75002 Paris', evalDate: '2024-11-02' },
    { finessGeo: '750000003', name: 'Residence Autonomie', address: '', evalDate: null },
  ],
};

describe('buildCabinetRankingTable', () => {
  it('colonnes Structure/Adresse/Date, une ligne par structure, sans rang ni score', () => {
    const t = buildCabinetRankingTable(DETAIL);
    expect(t.columns).toEqual(['Structure', 'Adresse', 'Date']);
    expect(t.rows).toHaveLength(3);
    expect(t.rows[0][0]).toBe('EHPAD Les Tilleuls');
    expect(t.rows[0][1]).toBe('1 rue A, 75001 Paris');
    // date ISO -> JJ/MM/AAAA
    expect(t.rows[0][2]).toBe('10/03/2025');
    // date null -> tiret
    expect(t.rows[2][2]).toBe('—');
    // aucun score chiffré dans les lignes
    expect(t.rows.flat()).not.toContain('61');
  });
});

describe('renderCabinetRankingPdf', () => {
  it('rend un PDF lisible : cabinet, structures, cadrage factuel, aucun glyphe strippé', async () => {
    const buf = await renderCabinetRankingPdf(DETAIL, 'HAS du 25/06/2026');
    expect(buf.length).toBeGreaterThan(1000);
    const text = extractPdfText(buf).replace(/\s+/g, ' ');
    expect(text).toContain('CABINET EXEMPLE');
    expect(text).toContain('EHPAD Les Tilleuls');
    expect(text).toContain('Structures évaluées par');
    expect(text).toContain('satisfaction des exigences du référentiel');
    // aucun caractère avalé par WinAnsi (α β − ≠)
    expect(text).not.toMatch(/[αβ−≠]/);
    // charte anti-dénigrement : pas de qualificatif
    expect(text).not.toMatch(/pire|mauvais/i);
  });
});
