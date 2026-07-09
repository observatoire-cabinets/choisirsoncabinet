/**
 * PDF des cotations : vue générale (tableau paysage paginé) et profil cabinet
 * (synthèse + critères impératifs + structures). pdf-lib, polices WinAnsi
 * (sanitizeForWinAnsi). Cadrage factuel APRÈS les données (charte anti-dénigrement).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import { sanitizeForWinAnsi } from './winansi';
import { frDec } from './fiche-001-content';
import { reliabilityLabel, type CotationCabinetRow, type CotationCabinetProfile } from './cotations';

const PAGE_W = 841.89, PAGE_H = 595.28; // A4 paysage
const MARGIN_X = 40, MARGIN_TOP = 50, MARGIN_BOTTOM = 44, ROW_H = 15;
const COLOR_TITLE = rgb(0.106, 0.165, 0.29), COLOR_HEAD = rgb(0.16, 0.24, 0.4);
const COLOR_BODY = rgb(0.098, 0.137, 0.196), COLOR_FOOTER = rgb(0.5, 0.55, 0.6);

const pctInt = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)}`);
const d2 = (x: number | null): string => (x === null ? '—' : frDec(x, 2));

export interface PdfTable { columns: string[]; rows: string[][]; }

export function buildGeneralPdfTable(rows: CotationCabinetRow[]): PdfTable {
  return {
    columns: ['Cabinet', 'n', 'Fiab.', 'A%', 'B%', 'C%', 'D%', 'Ch.1', 'Ch.2', 'Ch.3', 'CI atteints'],
    rows: rows.map((r) => [
      r.cabinet, String(r.nStructures), reliabilityLabel(r.reliability),
      pctInt(r.gradeShare.A), pctInt(r.gradeShare.B), pctInt(r.gradeShare.C), pctInt(r.gradeShare.D),
      d2(r.chapterMeans[0]), d2(r.chapterMeans[1]), d2(r.chapterMeans[2]),
      r.imperativeSummary.metRate === null ? '—' : `${pctInt(r.imperativeSummary.metRate)} %`,
    ]),
  };
}

function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  let s = sanitizeForWinAnsi(text);
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxW) s = s.slice(0, -1);
  return s + '…';
}

const NOTE =
  'Cotations issues des rapports d’évaluation publiés (données publiques HAS via data.gouv.fr, ODbL). ' +
  'Grade A à D et cotations de chapitre / critère impératif sur l’échelle 1 à 4 ; un critère impératif ne ' +
  's’applique pas à toutes les structures (moyennes sur effectifs variables). Chiffres bruts, descriptifs : ' +
  'un score ou une cotation n’est ni un jugement sur l’établissement ni sur le travail du cabinet.';

/** Rend un tableau paysage paginé avec un bloc de note factuelle final. */
async function renderTablePdf(title: string, subtitle: string, table: PdfTable, weights: number[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const usableW = PAGE_W - 2 * MARGIN_X;
  const wSum = weights.reduce((s, w) => s + w, 0);
  const colW = weights.map((w) => (w / wSum) * usableW);
  const colX: number[] = []; let acc = MARGIN_X;
  for (const w of colW) { colX.push(acc); acc += w; }

  let page!: PDFPage, y = 0;
  const header = () => {
    page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN_TOP;
    page.drawText(fit(title, fontBold, 13, usableW), { x: MARGIN_X, y, size: 13, font: fontBold, color: COLOR_TITLE });
    y -= 16;
    page.drawText(fit(subtitle, font, 8, usableW), { x: MARGIN_X, y, size: 8, font, color: COLOR_FOOTER });
    y -= 18;
    table.columns.forEach((c, i) => page.drawText(fit(c, fontBold, 8.5, colW[i] - 4), { x: colX[i], y, size: 8.5, font: fontBold, color: COLOR_HEAD }));
    y -= ROW_H;
  };
  header();
  for (const r of table.rows) {
    if (y - ROW_H < MARGIN_BOTTOM) header();
    r.forEach((c, i) => page.drawText(fit(c, font, 8.5, colW[i] - 4), { x: colX[i], y, size: 8.5, font, color: COLOR_BODY }));
    y -= ROW_H;
  }
  // Note factuelle (wrap simple).
  if (y - 40 < MARGIN_BOTTOM) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN_TOP; }
  y -= 14;
  const words = sanitizeForWinAnsi(NOTE).split(/\s+/); let line = '';
  const flush = () => { if (line) { page.drawText(line, { x: MARGIN_X, y, size: 8.5, font, color: COLOR_FOOTER }); y -= 11; line = ''; } };
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, 8.5) > usableW) { flush(); line = w; if (y - 11 < MARGIN_BOTTOM) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN_TOP; } }
    else line = trial;
  }
  flush();
  const footer = 'Données HAS via data.gouv.fr — ODbL · Document généré hors ligne à partir de données publiques';
  doc.getPages().forEach((p, i, all) => p.drawText(sanitizeForWinAnsi(`${footer}  ·  Page ${i + 1}/${all.length}`),
    { x: MARGIN_X, y: MARGIN_BOTTOM - 22, size: 7, font, color: COLOR_FOOTER }));
  return Buffer.from(await doc.save());
}

export async function renderCotationsGeneralPdf(rows: CotationCabinetRow[], periodLabel: string): Promise<Buffer> {
  const table = buildGeneralPdfTable(rows);
  const subtitle = `Répartition des grades A/B/C/D (%) et cotations de chapitre (1 à 4)  ·  ${rows.length} cabinets  ·  ${periodLabel}`;
  return renderTablePdf('Cotations des cabinets évaluateurs — vue générale', subtitle, table,
    [200, 34, 70, 40, 40, 40, 40, 46, 46, 46, 70]);
}

export async function renderCotationCabinetPdf(profile: CotationCabinetProfile, periodLabel: string): Promise<Buffer> {
  const summary: PdfTable = {
    columns: ['Indicateur', 'Valeur'],
    rows: [
      ['Structures évaluées', String(profile.nStructures)],
      ['Fiabilité', reliabilityLabel(profile.reliability)],
      ['Grades A / B / C / D', `${pctInt(profile.gradeShare.A)}% / ${pctInt(profile.gradeShare.B)}% / ${pctInt(profile.gradeShare.C)}% / ${pctInt(profile.gradeShare.D)}%`],
      ['Cotations de chapitre (1-3)', `${d2(profile.chapterMeans[0])} / ${d2(profile.chapterMeans[1])} / ${d2(profile.chapterMeans[2])}`],
      ['Critères impératifs — atteints', profile.imperativeSummary.metRate === null ? '—' : `${pctInt(profile.imperativeSummary.metRate)} %`],
      ...profile.imperatives.map((im) => [`Critère impératif ${im.code} (n=${im.nStructures})`, d2(im.mean)]),
      ...profile.establishments.map((e) => [`${e.name} — ${e.commune}`, `${e.grade ?? '—'}  ·  ch. ${d2(e.chapters[0])}/${d2(e.chapters[1])}/${d2(e.chapters[2])}`]),
    ],
  };
  return renderTablePdf(`Profil de cotation — ${profile.cabinet}`,
    `Détail des cotations (données publiques HAS)  ·  ${periodLabel}`, summary, [360, 460]);
}
