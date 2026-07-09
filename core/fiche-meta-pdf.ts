/**
 * Renderers PDF des méta-fiches (paysage, anonymes) :
 *   - `renderCabinetMatrixPdf`  (fiche 3) : matrice cabinets × axes phares ;
 *   - `renderPortfolioPdf`      (fiche 10) : portefeuille sectoriel par cabinet ;
 *   - `renderMetaRankingPdf`    (fiche 12) : méta-classement par non-conformité à l'égalité de traitement.
 *
 * Même esprit que `fiche-ranking-pdf` (tableau paysage paginé + légende + footer
 * anonyme). Pur pdf-lib.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import { sanitizeForWinAnsi } from './winansi';
import { frSigned, frDec } from './fiche-001-content';
import { PHARE_CONTRASTS, type CabinetProfile } from './cabinet-profile';
import type { Reliability } from './cabinet-axis';
import { alphaValueLabel } from './significance';

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN_X = 40;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 44;
const ROW_H = 15;
const COLOR_TITLE = rgb(0.106, 0.165, 0.29);
const COLOR_HEAD = rgb(0.16, 0.24, 0.4);
const COLOR_BODY = rgb(0.098, 0.137, 0.196);
const COLOR_FOOTER = rgb(0.5, 0.55, 0.6);

/** En-têtes courts par axe phare (pour la matrice fiche 3). */
const AXIS_SHORT: Record<string, string> = {
  mono_multi: 'Mono/multi',
  statut: 'Statut',
  secteur: 'Secteur',
  capacite: 'Capacité',
  groupe_lucratif: 'Groupe',
  temporel: 'Temporel',
  etab_service: 'Étab/svc',
};

function palierMark(r: Reliability | null): string {
  return r === 'fiable' ? 'F' : r === 'tendance' ? 'T' : r === 'descriptif' ? 'D' : '';
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? '—' : frSigned(n);
}

export interface MetaTable {
  columns: string[];
  rows: string[][];
}

/** Matrice fiche 3 : rang, cabinet, N, niveau global, écart phare ± palier par axe. */
export function buildMatrixTable(profiles: CabinetProfile[]): MetaTable {
  const columns = ['Rang', 'Cabinet', 'N', 'Niveau', ...PHARE_CONTRASTS.map((p) => AXIS_SHORT[p.axisId] ?? p.axisId)];
  const rows = profiles.map((p, i) => {
    const byId = new Map(p.axes.map((a) => [a.axisId, a]));
    const axisCells = PHARE_CONTRASTS.map((pc) => {
      const a = byId.get(pc.axisId);
      if (!a || a.gap === null) return '—';
      const mark = palierMark(a.reliability);
      return mark ? `${frSigned(a.gap)} ${mark}` : frSigned(a.gap);
    });
    return [String(i + 1), p.cabinet, String(p.n), fmt(p.niveauGlobal), ...axisCells];
  });
  return { columns, rows };
}

/** Portefeuille fiche 10 : secteur dominant, part, HHI, niveau, profil. */
export function buildPortfolioTable(profiles: CabinetProfile[]): MetaTable {
  const columns = ['Rang', 'Cabinet', 'N', 'Secteur dominant', 'Part dom.', 'HHI', 'Niveau', 'Profil'];
  const sorted = [...profiles].sort((a, b) => b.portfolio.hhi - a.portfolio.hhi);
  const rows = sorted.map((p, i) => [
    String(i + 1),
    p.cabinet,
    String(p.n),
    p.portfolio.dominantSecteur ?? '—',
    `${frDec(p.portfolio.dominantShare * 100, 0)} %`,
    frDec(p.portfolio.hhi, 2),
    fmt(p.niveauGlobal),
    p.portfolio.specialized ? 'Spécialisé' : 'Généraliste',
  ]);
  return { columns, rows };
}

/** Méta-classement fiche 12 : cabinets triés par nb d'axes non conformes (écart significatif). */
export function buildMetaRankingTable(profiles: CabinetProfile[]): MetaTable {
  const columns = ['Rang', 'Cabinet', 'N', 'Niveau', 'Axes non conformes (sig.)'];
  const sorted = [...profiles].sort((a, b) => b.nSignificantAxes - a.nSignificantAxes);
  const rows = sorted.map((p, i) => [
    String(i + 1),
    p.cabinet,
    String(p.n),
    fmt(p.niveauGlobal),
    `${p.nSignificantAxes} / ${PHARE_CONTRASTS.length}`,
  ]);
  return { columns, rows };
}

function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  let s = sanitizeForWinAnsi(text);
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxW) s = s.slice(0, -1);
  return s + '…';
}

function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const word of sanitizeForWinAnsi(text).split(/\s+/).filter(Boolean)) {
    const last = out.length ? out[out.length - 1] : '';
    const trial = last ? `${last} ${word}` : word;
    if (last && font.widthOfTextAtSize(trial, size) > maxW) out.push(word);
    else out[out.length ? out.length - 1 : 0] = trial;
  }
  return out.length ? out : [''];
}

/** Rendu générique d'une méta-table en PDF paysage paginé + légende. */
async function renderMetaPdf(title: string, table: MetaTable, periodLabel: string, legend: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} — ${periodLabel}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const usableW = PAGE_W - 2 * MARGIN_X;
  // Cabinet (index 1) plus large ; les autres colonnes équilibrées.
  const weights = table.columns.map((_, i) => (i === 1 ? 3.4 : 1));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const colW = weights.map((w) => (w / weightSum) * usableW);
  const colX: number[] = [];
  let acc = MARGIN_X;
  for (const w of colW) {
    colX.push(acc);
    acc += w;
  }

  let page!: PDFPage;
  let y = 0;
  const drawHeader = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
    page.drawText(fit(title, fontBold, 13, usableW), { x: MARGIN_X, y, size: 13, font: fontBold, color: COLOR_TITLE });
    y -= 16;
    page.drawText(sanitizeForWinAnsi(`Période : ${periodLabel}  ·  ${table.rows.length} cabinets`), {
      x: MARGIN_X, y, size: 8, font, color: COLOR_FOOTER,
    });
    y -= 18;
    table.columns.forEach((c, i) => {
      page.drawText(fit(c, fontBold, 8, colW[i] - 4), { x: colX[i], y, size: 8, font: fontBold, color: COLOR_HEAD });
    });
    y -= ROW_H;
  };

  drawHeader();
  for (const r of table.rows) {
    if (y - ROW_H < MARGIN_BOTTOM) drawHeader();
    r.forEach((cell, i) => {
      page.drawText(fit(cell, font, 8, colW[i] - 4), { x: colX[i], y, size: 8, font, color: COLOR_BODY });
    });
    y -= ROW_H;
  }

  // Légende
  if (y - 30 < MARGIN_BOTTOM) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
  }
  y -= 14;
  page.drawText('Comment lire', { x: MARGIN_X, y, size: 11, font: fontBold, color: COLOR_TITLE });
  y -= 14;
  for (const ln of wrapText(legend, font, 8.5, usableW)) {
    if (y - 12 < MARGIN_BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
    page.drawText(ln, { x: MARGIN_X, y, size: 8.5, font, color: COLOR_BODY });
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

export function renderCabinetMatrixPdf(profiles: CabinetProfile[], periodLabel: string): Promise<Buffer> {
  return renderMetaPdf(
    'Cartographie de l’effet cabinet — matrice cabinets × axes',
    buildMatrixTable(profiles),
    periodLabel,
    'Niveau = écart brut de notation du cabinet au national (points/100). Chaque colonne d’axe donne l’écart phare du cabinet ' +
      'sur cette dimension, suivi du palier de fiabilité : F = Fiable (≥30/30), T = Tendance (≥10/10), D = Descriptif (sinon, ' +
      // « n’est pas » épelé (pas ≠ U+2260, strippé par sanitizeForWinAnsi → sens inversé dans le PDF)
      'à ne pas sur-interpréter). « — » = non calculable. Écarts BRUTS, non ajustés ; une association n’est pas une causalité ; le score mesure ' +
      'le niveau de satisfaction des exigences du référentiel par la structure, tel que coté par l’évaluateur, pas la qualité réelle des soins ; ' +
      'l’open data ne fournit que le score, pas le contenu du rapport, donc la justesse de la cotation n’y est pas vérifiable. Région et DROM exclus (souvent non calculables par cabinet).',
  );
}

export function renderPortfolioPdf(profiles: CabinetProfile[], periodLabel: string): Promise<Buffer> {
  return renderMetaPdf(
    'Spécialisation sectorielle des cabinets — portefeuilles',
    buildPortfolioTable(profiles),
    periodLabel,
    'Secteur dominant = secteur le plus évalué par le cabinet (PA / PH adultes / PH enfants / Autres). Part dom. = sa part ' +
      'dans les évaluations du cabinet. HHI = indice de concentration (1 = tout dans un secteur). Profil : Spécialisé si la part ' +
      'dominante ≥ 60 %, sinon Généraliste. Niveau = écart brut de notation au national. Lecture descriptive ; la « spécialisation » ' +
      'reflète le volume d’évaluations, pas une expertise déclarée.',
  );
}

export function renderMetaRankingPdf(profiles: CabinetProfile[], periodLabel: string): Promise<Buffer> {
  return renderMetaPdf(
    'Synthèse annuelle — méta-classement des cabinets',
    buildMetaRankingTable(profiles),
    periodLabel,
    'Axes non conformes = nombre de dimensions (sur ' + PHARE_CONTRASTS.length + ') où le cabinet présente un écart à la fois ' +
      `Fiable (≥30/30) ET significatif (p < ${alphaValueLabel()}), c’est-à-dire non conforme à l’égalité de traitement attendue. Mesure l’INTENSITÉ de non-conformité toutes dimensions confondues, pas sa ` +
      // « n’est pas » épelé (pas ≠ U+2260, strippé par sanitizeForWinAnsi → sens inversé dans le PDF)
      'direction. Niveau = écart brut de notation au national. Lecture descriptive ; une association n’est pas une causalité ; un effectif faible ' +
      'ne permet pas de conclure (palier non fiable).',
  );
}
