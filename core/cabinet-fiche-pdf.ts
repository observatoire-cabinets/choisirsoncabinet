/**
 * Rendu PDF de la Fiche cabinet — ANONYME (aucune marque, pied de page neutre).
 * Portrait A4, patron drawLines/wrap de fiche-pdf.ts. Formulation neutre
 * (charte anti-dénigrement) ; WinAnsi (sanitizeForWinAnsi), « alpha » épelé
 * (cf. alphaLabelFor de significance.ts), signe moins ASCII.
 * Seuil imprimé passé en paramètre (`seuilLabel`) — jamais lu de l'état global
 * au rendu : le libellé reste celui du calcul des profils, même si une
 * génération concurrente mute le seuil global pendant les await du rendu.
 */

import { PDFDocument, StandardFonts, LineCapStyle, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { Buffer } from 'node:buffer';
import { sanitizeForWinAnsi, sanitizeForWinAnsiInsecable } from './winansi';
import { wrap, wrapFragments } from './fiche-pdf';
import { frDec, frSigned, frInt } from './fiche-001-content';
import { reliabilityLabel } from './cotations';
import {
  piedDeCarte,
  titreCarte,
  enTetePositionnement,
  historiqueTracable,
  bornesAxeLabels,
  LEGENDE_POSITIONNEMENT,
  MENTION_DALTONIENS,
  MENTION_CARTE_VIDE,
  MENTION_HISTORIQUE_NON_DISPONIBLE,
  SOUS_TITRE_REGIONS,
  NOTE_POSITIONNEMENT,
} from './positioning-text';
import {
  COULEURS,
  COULEUR_BORNES,
  couleurCabinet,
  domaineSerie,
  abscisseRelative,
  hauteurRelative,
  plagesMoyenne,
  estIsole,
} from './positioning-plot';
import type { FicheCabinetData } from './cabinet-fiche';
import type { FicheCabinetHistory } from './cabinet-fiche-history';
import type { CabinetPositioningHistory, PositioningSeries } from './cabinet-positioning-history';

const PAGE_W = 595.28, PAGE_H = 841.89;
const MARGIN_X = 56, MARGIN_TOP = 64, MARGIN_BOTTOM = 56, LINE_GAP = 4;
const COLOR_TITLE = rgb(0.106, 0.165, 0.29);
const COLOR_HEADING = rgb(0.16, 0.24, 0.4);
const COLOR_BODY = rgb(0.098, 0.137, 0.196);
const COLOR_FOOTER = rgb(0.5, 0.55, 0.6);

// Historique du positionnement : couleurs des tracés communes à l'écran
// (positioning-plot) ; ligne zéro, légende de l'effectif faible et cadre en gris.
const COUL_ZERO = rgb(0.6, 0.6, 0.6);
const COUL_CADRE = rgb(0.85, 0.87, 0.89);
const BLANC = rgb(1, 1, 1);
const TIRETS = [3, 2];
const RAYON_POINT = 2;
/** Taille des libellés des bornes de l'axe vertical. */
const TAILLE_BORNE = 6.5;

/** Couleur '#RRGGBB' en couleur pdf-lib. */
const rgbHex = (hex: string): RGB =>
  rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
const COUL_ENSEMBLE = rgbHex(COULEURS.ensemble);
const COUL_BORNES = rgbHex(COULEUR_BORNES);

/**
 * Graphique d'une série dans le cadre (x0, bas, largeur, hauteur) : bornes de
 * l'axe vertical en haut et en bas à gauche, moyenne des cabinets en noir,
 * segments et points isolés du cabinet tels que fournis par les données (côté,
 * pointillé) ; rang sur un axe inversé (1er en haut), sans moyenne.
 * Série sans valeur tracée : mention d'effectif insuffisant au centre du cadre.
 */
function tracerSerie(
  page: PDFPage,
  s: PositioningSeries,
  cadre: { x0: number; bas: number; largeur: number; hauteur: number },
  font: PDFFont,
): void {
  const { x0, bas, largeur, hauteur } = cadre;
  page.drawRectangle({ x: x0, y: bas, width: largeur, height: hauteur, borderColor: COUL_CADRE, borderWidth: 0.5 });
  if (!s.firstMonth) {
    const t = sanitizeForWinAnsi(MENTION_CARTE_VIDE);
    const size = 8;
    page.drawText(t, {
      x: x0 + (largeur - font.widthOfTextAtSize(t, size)) / 2,
      y: bas + hauteur / 2 - size / 3,
      size, font, color: COLOR_FOOTER,
    });
    return;
  }
  const n = s.points.length;
  const P = 5;
  const dom = domaineSerie(s);
  // Positions relatives communes, reportées dans le cadre (y croît vers le haut).
  const X = (i: number): number => x0 + P + abscisseRelative(i, n) * (largeur - 2 * P);
  const Y = (v: number): number => bas + P + hauteurRelative(s, dom, v) * (hauteur - 2 * P);
  // Bornes du domaine tracé, sous les tracés : valeur du haut contre le bord
  // supérieur du cadre, valeur du bas contre le bord inférieur.
  const bornes = bornesAxeLabels(s, dom);
  page.drawText(sanitizeForWinAnsi(bornes.haut), {
    x: x0 + 2, y: bas + hauteur - 2 - TAILLE_BORNE * 0.72, size: TAILLE_BORNE, font, color: COUL_BORNES,
  });
  page.drawText(sanitizeForWinAnsi(bornes.bas), { x: x0 + 2, y: bas + 2, size: TAILLE_BORNE, font, color: COUL_BORNES });
  if (s.kind === 'ecart') {
    page.drawLine({ start: { x: x0 + P, y: Y(0) }, end: { x: x0 + largeur - P, y: Y(0) }, thickness: 0.4, color: COUL_ZERO });
  }
  // Moyenne des cabinets : un trait entre deux mois consécutifs d'une même plage,
  // un petit disque pour un mois isolé ; rien sans aucune moyenne.
  for (const pl of plagesMoyenne(s)) {
    if (pl.length === 1) {
      page.drawCircle({ x: X(pl[0].i), y: Y(pl[0].v), size: 1.2, color: COUL_ENSEMBLE });
      continue;
    }
    for (let k = 0; k + 1 < pl.length; k++) {
      page.drawLine({
        start: { x: X(pl[k].i), y: Y(pl[k].v) }, end: { x: X(pl[k + 1].i), y: Y(pl[k + 1].v) },
        thickness: 1.2, color: COUL_ENSEMBLE, lineCap: LineCapStyle.Round,
      });
    }
  }
  for (const g of s.segments) {
    page.drawLine({
      start: { x: X(g.i0), y: Y(g.v0) },
      end: { x: X(g.i1), y: Y(g.v1) },
      thickness: 1.6,
      color: rgbHex(couleurCabinet(s, g.cote)),
      ...(g.pointille ? { dashArray: TIRETS } : { lineCap: LineCapStyle.Round }),
    });
  }
  // Points isolés : disque, ou cercle creux si l'effectif est faible (équivalent du pointillé).
  s.points.forEach((p, i) => {
    if (p.cabinet === null || !estIsole(s.points, i)) return;
    const c = rgbHex(couleurCabinet(s, p.cote));
    page.drawCircle(
      p.pointille
        ? { x: X(i), y: Y(p.cabinet), size: RAYON_POINT, color: BLANC, borderColor: c, borderWidth: 0.8 }
        : { x: X(i), y: Y(p.cabinet), size: RAYON_POINT, color: c },
    );
  });
}

const frDateIso = (iso: string | null): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const num2 = (x: number | null): string => (x === null ? '—' : frDec(x, 2));
const sig2 = (x: number | null): string => (x === null ? '—' : frSigned(x, 2));
const pctInt = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)} %`);

const SECTEURS_ORDER = ['PA', 'PH adultes', 'PH enfants', 'Autres'] as const;

/** Section 6 d'une fiche d'un mois passé : la section garde son numéro, sans tableau. */
export const MENTION_HISTORIQUE_MENSUEL_FICHE_PASSEE =
  "Non repris sur la fiche d'un mois passé ; voir la fiche courante.";
/** Section 6 d'un cabinet sans évaluation datée (même texte qu'à l'écran). */
export const MENTION_HISTORIQUE_MENSUEL_SANS_DATE = 'Aucune évaluation datée : historique indisponible.';

/**
 * `history` : historique mensuel (section 6) de la fiche courante ; null pour
 * une fiche d'un mois passé.
 * `positioning` : historique du positionnement du cabinet (section 7) ; null
 * quand il n'a pas pu être obtenu — la section porte alors une mention
 * d'indisponibilité, elle n'est jamais omise.
 */
export async function renderFicheCabinetPdf(
  fiche: FicheCabinetData,
  history: FicheCabinetHistory | null,
  periodLabel: string,
  seuilLabel: string,
  positioning: CabinetPositioningHistory | null = null,
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
    // Espaces insécables conservées : un entier « 1 998 » n'est jamais coupé.
    for (const line of wrap(sanitizeForWinAnsiInsecable(text), f, size, maxW)) {
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

  /**
   * Section 7 — historique du positionnement. Mêmes données, mêmes textes et
   * mêmes règles de tracé que l'écran (modules communs positioning-text et
   * positioning-plot). Historique indisponible, ou sans aucune valeur tracée du
   * cabinet : titre et mention seuls.
   */
  const dessinerHistoriquePositionnement = (h: CabinetPositioningHistory | null): void => {
    const titre = '7. Historique du positionnement';
    if (!historiqueTracable(h)) {
      // Titre et mention sur la même page.
      ensure(27 + 10.5 + LINE_GAP);
      heading(titre);
      drawLines(MENTION_HISTORIQUE_NON_DISPONIBLE, 10.5);
      y -= 4;
      return;
    }
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
    heading(titre);
    drawLines(enTetePositionnement(h), 9.5);
    y -= 2;

    // Légende, en lignes successives si elle dépasse la largeur utile.
    const LEG = 8, LEG_LH = 12, ECHANTILLON = 16;
    const legende = LEGENDE_POSITIONNEMENT.map(({ cle, texte }) =>
      cle === 'effectif-faible'
        ? { texte, couleur: COUL_ZERO, pointille: true }
        : { texte, couleur: rgbHex(COULEURS[cle]), pointille: false },
    );
    let lx = MARGIN_X;
    ensure(LEG_LH);
    for (const e of legende) {
      const t = sanitizeForWinAnsi(e.texte);
      const dessin = ECHANTILLON + (e.pointille ? 4 + 2 * RAYON_POINT : 0);
      const largeur = dessin + 5 + font.widthOfTextAtSize(t, LEG);
      if (lx > MARGIN_X && lx + largeur > MARGIN_X + maxW) {
        y -= LEG_LH;
        ensure(LEG_LH);
        lx = MARGIN_X;
      }
      page.drawLine({
        start: { x: lx, y: y + 3 }, end: { x: lx + ECHANTILLON, y: y + 3 }, thickness: 1.6, color: e.couleur,
        ...(e.pointille ? { dashArray: TIRETS } : {}),
      });
      if (e.pointille) {
        page.drawCircle({
          x: lx + ECHANTILLON + 4 + RAYON_POINT, y: y + 3, size: RAYON_POINT,
          color: BLANC, borderColor: e.couleur, borderWidth: 0.8,
        });
      }
      page.drawText(t, { x: lx + dessin + 5, y, size: LEG, font, color: COLOR_BODY });
      lx += largeur + 14;
    }
    y -= LEG_LH + 2;
    explain(MENTION_DALTONIENS);

    // Grille de graphiques à 2 colonnes. Une ligne de grille ne change jamais de
    // page : sa hauteur (titre et pied les plus longs, repliés) est réservée avant dessin.
    const GOUTTIERE = 16;
    const colW = (maxW - GOUTTIERE) / 2;
    const chartH = 78;
    const TITRE = 8.5, TITRE_LH = 10.5, PIED = 7.5, PIED_LH = 9;
    const ligneDeGrille = (series: PositioningSeries[]) => {
      const cartes = series.map((s) => ({
        s,
        titre: wrap(sanitizeForWinAnsiInsecable(titreCarte(s)), fontBold, TITRE, colW),
        pied: wrapFragments(sanitizeForWinAnsiInsecable(piedDeCarte(s)), font, PIED, colW),
      }));
      const nTitre = Math.max(1, ...cartes.map((c) => c.titre.length));
      const nPied = Math.max(1, ...cartes.map((c) => c.pied.length));
      const hauteur = (nTitre - 1) * TITRE_LH + 5 + chartH + 9 + (nPied - 1) * PIED_LH + 16;
      return { cartes, nTitre, hauteur };
    };
    const grille = (series: PositioningSeries[]) => {
      for (let k = 0; k < series.length; k += 2) {
        const { cartes, nTitre, hauteur } = ligneDeGrille(series.slice(k, k + 2));
        ensure(hauteur);
        const haut = y - (nTitre - 1) * TITRE_LH - 5;
        const bas = haut - chartH;
        cartes.forEach((c, j) => {
          const x0 = MARGIN_X + j * (colW + GOUTTIERE);
          c.titre.forEach((t, l) => {
            page.drawText(t, { x: x0, y: y - l * TITRE_LH, size: TITRE, font: fontBold, color: COLOR_HEADING });
          });
          tracerSerie(page, c.s, { x0, bas, largeur: colW, hauteur: chartH }, font);
          c.pied.forEach((t, l) => {
            page.drawText(t, { x: x0, y: bas - 9 - l * PIED_LH, size: PIED, font, color: COLOR_FOOTER });
          });
        });
        y -= hauteur;
      }
    };
    const regions = h.series.filter((s) => s.kind === 'region');
    grille(h.series.filter((s) => s.kind !== 'region'));
    if (regions.length > 0) {
      // Sous-titre jamais isolé en bas de page : il part avec la première ligne de
      // graphiques, dont la hauteur réelle (titres et pieds repliés) est réservée.
      const SOUS_TITRE = 10;
      const hauteurSousTitre =
        wrap(sanitizeForWinAnsi(SOUS_TITRE_REGIONS), fontBold, SOUS_TITRE, maxW).length * (SOUS_TITRE + LINE_GAP) + 6;
      ensure(hauteurSousTitre + ligneDeGrille(regions.slice(0, 2)).hauteur);
      drawLines(SOUS_TITRE_REGIONS, SOUS_TITRE, COLOR_HEADING, fontBold);
      y -= 6;
      grille(regions);
    }
    explain(NOTE_POSITIONNEMENT);
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

  // ── 6. Historique mensuel (tableau : fiche courante uniquement) ──────────
  // Sans tableau, la section garde son titre (numérotation continue jusqu'à la
  // section 7) : fiche d'un mois passé, ou cabinet sans évaluation datée ;
  // titre et mention sur la même page.
  const mentionSection6 = (texte: string): void => {
    ensure(27 + 10.5 + LINE_GAP);
    heading('6. Historique mensuel');
    drawLines(texte, 10.5);
    y -= 4;
  };
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
  } else if (fiche.asOfMonth) {
    mentionSection6(MENTION_HISTORIQUE_MENSUEL_FICHE_PASSEE);
  } else if (history) {
    mentionSection6(MENTION_HISTORIQUE_MENSUEL_SANS_DATE);
  }

  // ── 7. Historique du positionnement ───────────────────────────────────────
  dessinerHistoriquePositionnement(positioning);

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
