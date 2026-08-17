/**
 * PDF de l'onglet Accréditations : sections par volet (statuts, chronologie,
 * sorties) — les trois par défaut (synthèse) — et réserves de méthode
 * TOUJOURS imprimées. Implémentation pure (Buffer), patron cotations-pdf.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import { sanitizeForWinAnsi } from './winansi';
import { wrap } from './fiche-pdf';
import { STATUT_LABELS } from './accreditations-csv';
import type { AccreditationsView } from './accreditations';

const PAGE_W = 841.89, PAGE_H = 595.28;
const MARGIN_X = 40, MARGIN_TOP = 50, MARGIN_BOTTOM = 44, ROW_H = 15;
const COLOR_TITLE = rgb(0.106, 0.165, 0.29), COLOR_HEAD = rgb(0.16, 0.24, 0.4);
const COLOR_BODY = rgb(0.098, 0.137, 0.196), COLOR_FOOTER = rgb(0.5, 0.55, 0.6);

const RESERVES = [
  "Une sortie de liste est un fait constaté entre deux relevés : la source n'en indique jamais le motif (motif non indiqué par la source).",
  "Une absence d'observation n'est pas une observation d'absence : entre deux relevés, aucun mouvement n'est datable plus finement que la fenêtre.",
  'Les dates sont celles que les documents revendiquent (« Actualisée le ») ; un rapprochement par nom est une piste à confirmer, jamais une continuité juridique.',
  'Une concordance COFRAC est une concordance documentaire datée entre deux sources publiques — pas un jugement.',
];

function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  let s = sanitizeForWinAnsi(text);
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxW) s = s.slice(0, -1);
  return s + '…';
}

/** Sections imprimables — une par volet de l'onglet. */
export type AccreditationsPdfSection = 'statuts' | 'chronologie' | 'sorties';

export async function renderAccreditationsPdf(
  v: AccreditationsView,
  periodLabel: string,
  sections: AccreditationsPdfSection[] = ['statuts', 'chronologie', 'sorties'],
): Promise<Buffer> {
  const inclus = new Set<AccreditationsPdfSection>(sections);
  const doc = await PDFDocument.create();
  doc.setTitle('Accréditations — liste HAS des organismes autorisés');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const usableW = PAGE_W - 2 * MARGIN_X;

  let page!: PDFPage, y = 0;
  const newPage = (): void => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
  };
  const ensure = (needed: number): void => {
    if (y - needed < MARGIN_BOTTOM) newPage();
  };
  const drawTitle = (t: string): void => {
    ensure(34);
    page.drawText(fit(t, fontBold, 13, usableW), { x: MARGIN_X, y, size: 13, font: fontBold, color: COLOR_TITLE });
    y -= 22;
  };
  const drawTable = (columns: string[], weights: number[], rows: string[][]): void => {
    const wSum = weights.reduce((s, w) => s + w, 0);
    const colW = weights.map((w) => (w / wSum) * usableW);
    const colX: number[] = [];
    let acc = MARGIN_X;
    for (const w of colW) { colX.push(acc); acc += w; }
    const head = (): void => {
      ensure(ROW_H * 2);
      columns.forEach((c, i) =>
        page.drawText(fit(c, fontBold, 8.5, colW[i] - 4), { x: colX[i], y, size: 8.5, font: fontBold, color: COLOR_HEAD }));
      y -= ROW_H;
    };
    head();
    for (const r of rows) {
      if (y - ROW_H < MARGIN_BOTTOM) { newPage(); head(); }
      r.forEach((c, i) =>
        page.drawText(fit(c, font, 8.5, colW[i] - 4), { x: colX[i], y, size: 8.5, font, color: COLOR_BODY }));
      y -= ROW_H;
    }
    y -= 8;
  };

  newPage();
  page.drawText(fit('Accréditations — liste HAS des organismes autorisés', fontBold, 15, usableW),
    { x: MARGIN_X, y, size: 15, font: fontBold, color: COLOR_TITLE });
  y -= 16;
  page.drawText(
    fit(`Situation au ${periodLabel} — dernier relevé de liste : ${v.dernierEtat ?? '—'} · dernier relevé COFRAC : ${v.dernierReleveCofrac ?? '—'}`, font, 8, usableW),
    { x: MARGIN_X, y, size: 8, font, color: COLOR_FOOTER });
  y -= 24;

  if (inclus.has('statuts')) {
    drawTitle('① Statut des cabinets');
    drawTable(
      ['Cabinet', 'Statut', 'SIREN', 'N°', 'Présent au', 'Absent au', 'COFRAC'],
      [26, 30, 9, 7, 9, 9, 10],
      v.statuts.map((s) => [
        s.cabinet, STATUT_LABELS[s.statut], s.siren ?? '—', s.num ?? '—',
        s.dernierEtatPresent ?? '—', s.premierEtatAbsent ?? '—', s.concordanceDate ?? '—',
      ]),
    );
  }

  if (inclus.has('chronologie')) {
    drawTitle('② Chronologie de la liste');
    drawTable(
      ['Date', 'Type', 'Organismes', 'Accrédités', 'Sans numéro', 'Source'],
      [10, 12, 12, 12, 12, 42],
      v.chronologie.map((c) => [
        c.date, c.kind === 'etat' ? 'relevé' : 'bilan annuel',
        c.organismes === null ? '—' : String(c.organismes),
        c.accredites === null ? '—' : String(c.accredites),
        c.sansNumero === null ? '—' : String(c.sansNumero), c.source,
      ]),
    );
    drawTable(
      ['Fenêtre', 'Durée (jours)', 'Effectif', 'Entrées', 'Sorties'],
      [30, 16, 22, 16, 16],
      v.mouvements.map((m) => [
        `${m.de} -> ${m.a}`, String(m.jours), `${m.avant} -> ${m.apres}`,
        String(m.entrees), String(m.sorties),
      ]),
    );
  }

  if (inclus.has('sorties')) {
    drawTitle('③ Journal des sorties');
    drawTable(
      ['SIREN', 'Nom (dernier connu)', 'N°', 'Présent au', 'Absent au', 'Motif', 'Revenu', 'COFRAC'],
      [10, 30, 7, 10, 10, 18, 7, 8],
      v.sorties.map((s) => [
        s.siren, s.nom, s.num ?? '—', s.dernierPresent, s.premierAbsent,
        s.motif, s.revenu ? 'oui' : '', s.concordanceDate ?? '—',
      ]),
    );
  }

  // Les réserves de méthode sont imprimées sur TOUT export, volet seul compris.
  drawTitle('Réserves de méthode');
  for (const r of RESERVES) {
    for (const ligne of wrap(sanitizeForWinAnsi('- ' + r), font, 9, usableW)) {
      ensure(12);
      page.drawText(ligne, { x: MARGIN_X, y, size: 9, font, color: COLOR_BODY });
      y -= 12;
    }
    y -= 2;
  }

  const footer =
    'Sources : HAS (liste des organismes autorisés) · COFRAC (suspensions, résiliations, retraits) — données publiques · Document généré hors ligne';
  doc.getPages().forEach((p, i, all) =>
    p.drawText(sanitizeForWinAnsi(`${footer}  ·  Page ${i + 1}/${all.length}`),
      { x: MARGIN_X, y: MARGIN_BOTTOM - 22, size: 7, font, color: COLOR_FOOTER }));
  return Buffer.from(await doc.save());
}
