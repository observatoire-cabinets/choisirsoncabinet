/**
 * GOLDEN : l'extraction + l'analyse reproduisent exactement les comptages
 * de référence des 8 états archivés (2022-2026), vérifiés par deux méthodes
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
  { date: '2026-07-16', organismes: 117, accredites: 103, dateSource: /16 juillet 2026/ },
  { date: '2026-08-13', organismes: 115, accredites: 103, dateSource: /13 août 2026/ },
];

describe('liste HAS — GOLDEN 8 états', () => {
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
  });
});
