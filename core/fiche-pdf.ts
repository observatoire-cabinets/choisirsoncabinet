/**
 * Rendu PDF de la fiche mensuelle de l'Observatoire — ANONYME.
 *
 * Aucune marque, aucun auteur, aucun logo. Pied de page neutre. Le contenu
 * provient de `fiche-NNN-content.ts` (invariant d'anonymat testé en amont).
 *
 * Implémentation pure (pdf-lib, polices standard Helvetica) — pas d'I/O fichier.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import { sanitizeForWinAnsi } from './winansi';
import type { FicheContent, FicheBlocs } from './fiche-001-content';
import { frInt, frDec, frSigned } from './fiche-001-content';
import { guideMethodesSections } from './guide-methodes-content';
import { COMMENT_LIRE, glossaire } from './fiche-preamble-content';
import { groupBlocsByLevel } from './fiche-levels';
import { alphaLabel } from './significance';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 56;
const LINE_GAP = 4;

const COLOR_TITLE = rgb(0.106, 0.165, 0.29);
const COLOR_HEADING = rgb(0.16, 0.24, 0.4);
const COLOR_BODY = rgb(0.098, 0.137, 0.196);
const COLOR_FOOTER = rgb(0.5, 0.55, 0.6);

const BLOCS: ReadonlyArray<{ key: keyof FicheBlocs; heading: string }> = [
  { key: 'verdict', heading: 'Verdict en une phrase' },
  { key: 'pourquoi', heading: 'Pourquoi cette fiche' },
  { key: 'enClair', heading: 'En clair' },
  { key: 'question', heading: 'La question posée' },
  { key: 'methode', heading: 'Données et méthode' },
  { key: 'resultats', heading: 'Résultats' },
  { key: 'interpretation', heading: 'Interprétation' },
  { key: 'ceQueNeDitPas', heading: 'Ce que cette fiche ne dit pas' },
  { key: 'limites', heading: 'Limites' },
  { key: 'misePerspective', heading: 'Mise en perspective' },
  { key: 'implications', heading: 'Implications' },
  { key: 'cabinets', heading: 'Pratique par cabinet évaluateur' },
  { key: 'annexe', heading: 'Annexe — Métadonnées' },
];

export function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = trial;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

export async function renderFichePdf(
  fiche: FicheContent,
  periodLabel: string,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Fiche n°${String(fiche.numero).padStart(3, '0')} — ${periodLabel}`);
  // Pas d'auteur volontairement (livrable anonyme).

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier); // table de vérification alignée
  const maxW = PAGE_W - 2 * MARGIN_X;

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  const ensure = (needed: number) => {
    if (y - needed < MARGIN_BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
  };

  const drawLines = (text: string, size: number, color = COLOR_BODY, f = font) => {
    for (const line of wrap(sanitizeForWinAnsi(text), f, size, maxW)) {
      ensure(size + LINE_GAP);
      page.drawText(line, { x: MARGIN_X, y, size, font: f, color });
      y -= size + LINE_GAP;
    }
  };

  // Bandeau titre (sans marque)
  drawLines(
    `Fiche n°${String(fiche.numero).padStart(3, '0')} — ${fiche.titre}`,
    16,
    COLOR_TITLE,
    fontBold,
  );
  y -= 6;
  drawLines(`Famille : ${fiche.famille}`, 9, COLOR_FOOTER);
  drawLines(`Période : ${periodLabel}  ·  Statut : ${fiche.statut}`, 9, COLOR_FOOTER);
  y -= 10;

  // En-tête « Comment lire » — orientation avant les blocs.
  ensure(40);
  drawLines(COMMENT_LIRE.heading, 13, COLOR_TITLE, fontBold);
  y -= 4;
  drawLines(COMMENT_LIRE.body, 9.5, COLOR_BODY);
  y -= 10;

  // Escalier 3 niveaux : un séparateur de niveau, puis ses blocs.
  for (const group of groupBlocsByLevel(fiche.blocs, BLOCS)) {
    ensure(34);
    y -= 8;
    drawLines(group.label, 13, COLOR_TITLE, fontBold); // séparateur de niveau
    y -= 4;
    for (const { heading, body } of group.blocs) {
      ensure(28);
      y -= 6;
      drawLines(heading, 12, COLOR_HEADING, fontBold);
      y -= 2;
      drawLines(body, 10.5, COLOR_BODY);
      y -= 6;
    }
  }

  // Données de calcul et vérification — clôture du Niveau 3.
  if (fiche.verification) {
    const v = fiche.verification;
    const padR = (s: string, w: number) => (s.length >= w ? s : s + ' '.repeat(w - s.length));
    const padL = (s: string, w: number) => (s.length >= w ? s : ' '.repeat(w - s.length) + s);
    const num = (x: number | null, d = 2) => (x === null || Number.isNaN(x) ? '—' : frDec(x, d));
    const fmtP = (p: number) => {
      if (!(p > 0) || p < 1e-16) return 'p < 10^-16';
      if (p >= 1e-3) return `p = ${frDec(p, 3)}`;
      const e = Math.floor(Math.log10(p));
      return `p = ${frDec(p / 10 ** e, 1)} × 10^${e}`;
    };

    ensure(40);
    y -= 12;
    drawLines('Données de calcul et vérification', 13, COLOR_TITLE, fontBold);
    y -= 2;
    drawLines(
      'Ingrédients du calcul — pour contrôler les chiffres et refaire le calcul à la main.',
      9,
      COLOR_FOOTER,
    );
    y -= 2;

    if (v.kind === 'two-group') {
      for (const c of v.contrasts) {
        ensure(50);
        y -= 6;
        drawLines(c.label, 11, COLOR_HEADING, fontBold);
        y -= 2;
        drawLines(
          padR('Groupe', 22) + padL('n', 9) + padL('moy. /100', 12) + padL('écart-type', 13),
          9,
          COLOR_BODY,
          fontMono,
        );
        for (const g of c.groups) {
          drawLines(
            padR(g.label, 22) + padL(frInt(g.n), 9) + padL(num(g.mean, 2), 12) + padL(num(g.sd, 2), 13),
            9,
            COLOR_BODY,
            fontMono,
          );
        }
        y -= 3;
        const [ref, tgt] = c.groups;
        // Écart affiché = différence des moyennes AFFICHÉES (arrondies à 2 déc.) →
        // l'arithmétique imprimée se vérifie exactement à la main, sans dérive d'arrondi.
        const r2 = (x: number) => Math.round(x * 100) / 100;
        const gapShown = ref.mean === null || tgt.mean === null ? null : r2(tgt.mean) - r2(ref.mean);
        drawLines(
          // « - » ASCII (pas − U+2212, strippé par sanitizeForWinAnsi → arithmétique illisible)
          `Écart brut = ${num(tgt.mean, 2)} - ${num(ref.mean, 2)} = ${
            gapShown === null ? '—' : frSigned(gapShown, 2)
          } point(s).`,
          9.5,
          COLOR_BODY,
        );
        if (c.ajuste) {
          const a = c.ajuste;
          const pLabel = a.pMethod === 'normale' ? 'approximation normale, N grand' : 'test de Welch';
          drawLines(
            // « beta » épelé (β grec strippé par sanitizeForWinAnsi → «  = +12,50 » orphelin)
            `Écart ajusté (OLS, contrôles : ${a.controls}) : beta = ${frSigned(a.beta, 2)} ; ` +
              `SE = ${frDec(a.se, 3)} (${a.seType}) ; t = ${frDec(a.t, 1)} ; ddl = ${frInt(a.ddl)} ; ` +
              `IC ${Math.round(a.ciLevel * 100)} % [${frSigned(a.ciLow, 2)} ; ${frSigned(a.ciHigh, 2)}] ; ${fmtP(a.p)} (${pLabel}).`,
            9.5,
            COLOR_BODY,
          );
        }
      }
    } else {
      drawLines(`Règle de calcul : ${v.regle}`, 9.5, COLOR_BODY);
      y -= 2;
      drawLines(v.renvoi, 9.5, COLOR_BODY);
    }

    y -= 4;
    drawLines(
      'Sources : ' + v.sources.map((s) => s.libelle + (s.date ? ` (${s.date})` : '')).join(' ; '),
      9,
      COLOR_FOOTER,
    );
    if (v.note) drawLines(v.note, 9, COLOR_FOOTER);
  }

  // Guide des méthodes statistiques intégré.
  ensure(30);
  y -= 10;
  drawLines('Guide des méthodes statistiques', 13, COLOR_TITLE, fontBold);
  y -= 4;
  for (const s of guideMethodesSections()) {
    ensure(26);
    y -= 4;
    drawLines(s.heading, 11, COLOR_HEADING, fontBold);
    y -= 1;
    drawLines(s.body, 9.5, COLOR_BODY);
    y -= 4;
  }

  // Glossaire — référence en fin de document.
  ensure(30);
  y -= 10;
  drawLines('Glossaire', 13, COLOR_TITLE, fontBold);
  y -= 4;
  for (const { terme, definition } of glossaire()) {
    ensure(24);
    y -= 3;
    drawLines(terme, 10, COLOR_HEADING, fontBold);
    drawLines(definition, 9.5, COLOR_BODY);
  }

  // Pied de page neutre (anonyme) sur chaque page
  const footer = 'Données HAS via data.gouv.fr — ODbL · Document généré hors ligne à partir de données publiques';
  // Seuil de significativité imprimé : lu au moment du RENDU
  // (pas d'import-time capture) pour refléter le réglage 0,01/0,05 en vigueur.
  // `alphaLabel()` est WinAnsi-safe (« alpha » épelé, cf. significance.ts).
  const seuilFooter = `Seuil de significativité ${alphaLabel()} — les valeurs p (exactes, ou bornées si extrêmement petites) sont affichées ; réglage 0,01/0,05 disponible.`;
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawText(sanitizeForWinAnsi(`${footer}  ·  Page ${i + 1}/${total}`), {
      x: MARGIN_X,
      y: MARGIN_BOTTOM - 24,
      size: 7.5,
      font,
      color: COLOR_FOOTER,
    });
    p.drawText(sanitizeForWinAnsi(seuilFooter), {
      x: MARGIN_X,
      y: MARGIN_BOTTOM - 34,
      size: 7.5,
      font,
      color: COLOR_FOOTER,
    });
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
