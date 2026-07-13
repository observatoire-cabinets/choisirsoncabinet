/**
 * Rendu PDF de la Fiche cabinet — ANONYME (aucune marque, pied de page neutre).
 * Portrait A4, patron drawLines/wrap de fiche-pdf.ts. Formulation neutre
 * (charte anti-dénigrement) ; WinAnsi (sanitizeForWinAnsi), « alpha » épelé
 * (cf. alphaLabelFor de significance.ts), signe moins ASCII.
 * Seuil imprimé passé en paramètre (`seuilLabel`) — jamais lu de l'état global
 * au rendu : le libellé reste celui du calcul des profils, même si une
 * génération concurrente mute le seuil global pendant les await du rendu.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import { sanitizeForWinAnsi } from './winansi';
import { wrap } from './fiche-pdf';
import { frDec, frSigned, frInt } from './fiche-001-content';
import { reliabilityLabel } from './cotations';
import type { FicheCabinetData } from './cabinet-fiche';
import type { FicheCabinetHistory } from './cabinet-fiche-history';

const PAGE_W = 595.28, PAGE_H = 841.89;
const MARGIN_X = 56, MARGIN_TOP = 64, MARGIN_BOTTOM = 56, LINE_GAP = 4;
const COLOR_TITLE = rgb(0.106, 0.165, 0.29);
const COLOR_HEADING = rgb(0.16, 0.24, 0.4);
const COLOR_BODY = rgb(0.098, 0.137, 0.196);
const COLOR_FOOTER = rgb(0.5, 0.55, 0.6);

const frDateIso = (iso: string | null): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const num2 = (x: number | null): string => (x === null ? '—' : frDec(x, 2));
const sig2 = (x: number | null): string => (x === null ? '—' : frSigned(x, 2));
const pctInt = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)} %`);

const SECTEURS_ORDER = ['PA', 'PH adultes', 'PH enfants', 'Autres'] as const;

export async function renderFicheCabinetPdf(
  fiche: FicheCabinetData,
  history: FicheCabinetHistory | null,
  periodLabel: string,
  seuilLabel: string,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Fiche cabinet — ${fiche.cabinet}${fiche.asOfMonth ? ` — fin ${fiche.asOfMonth}` : ''}`);
  // Pas d'auteur volontairement (livrable anonyme).

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);
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
  const heading = (t: string) => {
    ensure(30);
    y -= 8;
    drawLines(t, 13, COLOR_TITLE, fontBold);
    y -= 2;
  };
  const explain = (t: string) => {
    drawLines(t, 8.5, COLOR_FOOTER);
    y -= 4;
  };
  // Padding mesuré sur le texte DÉJÀ sanitisé : la translittération WinAnsi
  // (tiret cadratin -> « - », 3 caractères) doit précéder la mesure, sinon
  // chaque valeur de repli décalerait ses colonnes au moment du dessin
  // (sanitizeForWinAnsi est idempotente : la re-sanitisation par mono est sans effet).
  const padR = (s: string, w: number) => {
    const t = sanitizeForWinAnsi(s);
    return t.length >= w ? t : t + ' '.repeat(w - t.length);
  };
  const padL = (s: string, w: number) => {
    const t = sanitizeForWinAnsi(s);
    return t.length >= w ? t : ' '.repeat(w - t.length) + t;
  };
  // Ligne Courier dessinée SANS re-wrap : préserve le padding d'alignement des colonnes
  // (wrap() réduit les espaces multiples). Les lignes mono sont pré-mesurées < maxW.
  const mono = (t: string) => {
    ensure(9 + LINE_GAP);
    page.drawText(sanitizeForWinAnsi(t), { x: MARGIN_X, y, size: 9, font: fontMono, color: COLOR_BODY });
    y -= 9 + LINE_GAP;
  };

  // ── Bandeau ────────────────────────────────────────────────────────────────
  drawLines(`Fiche cabinet — ${fiche.cabinet}`, 16, COLOR_TITLE, fontBold);
  y -= 4;
  if (fiche.asOfMonth) drawLines(`Situation reconstituée à fin ${fiche.asOfMonth}`, 11, COLOR_HEADING, fontBold);
  drawLines(
    `Évaluations analysées : ${frInt(fiche.n)}  ·  Fiabilité : ${reliabilityLabel(fiche.reliability)}` +
      `  ·  Période couverte : ${frDateIso(fiche.periodStart)} au ${frDateIso(fiche.periodEnd)}`,
    9, COLOR_FOOTER,
  );
  drawLines(periodLabel, 9, COLOR_FOOTER);
  y -= 8;

  // ── 1. Niveau global ──────────────────────────────────────────────────────
  heading('1. Niveau global de notation');
  drawLines(`Écart moyen au national : ${sig2(fiche.niveauGlobal)} point(s) sur 100 (écart brut, non ajusté).`, 10.5);
  explain(
    'Moyenne des scores des structures évaluées par ce cabinet moins la moyenne nationale. ' +
      'Écart brut : il peut refléter la composition du portefeuille (secteur, statut, taille, région) ' +
      'plutôt qu\'une tendance propre au cabinet — il ne se lit pas comme un jugement.',
  );

  // ── 2. Profil sur 7 axes ──────────────────────────────────────────────────
  heading('2. Profil sur les 7 axes de pratique');
  mono(padR('Axe', 28) + padL('écart', 9) + padL('fiabilité', 14) + padL('signalé', 10));
  for (const a of fiche.axes) {
    mono(
      padR(a.label, 28) +
        padL(sig2(a.gap), 9) +
        padL(a.reliability ? reliabilityLabel(a.reliability) : '—', 14) +
        padL(a.significant ? 'oui' : '—', 10),
    );
  }
  y -= 2;
  drawLines(`Axes signalés : ${fiche.nSignificantAxes} sur ${fiche.axes.length}.`, 10.5);
  explain(
    'Écart de notation entre les deux groupes de chaque axe, au sein des évaluations de ce cabinet. ' +
      `Un axe n'est « signalé » que si l'effectif est suffisant (30/30), l'ampleur au moins petite (d >= 0,2), ` +
      `le sens cohérent avec l'écart national ajusté, et le test survivant à la correction de Holm (seuil ${seuilLabel}).`,
  );

  // ── 3. Portefeuille ───────────────────────────────────────────────────────
  heading('3. Portefeuille sectoriel');
  const pf = fiche.portfolio;
  const parts = SECTEURS_ORDER.map((s) => `${s} : ${frInt(pf.secteurCounts[s] ?? 0)}`).join('  ·  ');
  drawLines(parts, 10.5);
  drawLines(
    `Secteur dominant : ${pf.dominantSecteur ?? '—'} (${pctInt(pf.dominantShare)})` +
      `  ·  Profil : ${pf.specialized ? 'spécialisé' : 'généraliste'}  ·  HHI : ${num2(pf.hhi)}.`,
    10.5,
  );
  explain(
    'Répartition des évaluations par secteur. HHI proche de 1 = portefeuille concentré sur un secteur ; ' +
      'proche de 0,25 = réparti. « Spécialisé » si le secteur dominant représente au moins 60 % des évaluations.',
  );

  // ── 4. Cotations (résumé) ─────────────────────────────────────────────────
  heading('4. Cotations publiées (résumé)');
  if (fiche.cotations) {
    const c = fiche.cotations;
    drawLines(
      `Grades : A ${pctInt(c.gradeShare.A)} / B ${pctInt(c.gradeShare.B)} / C ${pctInt(c.gradeShare.C)} / D ${pctInt(c.gradeShare.D)}` +
        `  ·  Cotations de chapitre (échelle 1 à 4) : ${num2(c.chapterMeans[0])} / ${num2(c.chapterMeans[1])} / ${num2(c.chapterMeans[2])}` +
        `  ·  Critères impératifs atteints : ${pctInt(c.imperativeSummary.metRate)}.`,
      10.5,
    );
  } else {
    drawLines('Aucune structure scorée à cette borne.', 10.5);
  }
  explain(
    'Répartition des grades A à D et cotations moyennes telles que publiées dans l\'open data. ' +
      'Détail complet (18 critères impératifs, structures) : onglet Cotations de l\'application.',
  );

  // ── 5. Structures évaluées (résumé) ───────────────────────────────────────
  heading('5. Structures évaluées (résumé)');
  drawLines(`${frInt(fiche.nStructures)} structure(s) évaluée(s) avec score.`, 10.5);
  explain('Liste complète (noms officiels, adresses, dates) : onglet Cabinet choisi de l\'application.');

  // ── 6. Historique mensuel (fiche courante uniquement) ────────────────────
  if (history && history.rows.length > 0) {
    heading('6. Historique mensuel');
    // En-tête de colonnes redessiné à chaque saut de page (l'historique réel
    // peut dépasser une page) — même esprit que le header() de cotations-pdf.ts.
    const enTeteHistorique = () =>
      mono(padR('Mois', 12) + padL('n', 7) + padL('Niveau global', 16) + padL('% grade A', 12));
    enTeteHistorique();
    for (const r of history.rows) {
      if (y - (9 + LINE_GAP) < MARGIN_BOTTOM) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN_TOP;
        enTeteHistorique();
      }
      mono(padR(r.month, 12) + padL(frInt(r.n), 7) + padL(sig2(r.niveauGlobal), 16) + padL(pctInt(r.gradeAShare), 12));
    }
    y -= 2;
    explain(
      'Fiche reconstituée à la fin de chaque mois en ne comptant que les évaluations closes à cette date. ' +
        'Le jeu public ne conservant que la dernière évaluation par structure, les mois passés utilisent la ' +
        'cotation la plus récente pour les rares structures réévaluées — reconstitution approchée, non parfaite.' +
        (history.nUndated > 0
          ? ` ${frInt(history.nUndated)} évaluation(s) sans date de clôture, exclue(s) de l'historique.`
          : ''),
    );
  }

  // ── Rappels transverses ───────────────────────────────────────────────────
  heading('À lire avant toute interprétation');
  drawLines(
    'Le score mesure le niveau de satisfaction des exigences du référentiel par la structure, tel que coté ' +
      'par l\'évaluateur ; l\'open data ne publie pas le contenu des rapports, la justesse de la cotation n\'y est ' +
      'donc pas vérifiable. Un écart n\'est un jugement ni sur les structures ni sur le travail du cabinet ; ' +
      'une association observée n\'établit pas un lien de cause à effet.',
    9.5,
  );

  // ── Pieds de page (chaque page) ───────────────────────────────────────────
  const footer = 'Données HAS via data.gouv.fr — ODbL · Document généré hors ligne à partir de données publiques';
  const seuilFooter = `Seuil de significativité ${seuilLabel} — réglage 0,01/0,05 disponible dans l'application.`;
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(sanitizeForWinAnsi(`${footer}  ·  Page ${i + 1}/${pages.length}`), {
      x: MARGIN_X, y: MARGIN_BOTTOM - 24, size: 7.5, font, color: COLOR_FOOTER,
    });
    p.drawText(sanitizeForWinAnsi(seuilFooter), {
      x: MARGIN_X, y: MARGIN_BOTTOM - 34, size: 7.5, font, color: COLOR_FOOTER,
    });
  });

  return Buffer.from(await doc.save());
}
