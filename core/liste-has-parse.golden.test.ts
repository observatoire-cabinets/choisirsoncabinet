/**
 * GOLDEN : l'extraction + l'analyse reproduisent exactement les comptages
 * de référence des 9 états archivés (2022-2026), vérifiés par deux méthodes
 * indépendantes. Toute dérive de l'analyseur casse ce test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractListeHasText } from './liste-has-pdf';
import { parseListeHasText } from './liste-has-parse';

const HERE = dirname(fileURLToPath(import.meta.url));

const GOLDEN: { date: string; organismes: number; accredites: number; dateSource: RegExp }[] = [
  { date: '2022-10-11', organismes: 42, accredites: 0, dateSource: /11 octobre 2022/ },
  { date: '2022-10-17', organismes: 43, accredites: 0, dateSource: /17 octobre 2022/ },
  { date: '2023-04-07', organismes: 98, accredites: 0, dateSource: /7 avril 2023/ },
  { date: '2023-09-24', organismes: 115, accredites: 4, dateSource: /24 septembre 2023/ },
  { date: '2026-03-06', organismes: 118, accredites: 100, dateSource: /6 mars 2026/ },
  { date: '2026-05-07', organismes: 119, accredites: 104, dateSource: /7 mai 2026/ },
  { date: '2026-07-16', organismes: 117, accredites: 104, dateSource: /16 juillet 2026/ },
  { date: '2026-08-13', organismes: 115, accredites: 103, dateSource: /13 août 2026/ },
  { date: '2026-10-06', organismes: 115, accredites: 103, dateSource: /06 octobre 2026/ },
];

describe('liste HAS — GOLDEN 9 états', () => {
  for (const g of GOLDEN) {
    it(`${g.date} : ${g.organismes} organismes dont ${g.accredites} accrédités`, async () => {
      const pdf = readFileSync(join(HERE, '__fixtures__', 'liste-has', `liste-has-${g.date}.pdf`));
      const etat = parseListeHasText(await extractListeHasText(pdf));
      expect(etat.organismes).toHaveLength(g.organismes);
      expect(etat.organismes.filter((o) => o.num !== '')).toHaveLength(g.accredites);
      expect(etat.date_source ?? '').toMatch(g.dateSource);
      // Unicité des SIREN dans un même état.
      expect(new Set(etat.organismes.map((o) => o.siren)).size).toBe(g.organismes);
    });
  }

  it('faits nominatifs de contrôle (traçabilité des sorties)', async () => {
    const lire = async (d: string) =>
      parseListeHasText(
        await extractListeHasText(
          readFileSync(join(HERE, '__fixtures__', 'liste-has', `liste-has-${d}.pdf`)),
        ),
      );
    const e0716 = await lire('2026-07-16');
    const e0813 = await lire('2026-08-13');
    // CABINET OULAD (878950963, 3-1972) : présent au 16/07, absent au 13/08.
    const oulad = e0716.organismes.find((o) => o.siren === '878950963');
    expect(oulad?.num).toBe('3-1972');
    expect(e0813.organismes.some((o) => o.siren === '878950963')).toBe(false);
    // CIDEES CERTIFICATION accrédité 3-1971 au 13/08.
    const cidees = e0813.organismes.find((o) => o.siren === '849526678');
    expect(cidees?.nom).toBe('CIDEES CERTIFICATION');
    expect(cidees?.num).toBe('3-1971');
    // Édition 2026-07-16 : numéro imprimé « 3-32205 » au 16/07, lu tel qu'imprimé ;
    // l'édition du 06/10 imprime 3-2205. Le nom n'est plus pollué par un « 3- » résiduel.
    const inaes = e0716.organismes.find((o) => o.siren === '951826189');
    expect(inaes).toMatchObject({ nom: 'INAES', num: '3-32205' });
    // Édition 2026-10-06 : premier numéro de la série 3-1XXXX publié par la liste.
    const e1006 = await lire('2026-10-06');
    expect(e1006.organismes.find((o) => o.siren === '101854743')).toMatchObject({
      nom: 'A-AMCOS QUALITE EVALUATION ET CERTIFICATION',
      num: '3-10079',
    });
    // INAES : 3-32205 tel qu'imprimé au 16/07, 3-2205 au 06/10.
    expect(e1006.organismes.find((o) => o.siren === '951826189')?.num).toBe('3-2205');
    // A-AMCOS (518991294, 3-2040) : présent au 13/08, absent au 06/10.
    expect(e0813.organismes.find((o) => o.siren === '518991294')?.num).toBe('3-2040');
    expect(e1006.organismes.some((o) => o.siren === '518991294')).toBe(false);
  });
});
