import { describe, it, expect } from 'vitest';
import { buildStatutsCsv, buildChronologieCsv, buildSortiesCsv } from './accreditations-csv';
import type { AccreditationsView } from './accreditations';

const view: AccreditationsView = {
  dernierEtat: '2026-08-13',
  dernierReleveCofrac: '2026-08-17',
  statuts: [
    {
      cabinet: 'ALPHA; CONSEIL', statut: 'sorti-avec-numero', siren: '111111111', num: '3-1000',
      dept: '59', dernierEtatPresent: '2026-07-16', premierEtatAbsent: '2026-08-13',
      concordance: null, concordanceDate: null,
    },
  ],
  tauxRapprochement: { rapproches: 1, total: 1 },
  entreesListeSansEvaluations: 0,
  chronologie: [
    { date: '2022-10-11', kind: 'etat', organismes: 42, accredites: 0, sansNumero: 42, source: 'relevé de la liste HAS' },
  ],
  mouvements: [],
  sorties: [
    {
      siren: '111111111', nom: 'ALPHA; CONSEIL', num: '3-1000', dept: '59',
      dernierPresent: '2026-07-16', premierAbsent: '2026-08-13',
      motif: 'non indiqué par la source', revenu: false,
      concordance: null, concordanceDate: null, piste: null,
    },
  ],
  faitsBilans: [],
  collecte: { sourceIntrouvableDepuis: null, prochaineCollecte: null },
};

describe('CSV accréditations (convention Excel FR)', () => {
  it('statuts : BOM, en-tête, point-virgule échappé, CRLF final', () => {
    const csv = buildStatutsCsv(view);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Cabinet;Statut;SIREN;');
    expect(csv).toContain('"ALPHA; CONSEIL"');
    expect(csv.endsWith('\r\n')).toBe(true);
    // Libellé neutre du statut, pas l'identifiant technique.
    expect(csv).toContain('Sorti de liste en portant un numéro');
  });

  it('chronologie et sorties : mêmes conventions, motif jamais qualifié', () => {
    expect(buildChronologieCsv(view)).toContain('2022-10-11;');
    const sorties = buildSortiesCsv(view);
    expect(sorties).toContain('non indiqué par la source');
  });
});
