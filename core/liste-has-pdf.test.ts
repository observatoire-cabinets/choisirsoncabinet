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
    // 42 organismes = 42 SIREN à 9 chiffres. La mise en page 2022 n'a aucun numéro 3-XXXX.
    expect(text.match(/\b\d{9}\b/g)).toHaveLength(42);
    expect(text.match(/(?<!\d)3-\d{3,4}(?!\d)/g)).toBeNull();
    expect(text).toContain('CIDEES CERTIFICATION');
    expect(text).toMatch(/Actualis[ée]e?\s+le\s+11 octobre 2022/);
  });

  it('extrait le texte de la mise en page 2026 (115 SIREN, 103 numéros)', async () => {
    const text = await extractListeHasText(fixture('liste-has-2026-08-13.pdf'));
    expect(text.match(/\b\d{9}\b/g)).toHaveLength(115);
    expect(text.match(/(?<!\d)3-\d{3,4}(?!\d)/g)).toHaveLength(103);
    expect(text).toMatch(/Actualis[ée]e?\s+le\s+13 août 2026/);
  });

  it("rejette proprement un contenu qui n'est pas un PDF", async () => {
    await expect(extractListeHasText(Buffer.from('pas un pdf'))).rejects.toThrow();
  });
});
