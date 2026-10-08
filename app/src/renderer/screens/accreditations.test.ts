import { describe, it, expect } from 'vitest';
import { concordanceCellHtml, sortieRowHtml } from './accreditations';
import { buildAccreditationsView } from '../../../../core/accreditations';
import type { ListeHasEtat } from '../../../../core/liste-has-parse';

const etat = (date: string, organismes: ListeHasEtat['organismes']): ListeHasEtat => ({
  date_source: date, date_releve: date, sha256: 'x' + date, organismes,
});

// Sortie portant un numéro, documentée par un relevé COFRAC commenté, avec piste.
const view = buildAccreditationsView({
  cabinets: ['A-AMCOS'],
  etats: [
    etat('2026-08-13', [{ siren: '518991294', nom: 'A-AMCOS', num: '3-2040', dept: '75' }]),
    etat('2026-10-06', [
      { siren: '101854743', nom: 'A-AMCOS QUALITE EVALUATION ET CERTIFICATION', num: '3-10079', dept: '75' },
    ]),
  ],
  bilans: [],
  faits: [],
  pistes: [
    {
      sortiSiren: '518991294', sortiNom: 'A-AMCOS', revenuSiren: '101854743',
      revenuNom: 'A-AMCOS QUALITE EVALUATION ET CERTIFICATION', lecture: 'nom repris avec variation, autre SIREN',
    },
  ],
  alias: [],
  cofrac: [
    {
      date_releve: '2026-10-07', sha256: 'c',
      rows: [{ num: '3-2040', nom: 'A-AMCOS', date: '12/08/2026', commentaire: 'vers 3-10079' }],
    },
  ],
});

describe('écran Accréditations — concordance COFRAC', () => {
  it('cellule : date du relevé puis commentaire cité comme celui du COFRAC, échappé', () => {
    expect(concordanceCellHtml('2026-10-07', { num: '3-1', nom: 'X', date: null, commentaire: 'vers 3-10079' }))
      .toBe('constatée le 07/10/2026 — COFRAC : « vers 3-10079 »');
    expect(concordanceCellHtml('2026-10-07', { num: '3-1', nom: 'X', date: null, commentaire: null }))
      .toBe('constatée le 07/10/2026');
    expect(concordanceCellHtml('2026-10-07', { num: '3-1', nom: 'X', date: null, commentaire: 'a <b>' }))
      .toBe('constatée le 07/10/2026 — COFRAC : « a &lt;b&gt; »');
    expect(concordanceCellHtml(null, null)).toBe('—');
  });

  it('volet ③ : la ligne de sortie porte le commentaire COFRAC et la piste à confirmer', () => {
    const sortie = view.sorties.find((s) => s.siren === '518991294')!;
    const html = sortieRowHtml(sortie);
    expect(html).toContain('constatée le 07/10/2026 — COFRAC : « vers 3-10079 »');
    expect(html).toContain('A-AMCOS QUALITE EVALUATION ET CERTIFICATION (nom repris avec variation, autre SIREN) — à confirmer');
  });

  it('volet ① : le statut du cabinet porte la même concordance commentée', () => {
    const s = view.statuts.find((x) => x.cabinet === 'A-AMCOS')!;
    expect(s.statut).toBe('sorti-concordance-cofrac');
    expect(concordanceCellHtml(s.concordanceDate, s.concordance)).toBe('constatée le 07/10/2026 — COFRAC : « vers 3-10079 »');
  });
});
