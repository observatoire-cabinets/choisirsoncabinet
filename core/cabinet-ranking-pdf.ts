/**
 * Rendu PDF LISIBLE de la liste COMPLÈTE des structures évaluées par un cabinet,
 * triée du score le plus bas au plus élevé (nom officiel + adresse + score + date,
 * données publiques HAS/FINESS). Un tableau paysage paginé.
 *
 * Charte anti-dénigrement : cadrage strictement factuel — « du score le plus bas
 * au plus élevé », jamais de qualificatif. ANONYME : aucune marque productrice.
 * Pur pdf-lib, polices standard (encodage WinAnsi via sanitizeForWinAnsi).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import { sanitizeForWinAnsi } from './winansi';
import { frDec, frSigned } from './fiche-001-content';
import type { CabinetDetail } from '../store/cabinet-detail';

/** Score : entier tel quel, sinon une décimale (virgule FR). */
function fmtScore(n: number): string {
  return frDec(n, 1).replace(/,0$/, '');
}

/** "YYYY-MM-DD"(...) -> "JJ/MM/AAAA" ; null / non-ISO -> tiret. */
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

export interface CabinetRankingTable {
  columns: string[];
  rows: string[][];
}

/** Données du tableau (testable indépendamment du rendu PDF). Rang 1 = score le plus bas. */
export function buildCabinetRankingTable(detail: CabinetDetail): CabinetRankingTable {
  const rows = detail.establishments.map((e, i) => [
    String(i + 1),
    e.name,
    e.address,
    fmtScore(e.score),
    fmtDate(e.evalDate),
  ]);
  return { columns: ['Rang', 'Structure', 'Adresse', 'Score /100', 'Date'], rows };
}

const PAGE_W = 841.89; // A4 paysage
const PAGE_H = 595.28;
const MARGIN_X = 40;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 44;
const ROW_H = 15;

// Rang / Structure / Adresse / Score / Date
const COL_WEIGHTS = [36, 250, 330, 66, 74];

const COLOR_TITLE = rgb(0.106, 0.165, 0.29);
const COLOR_HEAD = rgb(0.16, 0.24, 0.4);
const COLOR_BODY = rgb(0.098, 0.137, 0.196);
const COLOR_FOOTER = rgb(0.5, 0.55, 0.6);

function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  let s = sanitizeForWinAnsi(text);
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxW) s = s.slice(0, -1);
  return s + '…';
}

function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of sanitizeForWinAnsi(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) > maxW && cur) {
        out.push(cur);
        cur = w;
      } else {
        cur = trial;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Rend la liste complète des structures d'un cabinet en PDF paysage paginé. */
export async function renderCabinetRankingPdf(detail: CabinetDetail, periodLabel: string): Promise<Buffer> {
  const { columns, rows } = buildCabinetRankingTable(detail);
  const doc = await PDFDocument.create();
  doc.setTitle(`Structures évaluées — ${detail.cabinet} — ${periodLabel}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const usableW = PAGE_W - 2 * MARGIN_X;
  const weightSum = COL_WEIGHTS.reduce((s, w) => s + w, 0);
  const colW = COL_WEIGHTS.map((w) => (w / weightSum) * usableW);
  const colX: number[] = [];
  let acc = MARGIN_X;
  for (const w of colW) {
    colX.push(acc);
    acc += w;
  }

  const gap = frSigned(detail.gapVsNational);
  const subtitle =
    `Classement du score le plus bas au plus élevé  ·  ${rows.length} structures  ·  ` +
    `moyenne du cabinet ${frDec(detail.meanCabinet)} / 100 vs moyenne nationale ${frDec(detail.meanNational)} ` +
    `(écart ${gap})  ·  ${periodLabel}`;

  let page!: PDFPage;
  let y = 0;

  const drawHeader = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
    page.drawText(fit(`Scores HAS publiés — structures évaluées par ${detail.cabinet}`, fontBold, 13, usableW), {
      x: MARGIN_X, y, size: 13, font: fontBold, color: COLOR_TITLE,
    });
    y -= 16;
    page.drawText(sanitizeForWinAnsi(subtitle), { x: MARGIN_X, y, size: 8, font, color: COLOR_FOOTER });
    y -= 18;
    columns.forEach((c, i) => {
      page.drawText(fit(c, fontBold, 8.5, colW[i] - 4), { x: colX[i], y, size: 8.5, font: fontBold, color: COLOR_HEAD });
    });
    y -= ROW_H;
  };

  drawHeader();
  for (const row of rows) {
    if (y - ROW_H < MARGIN_BOTTOM) drawHeader();
    row.forEach((cell, i) => {
      page.drawText(fit(cell, font, 8.5, colW[i] - 4), { x: colX[i], y, size: 8.5, font, color: COLOR_BODY });
    });
    y -= ROW_H;
  }

  // Cadrage factuel — APRÈS les données.
  const note =
    'Le score HAS (échelle 0 à 100) mesure la conformité méthodologique au référentiel d’évaluation, pas ' +
    'directement la qualité réelle des soins. Une évaluation par structure (la plus récente publiée). Faits ' +
    'bruts issus de données publiques (HAS via data.gouv.fr, ODbL ; FINESS). Un score n’est ni un jugement ' +
    'sur l’établissement ni sur le travail du cabinet ; une association observée n’établit pas de lien de ' +
    'cause à effet.';
  if (y - 40 < MARGIN_BOTTOM) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
  }
  y -= 14;
  for (const ln of wrapText(note, font, 8.5, usableW)) {
    if (y - 11 < MARGIN_BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
    page.drawText(ln, { x: MARGIN_X, y, size: 8.5, font, color: COLOR_FOOTER });
    y -= 11;
  }

  const footer = 'Données HAS via data.gouv.fr — ODbL · Document généré hors ligne à partir de données publiques';
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(sanitizeForWinAnsi(`${footer}  ·  Page ${i + 1}/${pages.length}`), {
      x: MARGIN_X, y: MARGIN_BOTTOM - 22, size: 7, font, color: COLOR_FOOTER,
    });
  });

  return Buffer.from(await doc.save());
}
