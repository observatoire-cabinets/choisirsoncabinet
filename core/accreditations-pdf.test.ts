import { describe, it, expect } from 'vitest';
import { extractPdfText, souple } from './__fixtures__/pdf-text';
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

describe('renderAccreditationsPdf — commentaire COFRAC', () => {
  const court = { num: '3-2040', nom: 'A-AMCOS', date: '12/08/2026', commentaire: 'vers 3-10079' };
  const long = {
    num: '3-9999', nom: 'ORGANISME TEST', date: '12/02/2026',
    commentaire: 'Accréditation suspendue depuis le 01/01/2026 · vers 3-9998',
  };
  const nomLong = 'ORGANISME FICTIF DE TEST AU NOM PARTICULIEREMENT LONG POUR LA MISE EN PAGE';
  const commente: AccreditationsView = {
    ...view,
    statuts: [
      view.statuts[0],
      {
        ...view.statuts[0], cabinet: 'A-AMCOS', statut: 'sorti-concordance-cofrac', num: '3-2040',
        concordance: court, concordanceDate: '2026-10-07',
      },
      {
        ...view.statuts[0], cabinet: 'ORGANISME TEST', statut: 'sorti-concordance-cofrac', num: '3-9999',
        concordance: long, concordanceDate: '2026-10-07',
      },
    ],
    sorties: [
      {
        ...view.sorties[0], siren: '518991294', nom: 'A-AMCOS', num: '3-2040',
        concordance: court, concordanceDate: '2026-10-07',
      },
      {
        ...view.sorties[0], siren: '222222222', nom: 'ORGANISME TEST', num: '3-9999',
        concordance: long, concordanceDate: '2026-10-07',
      },
      { ...view.sorties[0], siren: '333333333', nom: nomLong },
    ],
  };

  it('volet ① : date du relevé qualifiée, puis commentaire cité comme celui du COFRAC, sans troncature', async () => {
    const text = extractPdfText(await renderAccreditationsPdf(commente, '07/10/2026', ['statuts']));
    expect(text).toMatch(souple('constatée le 2026-10-07 — COFRAC : « vers 3-10079 »'));
    expect(text).toMatch(
      souple('constatée le 2026-10-07 — COFRAC : « Accréditation suspendue depuis le 01/01/2026 · vers 3-9998 »'));
    // La date du relevé n'est jamais accolée nue au commentaire.
    expect(text).not.toMatch(souple('2026-10-07 — vers'));
  });

  it('volet ① : libellés de statut imprimés en entier', async () => {
    const text = extractPdfText(await renderAccreditationsPdf(commente, '07/10/2026', ['statuts']));
    expect(text).toMatch(souple('Sorti de liste en portant un numéro (motif non indiqué par la source)'));
    expect(text).toMatch(souple('Sorti de liste — concordance constatée sur le relevé COFRAC'));
  });

  it('volet ③ : date du relevé qualifiée, commentaire cité, nom long imprimé en entier', async () => {
    const text = extractPdfText(await renderAccreditationsPdf(commente, '07/10/2026', ['sorties']));
    expect(text).toMatch(souple('constatée le 2026-10-07 — COFRAC : « vers 3-10079 »'));
    expect(text).toMatch(
      souple('constatée le 2026-10-07 — COFRAC : « Accréditation suspendue depuis le 01/01/2026 · vers 3-9998 »'));
    expect(text).not.toMatch(souple('2026-10-07 — vers'));
    expect(text).toMatch(souple(nomLong));
  });

  it('réserves : le commentaire est reproduit tel que publié par le COFRAC', async () => {
    const text = extractPdfText(await renderAccreditationsPdf(commente, '07/10/2026', ['sorties']));
    expect(text).toMatch(souple('le commentaire éventuel est reproduit tel que publié par le COFRAC'));
  });
});
