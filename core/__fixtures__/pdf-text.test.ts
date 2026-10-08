import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';
import { extractPdfText } from './pdf-text';

/** Objet flux minimal : « stream », données compressées, fin de ligne, « endstream ». */
const objet = (donnees: Buffer, finDeLigne: string): Buffer =>
  Buffer.concat([Buffer.from('1 0 obj\nstream\n', 'latin1'), donnees, Buffer.from(`${finDeLigne}endstream\nendobj\n`, 'latin1')]);
const contenu = (texte: string): Buffer =>
  zlib.deflateSync(Buffer.from(`BT <${Buffer.from(texte, 'latin1').toString('hex')}> Tj ET`, 'latin1'));

describe('extractPdfText', () => {
  it('flux compressé dont le dernier octet vaut 0x0D : texte extrait', () => {
    let k = 0;
    let z = contenu(`texte ${k}`);
    while (z[z.length - 1] !== 0x0d) z = contenu(`texte ${++k}`);
    expect(extractPdfText(objet(z, '\n'))).toBe(`texte ${k}`);
  });

  it('fin de ligne CRLF avant « endstream » : texte extrait', () => {
    expect(extractPdfText(objet(contenu('Fiche cabinet'), '\r\n'))).toBe('Fiche cabinet');
  });
});
