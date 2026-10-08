/**
 * Rendu SVG de l'historique du positionnement (Fiche cabinet). Fonctions PURES
 * (chaîne → chaîne) : SVG fait main, aucune bibliothèque. Les segments colorés
 * (au-dessus / en dessous de la moyenne des cabinets), ainsi que le côté et le
 * pointillé de chaque point, sont fournis par les données ; ce module ne fait
 * que les projeter. Les textes (dont le format des valeurs et les bornes de
 * l'axe vertical) et les règles de tracé (couleurs, domaine, axe inversé du
 * rang, plages de la moyenne, points isolés) viennent des modules communs au
 * rendu PDF. Tout libellé issu des données est échappé.
 */
import { escapeHtml } from '../util';
import {
  moisFr,
  pluriel,
  effectifsLabel,
  valeurPositionnement,
  bornesAxeLabels,
  piedDeCarte,
  titreCarte,
  enTetePositionnement,
  historiqueTracable,
  LEGENDE_POSITIONNEMENT,
  MENTION_DALTONIENS,
  MENTION_CARTE_VIDE,
  MENTION_HISTORIQUE_NON_DISPONIBLE,
  SOUS_TITRE_REGIONS,
  NOTE_POSITIONNEMENT,
} from '../../../../core/positioning-text';
import {
  COULEURS,
  COULEUR_BORNES,
  couleurCabinet,
  domaineSerie,
  abscisseRelative,
  hauteurRelative,
  plagesMoyenne,
  estIsole,
} from '../../../../core/positioning-plot';
import type {
  PositioningSeries,
  PositioningPoint,
  CabinetPositioningHistory,
} from '../../../../core/cabinet-positioning-history';

const W = 260, H = 110, P = 8;
/** Taille des libellés des bornes de l'axe vertical (unités du cadre SVG). */
const TAILLE_BORNE = 9;

const titre = (s: PositioningSeries): string => escapeHtml(titreCarte(s));

function bulle(s: PositioningSeries, p: PositioningPoint): string {
  const n = p.nCabinetsEnsemble;
  const contexte = s.kind === 'rang'
    ? ` (${p.axesSignales ?? 0} ${pluriel(p.axesSignales ?? 0, 'axe signalé', 'axes signalés')}, ` +
      `${n} ${pluriel(n, 'cabinet classé', 'cabinets classés')})`
    : ` · moyenne des cabinets ${p.ensemble === null ? '—' : valeurPositionnement(s.kind, p.ensemble)} ` +
      `(${n} ${pluriel(n, 'cabinet', 'cabinets')})`;
  return `${moisFr(p.month)} : cabinet ${p.cabinet === null ? '—' : valeurPositionnement(s.kind, p.cabinet)}${contexte}` +
    ` · ${effectifsLabel(s.kind, p.effectifs)}`;
}

export function renderPositioningSvg(s: PositioningSeries): string {
  const head = `<div class="pos-titre">${titre(s)}</div>`;
  const pied = `<div class="pos-pied">${escapeHtml(piedDeCarte(s))}</div>`;
  if (!s.firstMonth) {
    return `<div class="pos-carte">${head}<div class="pos-vide">${MENTION_CARTE_VIDE}</div>${pied}</div>`;
  }
  const n = s.points.length;
  const dom = domaineSerie(s);
  // Positions relatives communes, reportées dans le cadre SVG (y croît vers le bas).
  const X = (i: number): number => P + abscisseRelative(i, n) * (W - 2 * P);
  const Y = (v: number): number => H - P - hauteurRelative(s, dom, v) * (H - 2 * P);
  const f = (x: number): string => x.toFixed(1);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${titre(s)}">`;
  // Bornes du domaine tracé, sous les tracés : valeur du haut contre le bord
  // supérieur du cadre, valeur du bas contre le bord inférieur.
  const bornes = bornesAxeLabels(s, dom);
  const borne = (cle: 'haut' | 'bas', y: number): string =>
    `<text data-borne="${cle}" x="2" y="${f(y)}" font-size="${TAILLE_BORNE}" fill="${COULEUR_BORNES}">` +
    `${escapeHtml(bornes[cle])}</text>`;
  svg += borne('haut', 2 + TAILLE_BORNE * 0.72) + borne('bas', H - 2);
  if (s.kind === 'ecart') {
    svg += `<line data-zero="1" x1="${P}" x2="${W - P}" y1="${f(Y(0))}" y2="${f(Y(0))}" stroke="#999999" stroke-width="0.6"/>`;
  }
  // Moyenne des cabinets : un sous-tracé par plage d'au moins deux mois, un petit
  // disque pour un mois isolé ; aucun chemin vide.
  const plages = plagesMoyenne(s);
  const d = plages
    .filter((pl) => pl.length > 1)
    .map((pl) => pl.map((q, k) => `${k === 0 ? 'M' : 'L'}${f(X(q.i))},${f(Y(q.v))}`).join(''))
    .join(' ');
  if (d) svg += `<path d="${d}" fill="none" stroke="${COULEURS.ensemble}" stroke-width="1.6"/>`;
  for (const pl of plages) {
    if (pl.length === 1) svg += `<circle cx="${f(X(pl[0].i))}" cy="${f(Y(pl[0].v))}" r="1.6" fill="${COULEURS.ensemble}"/>`;
  }
  for (const g of s.segments) {
    svg += `<line x1="${f(X(g.i0))}" y1="${f(Y(g.v0))}" x2="${f(X(g.i1))}" y2="${f(Y(g.v1))}" ` +
      `stroke="${couleurCabinet(s, g.cote)}" stroke-width="2.2" stroke-linecap="round"` +
      `${g.pointille ? ' stroke-dasharray="4 3"' : ''}/>`;
  }
  // Points isolés : disque, ou cercle creux si l'effectif est faible (équivalent du pointillé).
  s.points.forEach((p, i) => {
    if (p.cabinet === null || !estIsole(s.points, i)) return;
    const c = couleurCabinet(s, p.cote);
    const cx = f(X(i)), cy = f(Y(p.cabinet));
    svg += p.pointille
      ? `<circle cx="${cx}" cy="${cy}" r="2.5" fill="#ffffff" stroke="${c}" stroke-width="1.2"/>`
      : `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${c}"/>`;
  });
  // Bulles d'information natives (survol) : une zone par mois.
  s.points.forEach((p, i) => {
    const x0 = i === 0 ? 0 : (X(i - 1) + X(i)) / 2;
    const x1 = i === n - 1 ? W : (X(i) + X(i + 1)) / 2;
    svg += `<rect x="${f(x0)}" y="0" width="${f(x1 - x0)}" height="${H}" fill="transparent">` +
      `<title>${escapeHtml(bulle(s, p))}</title></rect>`;
  });
  svg += '</svg>';
  return `<div class="pos-carte">${head}${svg}${pied}</div>`;
}

/** Entrée de légende : trait de la couleur de l'entrée, ou pointillé et cercle creux pour l'effectif faible. */
const entreeLegende = ({ cle, texte }: (typeof LEGENDE_POSITIONNEMENT)[number]): string =>
  cle === 'effectif-faible'
    ? `<span><i class="pos-pointille"></i><i class="pos-creux"></i>${texte}</span>`
    : `<span><i style="border-color:${COULEURS[cle]}"></i>${texte}</span>`;

// Les textes communs (en-tête, légende, mentions, intertitre, note) ne contiennent
// aucun caractère réservé du HTML hormis l'apostrophe : ils sont insérés tels quels.
// Historique absent, sans série, ou sans aucune valeur tracée du cabinet : mention
// seule, comme dans le PDF.
export function renderPositioningSection(h: CabinetPositioningHistory | null): string {
  if (!historiqueTracable(h)) return `<p class="note">${MENTION_HISTORIQUE_NON_DISPONIBLE}</p>`;
  const fixes = h.series.filter((s) => s.kind !== 'region');
  const regions = h.series.filter((s) => s.kind === 'region');
  return `
    <p class="note">${enTetePositionnement(h)}</p>
    <div class="pos-legende">${LEGENDE_POSITIONNEMENT.map(entreeLegende).join('')}</div>
    <p class="note">${MENTION_DALTONIENS}</p>
    <div class="pos-grille">${fixes.map(renderPositioningSvg).join('')}</div>
    ${regions.length ? `<h4>${SOUS_TITRE_REGIONS}</h4>
    <div class="pos-grille">${regions.map(renderPositioningSvg).join('')}</div>` : ''}
    <p class="note">${NOTE_POSITIONNEMENT}</p>`;
}
