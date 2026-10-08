import { describe, it, expect } from 'vitest';
import {
  renderCabinetMatrixPdf,
  renderPortfolioPdf,
  renderMetaRankingPdf,
  buildMatrixTable,
  buildMetaRankingTable,
} from './fiche-meta-pdf';
import { extractPdfText, souple } from './__fixtures__/pdf-text';
import { axeNonConformeDefinition } from './cabinet-non-conformite';
import { buildFiche012Content } from './fiche-012-content';
import { sanitizeForWinAnsi } from './winansi';
import type { CabinetProfile } from './cabinet-profile';

const prof = (over: Partial<CabinetProfile>): CabinetProfile => ({
  cabinet: 'CAB X',
  n: 40,
  niveauGlobal: 2.5,
  axes: [
    { axisId: 'mono_multi', label: 'Multi vs mono', gap: 4, reliability: 'fiable', significant: true, nUnexposed: 20, nExposed: 20 },
    { axisId: 'statut', label: 'Commercial vs public', gap: null, reliability: null, significant: false, nUnexposed: 0, nExposed: 0 },
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

describe('buildMetaRankingTable', () => {
  it('rang et cabinet : axes signalés décroissants, ex æquo dans l’ordre d’entrée', () => {
    // Ordre d'entrée = niveau global décroissant (celui de buildCabinetProfiles).
    const profils = [
      prof({ cabinet: 'CAB Z', niveauGlobal: 3, nSignificantAxes: 1 }),
      prof({ cabinet: 'CAB B', niveauGlobal: 2, nSignificantAxes: 2 }),
      prof({ cabinet: 'CAB A', niveauGlobal: 1, nSignificantAxes: 1 }),
    ];
    const t = buildMetaRankingTable(profils);
    expect(t.columns.slice(0, 2)).toEqual(['Rang', 'Cabinet']);
    expect(t.rows.map((r) => r[0])).toEqual(['1', '2', '3']);
    expect(t.rows.map((r) => r[1])).toEqual(['CAB B', 'CAB Z', 'CAB A']);
    expect(t.rows.map((r) => r[4])).toEqual(['2 / 7', '1 / 7', '1 / 7']);
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

describe('légende du méta-classement — définition d’un axe non conforme', () => {
  it('imprime les quatre conditions, avec la même définition que la fiche 12', async () => {
    const txt = extractPdfText(await renderMetaRankingPdf([prof({})], 'Juin 2026'));
    expect(txt).toMatch(souple(axeNonConformeDefinition()));
    expect(txt).toMatch(souple('palier Fiable (≥ 30 évaluations par groupe)'));
    expect(txt).toMatch(souple('d de Cohen ≥ 0,2'));
    expect(txt).toMatch(souple('même sens que l’écart ajusté national'));
    expect(txt).toMatch(souple('correction de Holm appliquée, pour chaque cabinet, à ses seuls axes au palier Fiable'));
    const f12 = buildFiche012Content();
    expect(f12.verification?.kind === 'meta' ? f12.verification.regle : '').toContain(axeNonConformeDefinition());
  });

  it('ne réduit plus la définition à « Fiable ET significatif »', async () => {
    const txt = extractPdfText(await renderMetaRankingPdf([prof({})], 'Juin 2026'));
    expect(txt).not.toMatch(/Fiable \(>= ?30\/30\) ?ET ?significatif/);
  });

  it('la définition imprimée reste en WinAnsi : « ≥ » translittéré en « >= », rien de supprimé', () => {
    const def = axeNonConformeDefinition();
    expect(def).not.toMatch(/[^\x20-\x7E\xA0-\xFF’≥]/);
    expect(sanitizeForWinAnsi(def)).toContain('d de Cohen >= 0,2');
  });
});

describe('matrice de la fiche 3 — cohérence entre le renvoi et les colonnes', () => {
  // Garde-fou : le renvoi de la fiche 3 annonce « (écart, palier) » ; la matrice ne
  // doit pas porter d'autre information par axe (pas de valeur p en colonne).
  it('ne contient aucune colonne de valeur p (écart et palier seulement)', () => {
    const t = buildMatrixTable([prof({})]);
    expect(t.columns.some((c) => /^p$|valeur p|p-value/i.test(c))).toBe(false);
  });
});
