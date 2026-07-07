import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataset } from './load';
import { cabinetDetail, listCabinets } from './cabinet-detail';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '__fixtures__', 'mini-dataset');

describe('cabinetDetail', () => {
  it('liste des cabinets triée, sans null, restreinte aux cabinets scorés', async () => {
    const ds = await loadDataset(FIX);
    const list = listCabinets(ds);
    expect(list).toContain('CAB_DETAIL');
    // Contrat picker : CAB BETA n'a qu'une ligne à score null → absent de la liste
    // (aucun choix du picker ne mène à un cabinetDetail null).
    expect(list).not.toContain('CAB BETA');
  });
  it('comparaison nationale + bottom-5 nominatif avec adresse', async () => {
    const ds = await loadDataset(FIX);
    const d = cabinetDetail(ds, 'CAB_DETAIL')!;
    expect(d.nEvaluations).toBe(7);
    expect(d.meanCabinet).toBeGreaterThan(0);
    expect(d.gapVsNational).toBeTypeOf('number');
    expect(d.lowestScored).toHaveLength(5);              // 7 étabs → bottom 5
    expect(d.lowestScored[0].score).toBeLessThanOrEqual(d.lowestScored[1].score);
    const first = d.lowestScored[0];
    expect(first.name).toBeTruthy();                      // officialLabel ou raisonSociale
    expect(first.address).toMatch(/\d{5}/);               // code postal présent
  });
  it('repli terminal : raisonSociale null + aucune ligne base-doc → nom FINESS, adresse vide', async () => {
    const ds = await loadDataset(FIX);
    const d = cabinetDetail(ds, 'CAB_DETAIL')!;
    // 700000007 (score 55) : dans le bottom-5 (index ≠ 0), sans base-doc NI raisonSociale.
    const seven = d.lowestScored.find((e) => e.finessGeo === '700000007')!;
    expect(seven.name).toBe('FINESS 700000007');
    expect(seven.address).toBe('');
  });
  it('formulation factuelle : structure de données, aucun qualificatif', async () => {
    const ds = await loadDataset(FIX);
    const d = cabinetDetail(ds, 'CAB_DETAIL')!;
    expect(JSON.stringify(d)).not.toMatch(/pire|mauvais|dénigr/i);
  });
  it('fmtAddress déduplique : line2 ≡ « CP commune » (motif base-doc réel) et line2 ≡ line1', async () => {
    const ds = await loadDataset(FIX);
    const d = cabinetDetail(ds, 'CAB_DETAIL')!;
    // 700000004 : addressLine2 = "75004 PARIS" duplique postalCode+commune (casse différente).
    const four = d.lowestScored.find((e) => e.finessGeo === '700000004')!;
    expect((four.address.match(/75004 Paris/gi) ?? []).length).toBe(1);
    expect(four.address).toBe('4 rue Detail, 75004 Paris');
    // 700000002 : addressLine2 = "2 Rue Detail" duplique addressLine1 (casse différente).
    const two = d.lowestScored.find((e) => e.finessGeo === '700000002')!;
    expect((two.address.match(/2 rue Detail/gi) ?? []).length).toBe(1);
    expect(two.address).toBe('2 rue Detail, 75002 Paris');
  });
});
