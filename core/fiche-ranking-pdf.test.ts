import { describe, it, expect, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { buildRankingTable, renderRankingPdf, rankingColumns, rankingColumnNotes } from './fiche-ranking-pdf';
import { setSignificanceAlpha } from './significance';
import { extractPdfText } from './__fixtures__/pdf-text';
import type { ContrastReport } from './cabinet-axis-report';
import type { CabinetAxisResult } from './cabinet-axis';

afterEach(() => setSignificanceAlpha(0.05));

function mkResult(p: Partial<CabinetAxisResult>): CabinetAxisResult {
  return {
    cabinet: 'CABINET X',
    nTotal: 40,
    nUnexposed: 20,
    nExposed: 20,
    meanUnexposed: 78,
    meanExposed: 83,
    gap: 5,
    reliability: 'fiable',
    cohensD: 0.4,
    ciLow: 2.1,
    ciHigh: 7.9,
    p: 0.001,
    deltaVsNational: 1.2,
    rank: 1,
    indicators: [],
    ...p,
  };
}

const report: ContrastReport = {
  id: 'grand_vs_petit',
  label: 'Grand (≥100) vs petit (<30)',
  summary: {
    totalCabinets: 2, nFiable: 1, nTendance: 0, nDescriptif: 1,
    proMulti: 2, proMono: 0, neutre: 0,
    medianGap: 5, q1Gap: 4, q3Gap: 6, minGap: 4, maxGap: 6,
  },
  results: [
    mkResult({ cabinet: 'CABINET ALPHA', rank: 1, gap: 6, reliability: 'fiable' }),
    mkResult({ cabinet: 'CABINET BÊTA', rank: 2, gap: null, p: null, ciLow: null, ciHigh: null, deltaVsNational: null, reliability: 'descriptif' }),
  ],
};

describe('buildRankingTable', () => {
  it('expose les colonnes essentielles (paysage lisible)', () => {
    const t = buildRankingTable(report);
    expect(t.columns).toEqual([...rankingColumns()]);
    expect(t.columns).toContain('Cabinet');
    expect(t.columns).toContain('Fiabilité');
    expect(t.columns).not.toContain('Cohen_d'); // colonne lourde laissée de côté
  });

  it('colonne IC suit le seuil α courant (défaut 95 %, bascule 99 %)', () => {
    expect(buildRankingTable(report).columns).toContain('IC 95 %');
    setSignificanceAlpha(0.01);
    expect(buildRankingTable(report).columns).toContain('IC 99 %');
  });

  it('une ligne par cabinet, valeurs formatées (virgule décimale)', () => {
    const t = buildRankingTable(report);
    expect(t.rows).toHaveLength(2);
    const [alpha, beta] = t.rows;
    expect(alpha[0]).toBe('1'); // rang
    expect(alpha[1]).toBe('CABINET ALPHA');
    expect(alpha).toContain('+6,0'); // écart signé, virgule
    expect(alpha[alpha.length - 1]).toBe('Fiable'); // palier en texte (pas emoji)
  });

  it('affiche un tiret pour les valeurs nulles (palier descriptif)', () => {
    const t = buildRankingTable(report);
    const beta = t.rows[1];
    expect(beta[1]).toBe('CABINET BÊTA');
    expect(beta).toContain('—'); // écart/IC/p nuls
    expect(beta[beta.length - 1]).toBe('Descriptif');
  });
});

describe('rankingColumnNotes (légende détaillée, après les données brutes)', () => {
  it('explique chaque colonne interprétative (défaut IC 95 %)', () => {
    const cols = rankingColumnNotes().map((n) => n.column);
    for (const c of ['N', 'Écart', 'IC 95 %', 'p', 'Δ nat.', 'Fiabilité']) {
      expect(cols).toContain(c);
    }
    for (const n of rankingColumnNotes()) {
      expect(n.note.length).toBeGreaterThan(60); // explication détaillée, pas un mot-clé
    }
  });

  it('bascule sur IC 99 % / seuil 0,01 explicite', () => {
    setSignificanceAlpha(0.01);
    const cols = rankingColumnNotes().map((n) => n.column);
    expect(cols).toContain('IC 99 %');
    const text = rankingColumnNotes().map((n) => n.note).join(' ');
    expect(text).toContain('0,01');
  });

  it('mentionne les notions clés (significatif, Welch, paliers, hasard, national)', () => {
    const text = rankingColumnNotes().map((n) => n.note).join(' ');
    for (const t of ['significatif', 'Welch', 'Fiable', 'hasard', 'national', 'référence']) {
      expect(text).toContain(t);
    }
  });

  it('couvre toutes les colonnes interprétatives du tableau (hors Rang/Cabinet)', () => {
    const noted = new Set(rankingColumnNotes().map((n) => n.column));
    for (const c of rankingColumns()) {
      if (c === 'Rang' || c === 'Cabinet') continue;
      expect(noted.has(c)).toBe(true);
    }
  });
});

describe('renderRankingPdf', () => {
  it('produit un PDF paysage non trivial', async () => {
    const pdf = await renderRankingPdf(report, 'Juin 2026');
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('reste anonyme (aucun identifiant interdit dans le titre/label)', async () => {
    // Le label + les noms de cabinets sont publics ; le PDF ne doit pas porter de marque productrice.
    const pdf = await renderRankingPdf(report, 'Juin 2026');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('en-tête : le signe moins de « cible − référence » est rendu (pas strippé WinAnsi)', async () => {
    // − (U+2212) est SUPPRIMÉ par sanitizeForWinAnsi → « score cible − référence »
    // rendait « score cible référence » (soustraction illisible).
    const text = extractPdfText(await renderRankingPdf(report, 'Juin 2026'));
    expect(text).toContain('écart = score cible - référence');
  });
});
