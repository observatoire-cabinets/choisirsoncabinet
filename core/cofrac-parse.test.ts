import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCofracRrsHtml } from './cofrac-parse';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, '__fixtures__', 'cofrac', 'rrs-2026-08.html'), 'utf8');

describe('parseCofracRrsHtml', () => {
  it('extrait exactement les lignes de section 3 de la fixture figée', () => {
    const rows = parseCofracRrsHtml(html);
    // Comptage golden recoupé par 3 voies indépendantes sur la fixture figée :
    // cellules brutes >3-NNN< = 247, liens /Annexes/RRS/3-*.pdf = 247,
    // classes TDA_INSP (227) + TDA_VV (20) = 247.
    expect(rows).toHaveLength(247);
    // Invariants structurels, indépendants du contenu du jour :
    for (const r of rows) {
      expect(r.num).toMatch(/^3-\d{3,5}$/);
      expect(r.nom.length).toBeGreaterThan(0);
    }
    expect(rows.some((r) => r.date !== null)).toBe(true);
  });

  it('témoin nominatif : la ligne réelle 3-0527 relevée dans la fixture figée', () => {
    const rows = parseCofracRrsHtml(html);
    const temoin = rows.find((r) => r.num === '3-0527');
    expect(temoin).toEqual({
      num: '3-0527',
      nom: 'STRUCTURE ET REHABILITATION',
      date: '19/12/2023',
      commentaire: 'Accréditation suspendue depuis le 11/12/2021',
    });
  });

  it('témoin à commentaire composite : jointure « · » du commentaire libre et du transfert', () => {
    const rows = parseCofracRrsHtml(html);
    const temoin = rows.find((r) => r.num === '3-0620');
    expect(temoin).toEqual({
      num: '3-0620',
      nom: 'SPAC',
      date: '12/02/2026',
      commentaire: 'Accréditation suspendue depuis le 01/01/2026 · vers 3-10034',
    });
  });

  it('accepte un numéro d\'accréditation à 5 chiffres', () => {
    const row = `<table><tr>
      <td class=TDA_INSP></td>
      <td>3-10034</td>
      <td>ORGANISME RECENT</td>
      <td>01/01/2026</td>
      <td></td>
      <td><a href="/Annexes/RRS/3-10034.pdf"></a></td>
      <td class=TDE_RESI><div></div></td>
    </tr></table>`;
    const rows = parseCofracRrsHtml(row);
    expect(rows).toEqual([
      { num: '3-10034', nom: 'ORGANISME RECENT', date: '01/01/2026', commentaire: null },
    ]);
  });

  it('une rangée neutralisée par un commentaire HTML n\'est pas une décision', () => {
    const row = `<table><!-- <tr><td>3-0999</td><td>ANCIEN RETRAIT</td><td>01/01/2020</td></tr> --></table>`;
    expect(parseCofracRrsHtml(row)).toEqual([]);
  });

  it('page méconnaissable → tableau vide, jamais de fausses concordances', () => {
    expect(parseCofracRrsHtml('<html><body>maintenance</body></html>')).toEqual([]);
    expect(parseCofracRrsHtml('')).toEqual([]);
  });
});
