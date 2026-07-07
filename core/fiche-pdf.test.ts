import { describe, it, expect, afterEach } from 'vitest';
import { renderFichePdf } from './fiche-pdf';
import { buildFiche001Content } from './fiche-001-content';
import { setSignificanceAlpha } from './significance';
import { extractPdfText } from './__fixtures__/pdf-text';
import type { MonoMultiResult } from './mono-multi-analysis';

describe('renderFichePdf — pied de page seuil de significativité', () => {
  afterEach(() => setSignificanceAlpha(0.05));

  it('imprime le seuil courant en pied de page (défaut alpha = 0,05)', async () => {
    const pdf = await renderFichePdf(buildFiche001Content(), 'Mai 2026');
    const text = extractPdfText(pdf);
    // Post-sanitisation WinAnsi : accents FR préservés (significativité, affichées),
    // mais le glyphe grec α est SUPPRIMÉ (hors WinAnsi) → on épelle "alpha" en toutes
    // lettres dans le footer pour rester lisible (cf. sanitizeForWinAnsi).
    expect(text).toContain('Seuil de significativité alpha = 0,05');
    expect(text).toContain('réglage 0,01/0,05 disponible');
  });

  it('bascule sur alpha = 0,01 au moment du RENDU (pas de capture import-time)', async () => {
    setSignificanceAlpha(0.01);
    const pdf = await renderFichePdf(buildFiche001Content(), 'Mai 2026');
    const text = extractPdfText(pdf);
    expect(text).toContain('Seuil de significativité alpha = 0,01');
    expect(text).not.toContain('alpha = 0,05');
  });

  it('glossaire : le seuil est lisible (« alpha » épelé), pas de « seuil  = » orphelin', async () => {
    // Limitation connue : le glyphe grec α est SUPPRIMÉ (pas translittéré) par
    // sanitizeForWinAnsi → « au seuil α = 0,05 » rendait « au seuil  = 0,05 ».
    const pdf = await renderFichePdf(buildFiche001Content(), 'Mai 2026');
    const text = extractPdfText(pdf);
    expect(text).toContain('au seuil alpha = 0,05 (méthode M3)');
    expect(text).not.toMatch(/seuil {2,}=/);
  });
});

describe('renderFichePdf', () => {
  it('produit un buffer PDF non trivial', async () => {
    const pdf = await renderFichePdf(buildFiche001Content(), 'Mai 2026');
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('inclut le préambule + glossaire → document sensiblement plus volumineux', async () => {
    const pdf = await renderFichePdf(buildFiche001Content(), 'Mai 2026');
    // Plancher calibré AU-DESSUS du rendu sans préambule (~8471 octets mesurés) : préambule
    // « Comment lire » + 3 en-têtes de niveau + glossaire (10 entrées) poussent > 9000.
    // → vrai rouge→vert : échoue sur le renderer sans préambule, passe après intégration.
    expect(pdf.length).toBeGreaterThan(8800);
  });
});

describe('renderFichePdf — section « Données de calcul et vérification »', () => {
  const DYN: MonoMultiResult = {
    n: 20000, nMono: 4000, nMulti: 16000, meanMono: 70, meanMulti: 85,
    sdMono: 12, sdMulti: 9, gapRaw: 15, betaAdj: 12.5, se: 0.5, t: 25, p: 1e-40,
    ciLow: 11.5, ciHigh: 13.5, ciLevel: 0.95, k: 30,
  };

  it('rend un PDF valide AVEC la section (stats présents)', async () => {
    const fiche = buildFiche001Content({ stats: DYN, hasSourceLabel: '01/07/2026', finessSourceLabel: '01/06/2026' });
    expect(fiche.verification).toBeDefined();
    const pdf = await renderFichePdf(fiche, '01/07/2026');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(8800);
  });

  it('rend sans crash SANS la section (dégradé propre)', async () => {
    const fiche = buildFiche001Content();
    expect(fiche.verification).toBeUndefined();
    const pdf = await renderFichePdf(fiche, '01/07/2026');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('la section ajoute du contenu (PDF plus volumineux à blocs identiques)', async () => {
    const withV = buildFiche001Content({ stats: DYN });
    const withoutV = { ...withV, verification: undefined };
    const a = await renderFichePdf(withV, '01/07/2026');
    const b = await renderFichePdf(withoutV, '01/07/2026');
    expect(a.length).toBeGreaterThan(b.length);
  });

  it('glyphes hors WinAnsi lisibles : « beta » épelé et signe moins rendu (arithmétique vérifiable)', async () => {
    // Même classe de limitation que α : β (grec) et − (U+2212) sont SUPPRIMÉS par
    // sanitizeForWinAnsi → « β = +12,50 » rendait «  = +12,50 » et
    // « 85,00 − 70,00 » rendait « 85,00 70,00 » (arithmétique illisible).
    const fiche = buildFiche001Content({ stats: DYN });
    const text = extractPdfText(await renderFichePdf(fiche, '01/07/2026'));
    expect(text).toContain('beta = +12,50');
    expect(text).toContain('Écart brut = 85,00 - 70,00 = +15,00');
    // Guide des méthodes (rendu dans chaque fiche) : M1 et Δ vs national.
    // (fragments courts : le wrapping PDF coupe les lignes, l'extraction concatène sans espace)
    expect(text).toContain('groupe cible - moyenne du');
    expect(text).toContain('écart du cabinet - écart national brut');
    // « Principes » : « Association ≠ causalité » (≠ strippé → sens inversé) reformulé épelé.
    expect(text).toMatch(/Une association n'est ?pas ?une ?causalité/);
  });
});
