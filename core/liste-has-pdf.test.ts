import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractListeHasText } from './liste-has-pdf';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): Buffer =>
  readFileSync(join(HERE, '__fixtures__', 'liste-has', name));

describe('extractListeHasText', () => {
  it("extrait le texte de la mise en page 2022 (42 SIREN, pas de numéro d'accréditation)", async () => {
    const text = await extractListeHasText(fixture('liste-has-2022-10-11.pdf'));
    // 42 organismes = 42 SIREN à 9 chiffres. La mise en page 2022 n'a aucun numéro d'accréditation (3-XXX à 3-XXXXX).
    expect(text.match(/\b\d{9}\b/g)).toHaveLength(42);
    expect(text.match(/(?<!\d)3-\d{3,5}(?!\d)/g)).toBeNull();
    expect(text).toContain('CIDEES CERTIFICATION');
    expect(text).toMatch(/Actualis[ée]e?\s+le\s+11 octobre 2022/);
  });

  it('extrait le texte de la mise en page 2026 (115 SIREN, 103 numéros)', async () => {
    const text = await extractListeHasText(fixture('liste-has-2026-08-13.pdf'));
    expect(text.match(/\b\d{9}\b/g)).toHaveLength(115);
    expect(text.match(/(?<!\d)3-\d{3,5}(?!\d)/g)).toHaveLength(103);
    expect(text).toMatch(/Actualis[ée]e?\s+le\s+13 août 2026/);
  });

  it('extrait le texte de la mise en page 2026-10 (115 SIREN, 103 numéros dont un à 5 chiffres)', async () => {
    const text = await extractListeHasText(fixture('liste-has-2026-10-06.pdf'));
    expect(text.match(/\b\d{9}\b/g)).toHaveLength(115);
    expect(text.match(/(?<!\d)3-\d{3,5}(?!\d)/g)).toHaveLength(103);
    expect(text).toContain('3-10079');
    expect(text).toContain('3-2205');
    expect(text).toMatch(/Actualis[ée]e?\s+le\s+06 octobre 2026/);
  });

  it("rejette proprement un contenu qui n'est pas un PDF", async () => {
    await expect(extractListeHasText(Buffer.from('pas un pdf'))).rejects.toThrow();
  });
});
