/**
 * Rendu PDF LISIBLE du classement nominatif par cabinet d'un contraste
 * (le CSV était illisible → un PDF paysage par
 * contraste). Tableau des colonnes essentielles ; le détail lourd (Cohen's d,
 * effectifs par groupe) reste calculable via `cabinetAxisToCsv` au besoin.
 *
 * ANONYME : les noms de cabinets sont publics (open data HAS), mais le document
 * ne porte aucune marque productrice. Pur pdf-lib, polices standard.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import { sanitizeForWinAnsi } from './winansi';
import { frDec, frSigned } from './fiche-001-content';
import type { ContrastReport } from './cabinet-axis-report';
import type { Reliability } from './cabinet-axis';
import { ciLabel, alphaValueLabel, ciPercentLabel } from './significance';

/**
 * En-têtes de colonnes du classement — FONCTION (pas une constante figée) car la
 * colonne IC dépend du seuil α courant (cf. significance.ts).
 */
export function rankingColumns(): readonly string[] {
  return ['Rang', 'Cabinet', 'N', 'Écart', ciLabel(), 'p', 'Δ nat.', 'Fiabilité'];
}

/**
 * Légende détaillée de chaque colonne interprétative, rendue APRÈS le tableau de
 * données brutes (indispensable pour exploiter le
 * classement). Une entrée par colonne hors Rang/Cabinet.
 *
 * FONCTION (pas une constante figée) : les notes « IC » et « p » citent le seuil
 * α / niveau de confiance courant (cf. significance.ts).
 */
export function rankingColumnNotes(): { column: string; note: string }[] {
  return [
    {
      column: 'N',
      note:
        'Nombre d’établissements de ce cabinet entrant dans la comparaison (groupe de référence + groupe ' +
        'cible). Plus N est grand, plus l’écart mesuré est stable ; un petit N rend l’écart fragile — voir Fiabilité.',
    },
    {
      column: 'Écart',
      note:
        'Différence de score moyen (en points sur 100) entre le groupe cible et le groupe de référence, ' +
        'calculée sur les SEULES évaluations de ce cabinet. Positif : le cabinet note plus haut le groupe ' +
        'cible ; négatif : plus bas. C’est l’indicateur central (méthode M1, écart brut).',
    },
    {
      column: ciLabel(),
      note:
        `Intervalle de confiance à ${ciPercentLabel()} de l’écart : fourchette dans laquelle se situe vraisemblablement le ` +
        `« vrai » écart. S’il NE CONTIENT PAS 0, l’écart est statistiquement significatif (au seuil ${alphaValueLabel()}). Un intervalle large ` +
        'traduit beaucoup d’incertitude (souvent un petit effectif).',
    },
    {
      column: 'p',
      note:
        'p-value (test de Welch, qui n’exige pas des variances égales) : probabilité d’observer un tel écart ' +
        `s’il n’existait en réalité AUCUNE différence — c’est-à-dire par le seul hasard. p < ${alphaValueLabel()} → écart peu ` +
        'compatible avec le hasard, dit « significatif » (seuil réglable) ; « <0,001 » = très significatif ; « — » = non ' +
        'calculable (effectif insuffisant).',
    },
    {
      column: 'Δ nat.',
      note:
        'Écart du cabinet moins l’écart national brut. Positif : ce cabinet creuse l’écart DAVANTAGE que la ' +
        'moyenne nationale ; négatif : moins, voire en sens inverse. Situe la pratique du cabinet par rapport à ' +
        'la norme nationale.',
    },
    {
      column: 'Fiabilité',
      note:
        'Palier de confiance selon les effectifs de chaque groupe : Fiable (≥ 30 dans chacun → écart ' +
        'interprétable) ; Tendance (≥ 10 → indicatif) ; Descriptif (sinon → trop peu d’observations pour ' +
        'conclure). Un palier Descriptif se lit comme une simple description, jamais comme un verdict.',
    },
  ];
}

/** Largeurs relatives des colonnes (somme libre, normalisée à la largeur utile). */
const COL_WEIGHTS = [34, 240, 38, 64, 130, 64, 64, 84];

const TIER_LABEL: Record<Reliability, string> = {
  fiable: 'Fiable',
  tendance: 'Tendance',
  descriptif: 'Descriptif',
};

function fmtP(p: number | null): string {
  if (p === null || Number.isNaN(p)) return '—';
  if (p < 0.001) return '<0,001';
  return frDec(p, 3);
}

function fmtGap(g: number | null): string {
  return g === null || Number.isNaN(g) ? '—' : frSigned(g);
}

function fmtCi(low: number | null, high: number | null): string {
  return low === null || high === null ? '—' : `[${frSigned(low)} ; ${frSigned(high)}]`;
}

export interface RankingTable {
  columns: string[];
  rows: string[][];
}

/** Données du tableau de classement (testable indépendamment du rendu PDF). */
export function buildRankingTable(report: ContrastReport): RankingTable {
  const rows = report.results.map((r) => [
    String(r.rank),
    r.cabinet,
    String(r.nTotal),
    fmtGap(r.gap),
    fmtCi(r.ciLow, r.ciHigh),
    fmtP(r.p),
    fmtGap(r.deltaVsNational),
    TIER_LABEL[r.reliability],
  ]);
  return { columns: [...rankingColumns()], rows };
}

const PAGE_W = 841.89; // A4 paysage
const PAGE_H = 595.28;
const MARGIN_X = 40;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 44;
const ROW_H = 15;

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

/** Découpe un texte en lignes tenant dans `maxW` (pour la légende multi-ligne). */
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

/** Rend le classement nominatif d'un contraste en PDF paysage paginé. */
export async function renderRankingPdf(report: ContrastReport, periodLabel: string): Promise<Buffer> {
  const { columns, rows } = buildRankingTable(report);
  const doc = await PDFDocument.create();
  doc.setTitle(`Classement — ${report.label} — ${periodLabel}`);
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

  let page!: PDFPage;
  let y = 0;

  const drawHeader = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
    page.drawText(fit(`Classement par cabinet — ${report.label}`, fontBold, 13, usableW), {
      x: MARGIN_X, y, size: 13, font: fontBold, color: COLOR_TITLE,
    });
    y -= 16;
    // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi → « cible référence »)
    page.drawText(sanitizeForWinAnsi(`Période : ${periodLabel}  ·  ${rows.length} cabinets  ·  écart = score cible - référence (points sur 100)`), {
      x: MARGIN_X, y, size: 8, font, color: COLOR_FOOTER,
    });
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

  // Légende détaillée des colonnes — APRÈS les données brutes.
  const para = (text: string, size: number, f: PDFFont, color = COLOR_BODY, indent = 0) => {
    for (const ln of wrapText(text, f, size, usableW - indent)) {
      if (y - (size + 3) < MARGIN_BOTTOM) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN_TOP;
      }
      page.drawText(ln, { x: MARGIN_X + indent, y, size, font: f, color });
      y -= size + 3;
    }
  };
  if (y - 48 < MARGIN_BOTTOM) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
  }
  y -= 16;
  para('Comment lire ces colonnes', 12, fontBold, COLOR_TITLE);
  y -= 4;
  for (const { column, note } of rankingColumnNotes()) {
    y -= 5;
    para(column, 9.5, fontBold, COLOR_HEAD);
    para(note, 9, font, COLOR_BODY, 12);
  }
  y -= 8;
  para(
    'Lecture descriptive : association sur données publiques, pas de preuve causale ; le score mesure la ' +
      'conformité méthodologique au référentiel, pas la qualité réelle des soins. Comparaisons brutes, non ' +
      'ajustées des autres facteurs (taille, statut, secteur, territoire).',
    8.5,
    font,
    COLOR_FOOTER,
  );

  const footer = 'Données HAS via data.gouv.fr — ODbL · Document généré hors ligne à partir de données publiques';
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(sanitizeForWinAnsi(`${footer}  ·  Page ${i + 1}/${pages.length}`), {
      x: MARGIN_X, y: MARGIN_BOTTOM - 22, size: 7, font, color: COLOR_FOOTER,
    });
  });

  return Buffer.from(await doc.save());
}
