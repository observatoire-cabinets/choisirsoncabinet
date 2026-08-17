import { describe, it, expect } from 'vitest';
import { extractPdfText } from './__fixtures__/pdf-text';
import { renderAccreditationsPdf } from './accreditations-pdf';
import type { AccreditationsView } from './accreditations';

const view: AccreditationsView = {
  dernierEtat: '2026-08-13',
  dernierReleveCofrac: '2026-08-17',
  statuts: [
    {
      cabinet: 'ALPHA CONSEIL', statut: 'sorti-avec-numero', siren: '111111111', num: '3-1000',
      dept: '59', dernierEtatPresent: '2026-07-16', premierEtatAbsent: '2026-08-13',
      concordance: null, concordanceDate: null,
    },
  ],
  tauxRapprochement: { rapproches: 1, total: 1 },
  entreesListeSansEvaluations: 0,
  chronologie: [
    { date: '2023-09-24', kind: 'etat', organismes: 115, accredites: 4, sansNumero: 111, source: 'relevé de la liste HAS' },
    { date: '2024-12-31', kind: 'bilan', organismes: 128, accredites: 87, sansNumero: 41, source: 'Bilan annuel HAS 2024' },
  ],
  mouvements: [
    { de: '2023-09-24', a: '2026-03-06', jours: 894, avant: 115, apres: 118, entrees: 28, sorties: 25 },
  ],
  sorties: [
    {
      siren: '111111111', nom: 'ALPHA CONSEIL', num: '3-1000', dept: '59',
      dernierPresent: '2026-07-16', premierAbsent: '2026-08-13',
      motif: 'non indiqué par la source', revenu: false,
      concordance: null, concordanceDate: null, piste: null,
    },
  ],
  faitsBilans: [],
  collecte: { sourceIntrouvableDepuis: null, prochaineCollecte: null },
};

describe('renderAccreditationsPdf', () => {
  it('synthèse (défaut) : PDF valide portant les trois volets et les réserves de méthode', async () => {
    const pdf = await renderAccreditationsPdf(view, '17/08/2026');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const text = extractPdfText(pdf).replace(/\s+/g, ' ');
    expect(text).toMatch(/Statut des cabinets/i);
    expect(text).toMatch(/Chronologie de la liste/i);
    expect(text).toMatch(/Journal des sorties/i);
    // Numéros de volet translittérés (① ② ③ hors WinAnsi) : le titre doit
    // rester numéroté, pas juste tronqué de son numéro.
    expect(text).toMatch(/1\. ?Statut des cabinets/i);
    expect(text).toMatch(/2\. ?Chronologie/i);
    expect(text).toMatch(/3\. ?Journal des sorties/i);
    // Réserve de méthode imprimée — formulation non négociable.
    expect(text).toMatch(/motif ?non ?indiqu/i);
    expect(text).toMatch(/absence ?d'observation/i);
    // Le trou de 894 jours est signalé comme période non observée.
    expect(text).toMatch(/894/);
  });

  it('PDF par volet : seules les sections demandées sont dessinées, réserves TOUJOURS imprimées', async () => {
    const pdf = await renderAccreditationsPdf(view, '17/08/2026', ['statuts']);
    const text = extractPdfText(pdf).replace(/\s+/g, ' ');
    expect(text).toMatch(/Statut des cabinets/i);
    expect(text).not.toMatch(/Chronologie de la liste/i);
    expect(text).not.toMatch(/Journal des sorties/i);
    // Les réserves de méthode ne sont jamais optionnelles.
    expect(text).toMatch(/motif ?non ?indiqu/i);
    expect(text).toMatch(/absence ?d'observation/i);
  });
});
