import { describe, it, expect } from 'vitest';
import { renderPositioningSvg, renderPositioningSection } from './positioning-chart';
import {
  enTetePositionnement,
  LEGENDE_POSITIONNEMENT,
  MENTION_DALTONIENS,
  MENTION_CARTE_VIDE,
  MENTION_HISTORIQUE_NON_DISPONIBLE,
  SOUS_TITRE_REGIONS,
  NOTE_POSITIONNEMENT,
} from '../../../../core/positioning-text';
import { COULEURS, COULEUR_BORNES } from '../../../../core/positioning-plot';
import { decouperSegments, cotesDesPoints } from '../../../../core/positioning-segments';
import type {
  PositioningPoint,
  PositioningSeries,
  CabinetPositioningHistory,
} from '../../../../core/cabinet-positioning-history';

const pt = (month: string, cabinet: number | null, ensemble: number | null, o: Partial<PositioningPoint> = {}): PositioningPoint => ({
  month, cabinet, ensemble, nCabinetsEnsemble: 30, effectifs: [12], reliability: null,
  pointille: false, cote: cabinet === null ? null : ensemble !== null && cabinet < ensemble ? 'dessous' : 'dessus', ...o,
});
// Segments fournis tels quels : le rendu ne fait que les projeter.
const serie = (o: Partial<PositioningSeries> = {}): PositioningSeries => ({
  ficheNumero: 3, seriesId: 'niveau', label: 'Note moyenne', kind: 'niveau',
  points: [pt('2023-01', 82, 80), pt('2023-02', 78, 80)],
  segments: [
    { i0: 0, v0: 82, i1: 0.5, v1: 80, cote: 'dessus', pointille: false },
    { i0: 0.5, v0: 80, i1: 1, v1: 78, cote: 'dessous', pointille: true },
  ],
  firstMonth: '2023-01', lastMonth: '2023-02', ...o,
});
/** Série cohérente : segments, côtés et bornes dérivés des points comme dans le cœur. */
const coherente = (points: PositioningPoint[], o: Partial<PositioningSeries> = {}): PositioningSeries => {
  const cabinet = points.map((p) => p.cabinet);
  const ensemble = points.map((p) => p.ensemble);
  const cotes = cotesDesPoints(cabinet, ensemble);
  const avec = points.filter((p) => p.cabinet !== null);
  return serie({
    points: points.map((p, i) => ({ ...p, cote: cotes[i] })),
    segments: decouperSegments(cabinet, ensemble, points.map((p) => p.pointille)),
    firstMonth: avec[0]?.month ?? null,
    lastMonth: avec[avec.length - 1]?.month ?? null,
    ...o,
  });
};

/** Attributs de chaque élément <tag …> du SVG, dans l'ordre d'émission. */
function elements(svg: string, tag: string): Record<string, string>[] {
  return [...svg.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))].map((m) =>
    Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  );
}
/** Libellés des bornes de l'axe vertical : attributs et texte, dans l'ordre d'émission. */
const bornesSvg = (svg: string): Record<string, string>[] =>
  [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => ({
    ...Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
    texte: m[2],
  }));
/** Traits du cabinet (hors ligne zéro), de gauche à droite. */
const traits = (svg: string): Record<string, string>[] =>
  elements(svg, 'line')
    .filter((l) => l['data-zero'] === undefined)
    .sort((a, b) => Number(a.x1) - Number(b.x1));

describe('renderPositioningSvg', () => {
  it('chaque segment porte la couleur de son côté et le pointillé de son effectif ; moyenne en noir', () => {
    const svg = renderPositioningSvg(serie());
    const [dessus, dessous] = traits(svg);
    expect(dessus.stroke).toBe(COULEURS.dessus);
    expect(dessus['stroke-dasharray']).toBeUndefined();
    expect(dessous.stroke).toBe(COULEURS.dessous);
    expect(dessous['stroke-dasharray']).toBe('4 3');
    // Les deux moitiés se rejoignent au croisement.
    expect(dessus.x2).toBe(dessous.x1);
    expect(dessus.y2).toBe(dessous.y1);
    const [moyenne] = elements(svg, 'path');
    expect(moyenne.stroke).toBe(COULEURS.ensemble);
    expect(moyenne.d).toMatch(/^M[\d.]+,[\d.]+L[\d.]+,[\d.]+$/);
  });

  it('aucun point : mention d’effectif insuffisant une seule fois, pied réduit aux effectifs, pas de SVG', () => {
    const html = renderPositioningSvg(serie({ points: [pt('2023-01', null, 80, { effectifs: [2] })], segments: [], firstMonth: null, lastMonth: null }));
    expect(html.split('Effectif insuffisant').length - 1).toBe(1);
    expect(html).toContain('<div class="pos-pied">n = 2</div>');
    expect(html).not.toContain('<svg');
  });

  it('échappement des libellés venus des données', () => {
    const html = renderPositioningSvg(serie({ kind: 'region', ficheNumero: 4, seriesId: 'region:<b>&"', label: '<b>&"' }));
    expect(html).not.toContain('<b>&"');
    expect(html).toContain('&lt;b&gt;&amp;&quot;');
  });

  it('écart : ligne zéro horizontale à la hauteur de la valeur 0, effectifs dans l’ordre du titre', () => {
    // Cabinet 1 → −1, moyenne −1 → 1 : croisement à mi-parcours, à la valeur 0.
    const s = coherente(
      [pt('2023-01', 1, -1, { effectifs: [48, 8] }), pt('2023-02', -1, 1, { effectifs: [48, 8] })],
      { kind: 'ecart', seriesId: 'mono_multi', ficheNumero: 1, label: 'Multi vs mono (écart)' },
    );
    expect(s.segments).toHaveLength(2);
    const svg = renderPositioningSvg(s);
    const zero = elements(svg, 'line').find((l) => l['data-zero'] === '1')!;
    const hauteur = Number(/viewBox="0 0 \d+ (\d+)"/.exec(svg)![1]);
    // Valeurs symétriques autour de 0 : la valeur 0 est au milieu du cadre.
    expect(zero.y1).toBe(zero.y2);
    expect(Number(zero.y1)).toBeCloseTo(hauteur / 2, 1);
    const [avant, apres] = traits(svg);
    expect(avant.y2).toBe(zero.y1);
    expect(apres.y1).toBe(zero.y1);
    expect(svg).toContain(
      '<div class="pos-pied">de janv. 2023 à févr. 2023 · févr. 2023 : cabinet -1,0 · moyenne +1,0 · n = 8 / 48</div>',
    );
    // Bornes et bulles : écarts signés à une décimale, signe moins ASCII.
    expect(bornesSvg(svg).map((b) => b.texte)).toEqual(['+1,2', '-1,2']);
    expect(svg).toContain('janv. 2023 : cabinet +1,0 · moyenne des cabinets -1,0 (30 cabinets) · n = 8 / 48');
  });

  it('bornes de l’axe : valeur haute du domaine en haut, valeur basse en bas, à gauche, en gris', () => {
    const svg = renderPositioningSvg(serie());
    const hauteur = Number(/viewBox="0 0 \d+ (\d+)"/.exec(svg)![1]);
    const [haut, bas] = bornesSvg(svg);
    // Valeurs 78 à 82 (cabinet et moyenne), domaine élargi de 12 % de chaque côté : 77,52 à 82,48.
    expect([haut['data-borne'], haut.texte, bas['data-borne'], bas.texte]).toEqual(['haut', '82,5', 'bas', '77,5']);
    for (const b of [haut, bas]) {
      expect(b.x).toBe('2');
      expect(b.fill).toBe(COULEUR_BORNES);
      expect(b['font-size']).toBe('9');
    }
    // y croît vers le bas : la borne haute contre le bord supérieur, la borne basse contre le bord inférieur.
    expect(Number(haut.y)).toBeLessThan(12);
    expect(Number(bas.y)).toBeGreaterThan(hauteur - 4);
    expect(Number(bas.y)).toBeLessThanOrEqual(hauteur);
  });

  it('pied : période, valeurs du dernier mois tracé, effectifs ; carte vide : aucune borne', () => {
    expect(renderPositioningSvg(serie())).toContain(
      '<div class="pos-pied">de janv. 2023 à févr. 2023 · févr. 2023 : cabinet 78,0 · moyenne 80,0 · n = 12</div>',
    );
    const vide = renderPositioningSvg(serie({ points: [pt('2023-01', null, 80)], segments: [], firstMonth: null, lastMonth: null }));
    expect(vide).not.toContain('<text');
  });

  it('rang : axe inversé (1er en haut), tracé gris neutre, ni bleu ni orange, sans moyenne', () => {
    const r = serie({ kind: 'rang', ficheNumero: 12, seriesId: 'rang', label: 'Rang au méta-classement',
      points: [pt('2023-01', 3, null), pt('2023-02', 1, null)],
      segments: [{ i0: 0, v0: 3, i1: 1, v1: 1, cote: 'dessus', pointille: false }] });
    const svg = renderPositioningSvg(r);
    const [trait] = traits(svg);
    // y croît vers le bas : le 1er rang (arrivée) est plus haut que le 3e (départ).
    expect(Number(trait.y2)).toBeLessThan(Number(trait.y1));
    // Bornes : domaine 0,76 → 3,24 arrondi aux rangs entiers (1 → 4) ; « 1er » en haut, « 4e » en bas,
    // exactement les bords du cadre : le 1er rang est tracé tout en haut de la zone de tracé.
    const [haut, bas] = bornesSvg(svg);
    expect([haut.texte, bas.texte]).toEqual(['1er', '4e']);
    expect(Number(haut.y)).toBeLessThan(Number(bas.y));
    expect(Number(trait.y2)).toBeCloseTo(8, 1);
    // Pied : N une seule fois (« 1er sur 30 »), puis l'absence de courbe de moyenne.
    expect(svg).toContain('<div class="pos-pied">de janv. 2023 à févr. 2023 · févr. 2023 : 1er sur 30 · n = 12 · sans courbe de moyenne</div>');
    expect(trait.stroke).toBe(COULEURS.rang);
    expect(svg).toContain(COULEURS.rang);
    expect(svg).not.toContain(COULEURS.dessus);
    expect(svg).not.toContain(COULEURS.dessous);
    expect(svg).not.toContain(COULEURS.ensemble);
  });

  it('rang : point isolé gris, creux si effectif faible', () => {
    const r = coherente([pt('2023-01', null, null), pt('2023-02', 2, null, { effectifs: [3], pointille: true })],
      { kind: 'rang', ficheNumero: 12, seriesId: 'rang', label: 'Rang au méta-classement' });
    const svg = renderPositioningSvg(r);
    const [point] = elements(svg, 'circle');
    expect(point.stroke).toBe(COULEURS.rang);
    expect(point.fill).toBe('#ffffff');
    expect(svg).not.toContain(COULEURS.dessus);
    expect(svg).not.toContain(COULEURS.dessous);
  });

  it('point isolé : disque plein de la couleur du côté fourni par les données', () => {
    // Égalité au troisième mois : le côté retenu par le cœur est celui du mois précédent (dessous).
    const s = coherente([pt('2023-01', 70, 80), pt('2023-02', null, 80), pt('2023-03', 80, 80)]);
    expect(s.points[2].cote).toBe('dessous');
    const cercles = elements(renderPositioningSvg(s), 'circle');
    expect(cercles).toHaveLength(2);
    for (const c of cercles) {
      expect(c.fill).toBe(COULEURS.dessous);
      expect(c.stroke).toBeUndefined();
    }
  });

  it('point isolé à effectif faible : cercle creux bordé de la couleur de son côté', () => {
    const s = coherente([pt('2023-01', null, 80), pt('2023-02', 85, 80, { effectifs: [6], pointille: true })]);
    const [point] = elements(renderPositioningSvg(s), 'circle');
    expect(point.fill).toBe('#ffffff');
    expect(point.stroke).toBe(COULEURS.dessus);
  });

  it('moyenne des cabinets : un tracé par plage continue, disque noir pour un mois isolé, aucun chemin vide', () => {
    const plages = renderPositioningSvg(coherente([
      pt('2023-01', 82, 80), pt('2023-02', 81, 80), pt('2023-03', 80, null), pt('2023-04', 79, 78), pt('2023-05', 78, 78),
    ]));
    const chemins = elements(plages, 'path');
    expect(chemins).toHaveLength(1);
    expect(chemins[0].d.match(/M/g)).toHaveLength(2);
    expect(elements(plages, 'circle')).toHaveLength(0);

    const isole = renderPositioningSvg(coherente([pt('2023-01', 82, null), pt('2023-02', 81, 80), pt('2023-03', 80, null)]));
    expect(elements(isole, 'path')).toHaveLength(0);
    const disques = elements(isole, 'circle');
    expect(disques).toHaveLength(1);
    expect(disques[0].fill).toBe(COULEURS.ensemble);

    const sans = renderPositioningSvg(coherente([pt('2023-01', 82, null), pt('2023-02', 81, null)]));
    expect(sans).not.toContain('<path');
    expect(sans).not.toContain(COULEURS.ensemble);
  });

  it('bulles : accords au singulier et rang ordinal', () => {
    const niveau = renderPositioningSvg(coherente([pt('2023-01', 82, 80, { nCabinetsEnsemble: 1 }), pt('2023-02', 81, 80)]));
    expect(niveau).toContain('janv. 2023 : cabinet 82,0 · moyenne des cabinets 80,0 (1 cabinet) · n = 12');
    expect(niveau).toContain('(30 cabinets)');
    const rang = renderPositioningSvg(coherente(
      [pt('2023-01', 1, null, { nCabinetsEnsemble: 1, axesSignales: 0 }), pt('2023-02', 2, null, { axesSignales: 2 })],
      { kind: 'rang', ficheNumero: 12, seriesId: 'rang', label: 'Rang au méta-classement' },
    ));
    expect(rang).toContain('janv. 2023 : cabinet 1er (0 axe signalé, 1 cabinet classé)');
    expect(rang).toContain('févr. 2023 : cabinet 2e (2 axes signalés, 30 cabinets classés)');
  });
});

describe('renderPositioningSection', () => {
  const h: CabinetPositioningHistory = {
    cabinet: 'CAB A', months: ['2023-01', '2023-02'], series: [serie()],
    firstMonth: '2023-01', lastMonth: '2023-02', nDated: 12, nUndated: 2,
  };

  it('en-tête : période exacte, effectifs, non datées, mention daltoniens', () => {
    const html = renderPositioningSection(h);
    expect(html).toContain('historique de janv. 2023 à févr. 2023');
    expect(html).toContain('12 évaluations datées');
    expect(html).toContain('2 sans date de clôture, exclues');
    expect(renderPositioningSection({ ...h, nDated: 1998 })).toContain('· 1\u00A0998 évaluations datées ·');
    expect(html).toContain(MENTION_DALTONIENS);
    expect(MENTION_DALTONIENS).toBe('Couleurs choisies pour rester lisibles par les personnes daltoniennes.');
    expect(html).toContain('Fiche 3');
    expect(html).toContain("pour un écart, les deux effectifs sont donnés dans l'ordre du titre (ex. multi / mono)");
  });

  it('légende : chaque libellé avec sa couleur', () => {
    const legende = /<div class="pos-legende">([\s\S]*?)<\/div>/.exec(renderPositioningSection(h))![1];
    const entrees: [string, string][] = [
      [COULEURS.ensemble, 'Moyenne des cabinets'],
      [COULEURS.dessus, 'Cabinet, au-dessus de la moyenne'],
      [COULEURS.dessous, 'Cabinet, en dessous de la moyenne'],
      [COULEURS.rang, 'Rang (sans moyenne)'],
    ];
    for (const [couleur, libelle] of entrees) expect(legende).toContain(`border-color:${couleur}"></i>${libelle}`);
    expect(legende).toContain('Effectif faible');
    expect(legende).toContain('pos-pointille');
    expect(legende).toContain('pos-creux');
  });

  it('accords au singulier ; élision de la période', () => {
    const html = renderPositioningSection({ ...h, firstMonth: '2023-04', lastMonth: '2023-10', nDated: 1, nUndated: 1 });
    expect(html).toContain("historique d'avr. 2023 à oct. 2023");
    expect(html).toContain('1 évaluation datée ');
    expect(html).toContain('1 sans date de clôture, exclue.');
  });

  it('sans non datées : aucune mention dans l’en-tête', () => {
    expect(renderPositioningSection({ ...h, nUndated: 0 })).not.toContain('sans date de clôture');
  });

  it('historique absent, sans série, ou cabinet sans aucune valeur tracée : mention seule, commune au PDF', () => {
    const mention = `<p class="note">${MENTION_HISTORIQUE_NON_DISPONIBLE}</p>`;
    expect(MENTION_HISTORIQUE_NON_DISPONIBLE).toBe('Historique du positionnement non disponible.');
    // Cabinet sans aucune évaluation datée : toutes les séries vides, période absente.
    const vide = serie({ points: [pt('2023-01', null, 80, { effectifs: [] })], segments: [], firstMonth: null, lastMonth: null });
    const sansDate = { ...h, series: Array.from({ length: 11 }, () => vide), firstMonth: null, lastMonth: null, nDated: 0, nUndated: 3 };
    for (const html of [renderPositioningSection(null), renderPositioningSection({ ...h, series: [] }), renderPositioningSection(sansDate)]) {
      expect(html).toBe(mention);
      expect(html).not.toContain(MENTION_CARTE_VIDE);
      expect(html).not.toContain('pos-carte');
    }
  });

  it('textes communs au PDF : en-tête, légende, mentions, intertitre et note repris tels quels', () => {
    const vide = serie({ points: [pt('2023-01', null, 80, { effectifs: [2] })], segments: [], firstMonth: null, lastMonth: null });
    const region = serie({ kind: 'region', ficheNumero: 4, seriesId: 'region:Bretagne', label: 'Bretagne' });
    const html = renderPositioningSection({ ...h, series: [serie(), vide, region] });
    expect(html).toContain(`<p class="note">${enTetePositionnement(h)}</p>`);
    for (const { texte } of LEGENDE_POSITIONNEMENT) expect(html).toContain(`</i>${texte}</span>`);
    expect(html).toContain(`<p class="note">${MENTION_DALTONIENS}</p>`);
    expect(html).toContain(`<div class="pos-vide">${MENTION_CARTE_VIDE}</div>`);
    expect(html).toContain(`<h4>${SOUS_TITRE_REGIONS}</h4>`);
    expect(html).toContain(`<p class="note">${NOTE_POSITIONNEMENT}</p>`);
    // Insérés sans échappement : aucun caractère réservé du HTML hormis l'apostrophe.
    const textes = [enTetePositionnement(h), MENTION_DALTONIENS, MENTION_CARTE_VIDE, SOUS_TITRE_REGIONS, NOTE_POSITIONNEMENT];
    for (const t of [...textes, ...LEGENDE_POSITIONNEMENT.map((e) => e.texte)]) expect(t).not.toMatch(/[<>&"]/);
  });

  it('régions : intertitre de la fiche 4 seulement si le cabinet en a', () => {
    expect(renderPositioningSection(h)).not.toContain('<h4>');
    const region = serie({ kind: 'region', ficheNumero: 4, seriesId: 'region:Bretagne', label: 'Bretagne' });
    const html = renderPositioningSection({ ...h, series: [serie(), region] });
    expect(html).toContain("<h4>Fiche 4 — note moyenne dans chaque région d'intervention</h4>");
    expect(html.indexOf('Bretagne')).toBeGreaterThan(html.indexOf('<h4>'));
  });
});
