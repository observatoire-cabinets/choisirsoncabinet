import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';
import type { Dataset, EssmsRow } from '../store/types';
import { buildFicheCabinet } from './cabinet-fiche';
import { cabinetFicheHistory } from './cabinet-fiche-history';
import {
  renderFicheCabinetPdf,
  MENTION_HISTORIQUE_MENSUEL_FICHE_PASSEE,
  MENTION_HISTORIQUE_MENSUEL_SANS_DATE,
} from './cabinet-fiche-pdf';
import { setSignificanceAlpha, alphaLabelFor } from './significance';
import {
  computePositioningHistory,
  type CabinetPositioningHistory,
  type PositioningPoint,
  type PositioningSeries,
} from './cabinet-positioning-history';
import {
  enTetePositionnement,
  LEGENDE_POSITIONNEMENT,
  MENTION_DALTONIENS,
  MENTION_CARTE_VIDE,
  MENTION_HISTORIQUE_NON_DISPONIBLE,
  SOUS_TITRE_REGIONS,
  NOTE_POSITIONNEMENT,
} from './positioning-text';
import { COULEUR_BORNES } from './positioning-plot';
import { extractPdfText, souple } from './__fixtures__/pdf-text';

function mkRow(p: Partial<EssmsRow> & { finessGeo: string }): EssmsRow {
  return {
    finessGeo: p.finessGeo,
    score: p.score === undefined ? 80 : p.score,
    cabinet: p.cabinet === undefined ? 'CAB A' : p.cabinet,
    raisonSociale: null, region: 'R1',
    statut: 'Public', categ: '', categCode: '500', departement: '75',
    evalDate: p.evalDate === undefined ? '2023-05-10' : p.evalDate,
    grade: p.grade ?? null, chapters: [null, null, null],
    imperatives: [], ciEvaluated: null, ciMet: null, ciAbove35: null,
  };
}
function mkDataset(essms: EssmsRow[]): Dataset {
  return {
    meta: { builtAt: '', hasSyncedAt: '2026-07-01', finessSnapshotMax: '2026-06-01', sources: [] },
    essms,
    ejSnapshots: essms.map((e) => ({ snapshotDate: '2020-01-01', finessGeo: e.finessGeo, ejSize: 1 })),
    capacitySnapshots: [], baseDoc: [], evalHistory: [],
  };
}
const ds = mkDataset([
  mkRow({ finessGeo: '000000001', score: 80, evalDate: '2023-01-15', grade: 'A' }),
  mkRow({ finessGeo: '000000002', score: 90, evalDate: '2023-03-20', grade: 'C' }),
  mkRow({ finessGeo: '000000003', score: 70, evalDate: null }),
  mkRow({ finessGeo: '000000004', score: 60, evalDate: '2023-02-10', cabinet: 'CAB B' }),
]);

describe('renderFicheCabinetPdf', () => {
  it('fiche courante : toutes les sections + historique + pieds de page neutres', async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A')!;
    const history = cabinetFicheHistory(ds, 'CAB A');
    const text = extractPdfText(
      await renderFicheCabinetPdf(fiche, history, 'Données HAS au 2026-07-01', alphaLabelFor(0.05)),
    );
    expect(text).toMatch(/Fiche cabinet/);
    expect(text).toMatch(/CAB A/);
    expect(text).toMatch(/Niveau global/);
    expect(text).toMatch(/axes de pratique/i);
    expect(text).toMatch(/Portefeuille/);
    expect(text).toMatch(/Cotations/);
    // Libellé exact du résumé cotations (3 chapitres, échelle de cotation 1 à 4)
    expect(text).toMatch(/Cotations ?de ?chapitre/);
    expect(text).toMatch(/Historique mensuel/);
    expect(text).toMatch(/2023-01/); // 1re ligne du tableau d'historique
    // Valeurs de la 1re ligne d'historique (mois, n, niveau global) — les lignes
    // mono sont dessinées sans re-wrap : le padding Courier d'alignement survit
    // dans le texte extrait (\s+ le tolère quelle que soit sa largeur)
    expect(text).toMatch(/2023-01\s+1\s+\+0,00/);
    expect(text).toMatch(/sans date de clôture/); // limite nUndated=1 affichée
    // Rappel transverse (charte) — fragment court, tolérant au wrapping
    expect(text).toMatch(/l'évaluateur/);
    // Pieds de page neutres
    expect(text).toMatch(/Données HAS via data\.gouv\.fr/);
    expect(text).toMatch(/Seuil de significativité/);
    // WinAnsi : aucun glyphe grec ne survit (alpha épelé, cf. alphaLabelFor)
    expect(text).not.toMatch(/[αβ]/);
  });

  it("fiche mensuelle : mention de la borne ; section 6 titrée, sans tableau, avant la section 7", async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A', '2023-02')!;
    const pdf = await renderFicheCabinetPdf(fiche, null, 'Données HAS au 2026-07-01', alphaLabelFor(0.05));
    const text = extractPdfText(pdf);
    expect(text).toMatch(/fin 2023-02/);
    expect(text).toMatch(/reconstituée/);
    expect(MENTION_HISTORIQUE_MENSUEL_FICHE_PASSEE).toBe("Non repris sur la fiche d'un mois passé ; voir la fiche courante.");
    // Numérotation continue : 5, 6 (titre et mention), puis 7.
    const i5 = text.indexOf('5. Structures');
    const i6 = text.indexOf('6. Historique mensuel');
    const iMention = text.search(souple(MENTION_HISTORIQUE_MENSUEL_FICHE_PASSEE));
    const i7 = text.indexOf('7. Historique du positionnement');
    expect(i5).toBeGreaterThan(-1);
    expect(i5 < i6 && i6 < iMention && iMention < i7).toBe(true);
    expect(text).not.toMatch(/% grade A/); // aucun tableau
    expect(text).not.toMatch(souple(MENTION_HISTORIQUE_MENSUEL_SANS_DATE));
    // Titre et mention sur la même page.
    const places = textesPlaces(pdf);
    const titre = places.find((t) => t.texte === '6. Historique mensuel')!;
    expect(places.find((t) => t.texte === MENTION_HISTORIQUE_MENSUEL_FICHE_PASSEE)!.page).toBe(titre.page);
  });

  it('fiche courante d’un cabinet sans évaluation datée : section 6 titrée, mention de l’écran, sans tableau', async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A')!;
    const text = extractPdfText(
      await renderFicheCabinetPdf(fiche, { cabinet: 'CAB A', rows: [], nUndated: 1 }, 'x', alphaLabelFor(0.05)),
    );
    expect(MENTION_HISTORIQUE_MENSUEL_SANS_DATE).toBe('Aucune évaluation datée : historique indisponible.');
    const i6 = text.indexOf('6. Historique mensuel');
    const iMention = text.search(souple(MENTION_HISTORIQUE_MENSUEL_SANS_DATE));
    const i7 = text.indexOf('7. Historique du positionnement');
    expect(i6).toBeGreaterThan(-1);
    expect(i6 < iMention && iMention < i7).toBe(true);
    expect(text).not.toMatch(/% grade A/);
    expect(text).not.toMatch(souple(MENTION_HISTORIQUE_MENSUEL_FICHE_PASSEE));
  });

  it('branche défensive cotations = null : message de repli, pas de résumé de cotations', async () => {
    // Inatteignable via buildFicheCabinet (qui renvoie toujours un résumé quand
    // des structures sont scorées) — on force la branche à la main.
    const fiche = { ...buildFicheCabinet(ds, 'CAB A')!, cotations: null };
    const text = extractPdfText(
      await renderFicheCabinetPdf(fiche, null, 'Données HAS au 2026-07-01', alphaLabelFor(0.05)),
    );
    expect(text).toMatch(/Aucune structure scorée à cette borne/);
    expect(text).not.toMatch(/Cotations ?de ?chapitre/);
  });

  it("régression : le seuil imprimé est le paramètre, pas l'état global (0,05 malgré global muté à 0,01)", async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A')!; // calculée au défaut 0,05
    setSignificanceAlpha(0.01); // mutation concurrente simulée APRÈS le calcul
    try {
      const text = extractPdfText(
        await renderFicheCabinetPdf(fiche, null, 'Données HAS au 2026-07-01', alphaLabelFor(0.05)),
      );
      expect(text).toMatch(/Seuil de significativité alpha = 0,05/);
      expect(text).not.toMatch(/alpha = 0,01/);
    } finally {
      setSignificanceAlpha(0.05); // défaut produit — TOUJOURS restauré
    }
  });
});

// ── Historique du positionnement ─────────────────────────────────────────────

interface Trace {
  forme: 'trait' | 'disque' | 'cercle';
  /** Couleur du contour (trait, cercle creux), '#RRGGBB'. */
  contour: string | null;
  /** Couleur de remplissage (disque, cercle creux), '#RRGGBB'. */
  fond: string | null;
  pointille: boolean;
  /** Points des opérateurs m / l, translations `cm` appliquées (repère de la page, y vers le haut). */
  xy: [number, number][];
}

const hex = (composantes: string[]): string =>
  '#' +
  composantes
    .map((x) => Math.round(Number(x) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

/** Classe un bloc graphique pdf-lib (q … Q) d'après son opérateur de peinture ; le texte est ignoré. */
function classer(bloc: string[]): Trace | null {
  if (bloc.includes('BT')) return null;
  const peinture = bloc[bloc.length - 2];
  const forme = peinture === 'S' ? 'trait' : peinture === 'f' ? 'disque' : peinture === 'B' ? 'cercle' : null;
  if (!forme) return null;
  const couleur = (op: 'RG' | 'rg'): string | null => {
    const l = bloc.find((x) => x.endsWith(` ${op}`) && x.split(' ').length === 4);
    return l ? hex(l.split(' ').slice(0, 3)) : null;
  };
  const tirets = bloc.find((x) => / d$/.test(x));
  let dx = 0, dy = 0;
  const xy: [number, number][] = [];
  for (const op of bloc) {
    const t = op.split(' ');
    if (t.length === 7 && t[6] === 'cm') {
      dx += Number(t[4]);
      dy += Number(t[5]);
    }
    if (t.length === 3 && (t[2] === 'm' || t[2] === 'l')) xy.push([Number(t[0]) + dx, Number(t[1]) + dy]);
  }
  return {
    forme,
    contour: forme === 'disque' ? null : couleur('RG'),
    fond: forme === 'trait' ? null : couleur('rg'),
    pointille: tirets !== undefined && !tirets.startsWith('[]'),
    xy,
  };
}

/**
 * Flux de contenu des pages, décompressés : pdf-lib en écrit un par page, dans l'ordre des pages.
 * Le dernier octet d'un flux compressé peut valoir 0x0D : il n'est pas retiré avant
 * « \nendstream » (zlib ignore un octet superflu en fin de flux).
 */
function flux(pdf: Buffer): string[] {
  const out: string[] = [];
  for (const m of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\nendstream/g)) {
    let contenu: string;
    try {
      contenu = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue; // flux binaire non compressé (police, etc.)
    }
    if (/^q$/m.test(contenu)) out.push(contenu);
  }
  return out;
}

/** Tracés (traits, disques, cercles creux) des flux de contenu, dans l'ordre de dessin. */
function traces(pdf: Buffer): Trace[] {
  const out: Trace[] = [];
  for (const contenu of flux(pdf)) {
    let profondeur = 0;
    let bloc: string[] = [];
    for (const op of contenu.split('\n')) {
      if (op === 'q') profondeur++;
      if (profondeur > 0) bloc.push(op);
      if (op === 'Q' && profondeur > 0 && --profondeur === 0) {
        const t = classer(bloc);
        if (t) out.push(t);
        bloc = [];
      }
    }
  }
  return out;
}

interface TextePlace {
  texte: string;
  x: number;
  y: number;
  taille: number;
  /** Indice de la page (0 pour la première). */
  page: number;
}

/** Textes dessinés, avec leur position (Tm), leur taille (Tf) et leur page. */
function textesPlaces(pdf: Buffer): TextePlace[] {
  const out: TextePlace[] = [];
  flux(pdf).forEach((contenu, page) => {
    let taille = 0, x = 0, y = 0;
    for (const op of contenu.split('\n')) {
      const t = op.split(' ');
      if (t[t.length - 1] === 'Tf') taille = Number(t[t.length - 2]);
      if (t.length === 7 && t[6] === 'Tm') {
        x = Number(t[4]);
        y = Number(t[5]);
      }
      const h = /^<([0-9A-Fa-f]*)> Tj$/.exec(op);
      if (h) out.push({ texte: Buffer.from(h[1], 'hex').toString('latin1'), x, y, taille, page });
    }
  });
  return out;
}

const COUL = {
  ensemble: '#111111', dessus: '#378ADD', dessous: '#D85A30', rang: '#555555', blanc: '#FFFFFF',
  zero: '#999999', cadre: '#D9DEE3',
};
const traitsDe = (ts: Trace[], couleur: string): Trace[] =>
  ts.filter((t) => t.forme === 'trait' && t.contour === couleur);
const debut = (t: Trace): [number, number] => t.xy[t.xy.length - 2];
const fin = (t: Trace): [number, number] => t.xy[t.xy.length - 1];
/** Cadres des graphiques, dans l'ordre de dessin. */
const cadres = (ts: Trace[]): { x: number; bas: number; haut: number }[] =>
  traitsDe(ts, COUL.cadre).map((t) => ({
    x: Math.min(...t.xy.map((p) => p[0])),
    bas: Math.min(...t.xy.map((p) => p[1])),
    haut: Math.max(...t.xy.map((p) => p[1])),
  }));
/** Libellés des bornes de l'axe vertical (seuls textes de cette taille), dans l'ordre de dessin. */
const TAILLE_BORNE = 6.5;
const bornesDe = (pdf: Buffer): TextePlace[] => textesPlaces(pdf).filter((t) => t.taille === TAILLE_BORNE);

const pt = (
  month: string,
  cabinet: number | null,
  ensemble: number | null,
  o: Partial<PositioningPoint> = {},
): PositioningPoint => ({
  month, cabinet, ensemble, nCabinetsEnsemble: 30, effectifs: [12], reliability: null,
  pointille: false, cote: cabinet === null ? null : 'dessus', ...o,
});
const serie = (o: Partial<PositioningSeries>): PositioningSeries => ({
  ficheNumero: 3, seriesId: 'niveau', label: 'Note moyenne', kind: 'niveau',
  points: [], segments: [], firstMonth: '2023-04', lastMonth: '2023-06', ...o,
});
const histo = (series: PositioningSeries[], o: Partial<CabinetPositioningHistory> = {}): CabinetPositioningHistory => ({
  cabinet: 'CAB A', months: ['2023-04', '2023-05', '2023-06'], series,
  firstMonth: '2023-04', lastMonth: '2023-06', nDated: 12, nUndated: 0, ...o,
});
const rendre = (h: CabinetPositioningHistory | null): Promise<Buffer> =>
  renderFicheCabinetPdf(buildFicheCabinet(ds, 'CAB A')!, null, 'x', alphaLabelFor(0.05), h);

describe('renderFicheCabinetPdf — historique du positionnement', () => {
  it('ajoute la section avec bornes, légende et mention daltoniens', async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A')!;
    const pos = (await computePositioningHistory(ds, 0.05))!.byCabinet.get('CAB A')!;
    const text = extractPdfText(
      await renderFicheCabinetPdf(fiche, null, 'Données HAS au 2026-07-01', alphaLabelFor(0.05), pos),
    );
    expect(text).toMatch(/Historique du positionnement/);
    expect(text).toMatch(/Couleurs choisies pour rester lisibles par les personnes daltoniennes/);
    expect(text).toMatch(/Moyenne des cabinets/);
    expect(text).toMatch(/Fiche 3/);
    expect(text).toMatch(/Effectif insuffisant sur toute la p/); // petit jeu : séries sans point
  });

  it('historique indisponible : titre de la section 7 et mention, jamais omise ; avant « À lire avant toute interprétation »', async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A')!;
    // Cabinet sans aucune évaluation datée : séries toutes vides, période absente.
    const vide = serie({
      points: [pt('2023-04', null, 80, { effectifs: [], cote: null })], firstMonth: null, lastMonth: null,
    });
    const sansDate = histo(Array.from({ length: 11 }, () => vide), { firstMonth: null, lastMonth: null, nDated: 0, nUndated: 3 });
    const rendus = [
      await renderFicheCabinetPdf(fiche, null, 'x', alphaLabelFor(0.05), null),
      await renderFicheCabinetPdf(fiche, null, 'x', alphaLabelFor(0.05)), // paramètre omis : même rendu
      await rendre(histo([])), // historique sans aucune série
      await rendre(sansDate), // mention unique, pas 11 cartes vides
    ];
    for (const pdf of rendus) {
      const text = extractPdfText(pdf);
      expect(text).toMatch(souple('7. Historique du positionnement'));
      expect(text).toMatch(souple(MENTION_HISTORIQUE_NON_DISPONIBLE));
      expect(text).not.toMatch(/Couleurs choisies/);
      expect(text).not.toMatch(/Effectif insuffisant/);
      expect(bornesDe(pdf)).toEqual([]);
      const i5 = text.indexOf('5. Structures');
      const i7 = text.indexOf('7. Historique du positionnement');
      const iMention = text.indexOf(MENTION_HISTORIQUE_NON_DISPONIBLE);
      const iLire = text.indexOf('lire avant toute interpr');
      expect(i5).toBeGreaterThan(-1);
      expect(i5 < i7 && i7 < iMention && iMention < iLire).toBe(true);
      // Titre et mention sur la même page.
      const places = textesPlaces(pdf);
      const titre = places.find((t) => t.texte === '7. Historique du positionnement')!;
      expect(places.find((t) => t.texte === MENTION_HISTORIQUE_NON_DISPONIBLE)!.page).toBe(titre.page);
    }
  });

  it('section 7 placée après l’historique mensuel et avant « À lire avant toute interprétation »', async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A')!;
    const pos = (await computePositioningHistory(ds, 0.05))!.byCabinet.get('CAB A')!;
    const text = extractPdfText(
      await renderFicheCabinetPdf(fiche, cabinetFicheHistory(ds, 'CAB A'), 'x', alphaLabelFor(0.05), pos),
    );
    const i6 = text.indexOf('6. Historique mensuel');
    const i7 = text.indexOf('7. Historique du positionnement');
    const iNote = text.search(souple(NOTE_POSITIONNEMENT));
    const iLire = text.indexOf('lire avant toute interpr');
    expect(i6).toBeGreaterThan(-1);
    expect(i6 < i7 && i7 < iNote && iNote < iLire).toBe(true);
  });

  it('textes communs à l’écran : en-tête (élision, accords), légende, pied du rang, régions', async () => {
    const rang = serie({
      ficheNumero: 12, seriesId: 'rang', label: 'Rang au méta-classement', kind: 'rang',
      points: [pt('2023-04', 2, null), pt('2023-05', 1, null), pt('2023-06', 1, null)],
      segments: [
        { i0: 0, v0: 2, i1: 1, v1: 1, cote: 'dessus', pointille: false },
        { i0: 1, v0: 1, i1: 2, v1: 1, cote: 'dessus', pointille: false },
      ],
    });
    const region = serie({
      ficheNumero: 4, seriesId: 'region:BRETAGNE', label: 'BRETAGNE', kind: 'region',
      points: [pt('2023-04', null, 70, { effectifs: [1], cote: null })], firstMonth: null, lastMonth: null,
    });
    const text = extractPdfText(await rendre(histo([rang, region], { nDated: 1, nUndated: 2 })));
    expect(text).toMatch(
      souple(
        'Points mensuels cumulés (évaluations closes à la fin de chaque mois) · historique ' +
          "d'avr. 2023 à juin 2023 · 1 évaluation datée · 2 sans date de clôture, exclues.",
      ),
    );
    expect(text).toMatch(souple('Rang (sans moyenne)'));
    expect(text).toMatch(souple("d'avr. 2023 à juin 2023 · juin 2023 : 1er sur 30 · n = 12 · sans courbe de moyenne"));
    expect(text).not.toMatch(/cabinets classés/);
    expect(text).toMatch(souple("Fiche 4 — note moyenne dans chaque région d'intervention"));
    expect(text).toMatch(/BRETAGNE/);
    expect(text).not.toMatch(/Région ?- ?BRETAGNE/);
    expect(text).not.toMatch(/historique du /);
  });

  it('textes communs à l’écran repris tels quels : en-tête, légende, mentions, intertitre, note', async () => {
    const vide = serie({
      points: [pt('2023-04', null, 80, { effectifs: [2], cote: null })], firstMonth: null, lastMonth: null,
    });
    const region = serie({ ficheNumero: 4, seriesId: 'region:BRETAGNE', label: 'BRETAGNE', kind: 'region' });
    const h = histo([vide, region], { nDated: 1998, nUndated: 1234 });
    const text = extractPdfText(await rendre(h));
    expect(text).toMatch(souple(enTetePositionnement(h)));
    // Entiers avec séparateur de milliers, comme le reste du document.
    expect(text).toMatch(souple('1 998 évaluations datées · 1 234 sans date de clôture, exclues.'));
    for (const { texte } of LEGENDE_POSITIONNEMENT) expect(text).toMatch(souple(texte));
    expect(text).toMatch(souple(MENTION_DALTONIENS));
    expect(text).toMatch(souple(MENTION_CARTE_VIDE));
    expect(text).toMatch(souple(SOUS_TITRE_REGIONS));
    expect(text).toMatch(souple(NOTE_POSITIONNEMENT));
  });

  it('entiers jamais coupés au retour à la ligne : séparateur de milliers insécable', async () => {
    // En-tête d'un cabinet de 1 998 évaluations : la ligne déborde juste après « · 1 ».
    const s = serie({
      points: [pt('2023-06', 80, 78), pt('2026-03', 82, 80, { effectifs: [1998] })],
      segments: [{ i0: 0, v0: 80, i1: 1, v1: 82, cote: 'dessus', pointille: false }],
      firstMonth: '2023-06', lastMonth: '2026-03',
    });
    const h = histo([s], { months: ['2023-06', '2026-03'], firstMonth: '2023-06', lastMonth: '2026-03', nDated: 1998 });
    const lignes = textesPlaces(await rendre(h)).map((t) => t.texte);
    expect(lignes.find((t) => t.includes('998 évaluations datées'))).toContain('1\u00A0998 évaluations datées');
    expect(lignes.find((t) => t.includes('n = 1') && t.includes('998'))).toContain('n = 1\u00A0998');
  });

  it('carte vide : mention d’effectif insuffisant une seule fois, pied réduit aux effectifs, aucune borne', async () => {
    const vide = serie({
      points: [pt('2023-04', null, 80, { effectifs: [2], cote: null })], firstMonth: null, lastMonth: null,
    });
    const pdf = await rendre(histo([vide]));
    const text = extractPdfText(pdf);
    expect(text.split('Effectif insuffisant').length - 1).toBe(1);
    expect(text).toMatch(/n = 2/);
    expect(bornesDe(pdf)).toEqual([]);
  });

  it('valeurs : bornes de l’axe en haut et en bas du cadre, à gauche, en gris ; dernière valeur dans le pied', async () => {
    const s = serie({
      points: [pt('2023-04', 80, 78), pt('2023-05', 82, 80)],
      segments: [{ i0: 0, v0: 80, i1: 1, v1: 82, cote: 'dessus', pointille: false }],
      lastMonth: '2023-05',
    });
    const pdf = await rendre(histo([s]));
    // Domaine 78 → 82 élargi de 12 % de chaque côté : 77,52 → 82,48.
    const [haut, bas] = bornesDe(pdf);
    expect([haut.texte, bas.texte]).toEqual(['82,5', '77,5']);
    const [cadre] = cadres(traces(pdf));
    for (const b of [haut, bas]) {
      expect(b.x).toBeCloseTo(cadre.x + 2, 6);
      expect(b.y).toBeGreaterThan(cadre.bas);
      expect(b.y + TAILLE_BORNE).toBeLessThan(cadre.haut);
    }
    expect(haut.y).toBeGreaterThan(cadre.haut - 2 * TAILLE_BORNE); // contre le bord supérieur
    expect(bas.y).toBeLessThan(cadre.bas + TAILLE_BORNE); // contre le bord inférieur
    // Couleur : le gris commun aux deux rendus (opérateur rg du bloc de texte).
    const gris = (COULEUR_BORNES.slice(1).match(/../g) ?? []).map((c) => parseInt(c, 16) / 255);
    const blocs = flux(pdf).join('\n').split('BT\n').slice(1);
    const blocHaut = blocs.find((b) => b.includes(`<${Buffer.from('82,5', 'latin1').toString('hex').toUpperCase()}> Tj`))!;
    const rg = /^([\d.]+) ([\d.]+) ([\d.]+) rg$/m.exec(blocHaut)!.slice(1).map(Number);
    rg.forEach((c, k) => expect(c).toBeCloseTo(gris[k], 6));
    expect(extractPdfText(pdf)).toMatch(souple("d'avr. 2023 à mai 2023 · mai 2023 : cabinet 82,0 · moyenne 80,0 · n = 12"));
  });

  it('écart : ligne zéro horizontale à la hauteur de la valeur 0 ; bornes signées, signe moins ASCII', async () => {
    // Cabinet 1 → −1, moyenne −1 → 1 : croisement à mi-parcours, à la valeur 0 ; domaine symétrique.
    const s = serie({
      ficheNumero: 1, seriesId: 'mono_multi', label: 'Multi vs mono (écart)', kind: 'ecart',
      points: [pt('2023-04', 1, -1, { effectifs: [48, 8] }), pt('2023-05', -1, 1, { effectifs: [48, 8], cote: 'dessous' })],
      segments: [
        { i0: 0, v0: 1, i1: 0.5, v1: 0, cote: 'dessus', pointille: false },
        { i0: 0.5, v0: 0, i1: 1, v1: -1, cote: 'dessous', pointille: false },
      ],
      lastMonth: '2023-05',
    });
    const pdf = await rendre(histo([s]));
    const ts = traces(pdf);
    const zeros = traitsDe(ts, COUL.zero).filter((t) => !t.pointille); // le gris en tirets est celui de la légende
    expect(zeros).toHaveLength(1);
    const [zero] = zeros;
    expect(debut(zero)[1]).toBe(fin(zero)[1]);
    const [, dessus] = traitsDe(ts, COUL.dessus); // légende, puis segment
    expect(fin(dessus)[1]).toBeCloseTo(debut(zero)[1], 6);
    const [cadre] = cadres(ts);
    expect(debut(zero)[1]).toBeCloseTo((cadre.bas + cadre.haut) / 2, 6);
    expect(bornesDe(pdf).map((t) => t.texte)).toEqual(['+1,2', '-1,2']);
    expect(extractPdfText(pdf)).toMatch(souple('mai 2023 : cabinet -1,0 · moyenne +1,0 · n = 8 / 48'));
  });

  it('segments : couleur et pointillé de chaque segment tels que fournis ; moyenne en noir', async () => {
    const s = serie({
      points: [pt('2023-04', 82, 80), pt('2023-05', 78, 80, { cote: 'dessous', pointille: true })],
      segments: [
        { i0: 0, v0: 82, i1: 0.5, v1: 80, cote: 'dessus', pointille: false },
        { i0: 0.5, v0: 80, i1: 1, v1: 78, cote: 'dessous', pointille: true },
      ],
      lastMonth: '2023-05',
    });
    const ts = traces(await rendre(histo([s])));
    // La légende trace un trait plein de chaque couleur ; le reste vient du graphique.
    expect(traitsDe(ts, COUL.dessus).map((t) => t.pointille)).toEqual([false, false]);
    expect(traitsDe(ts, COUL.dessous).map((t) => t.pointille)).toEqual([false, true]);
    expect(traitsDe(ts, COUL.ensemble)).toHaveLength(2);
  });

  it('rang : axe inversé (1er en haut), bornes en ordinaux, dernière valeur « r sur N »', async () => {
    const rang = serie({
      ficheNumero: 12, seriesId: 'rang', label: 'Rang au méta-classement', kind: 'rang',
      points: [pt('2023-04', 3, null), pt('2023-05', 1, null), pt('2023-06', 2, null)],
      segments: [
        { i0: 0, v0: 3, i1: 1, v1: 1, cote: 'dessus', pointille: false },
        { i0: 1, v0: 1, i1: 2, v1: 2, cote: 'dessus', pointille: false },
      ],
    });
    const pdf = await rendre(histo([rang]));
    const [, montee, descente] = traitsDe(traces(pdf), COUL.rang); // légende, puis segments
    // y croît vers le haut : le 1er est plus haut que le 3e et que le 2e.
    expect(fin(montee)[1]).toBeGreaterThan(debut(montee)[1]);
    expect(fin(descente)[1]).toBeLessThan(debut(descente)[1]);
    // Domaine 1 → 3 élargi (0,76 → 3,24) puis arrondi aux rangs entiers : 1 → 4, « 1er » en haut.
    const [haut, bas] = bornesDe(pdf);
    expect([haut.texte, bas.texte]).toEqual(['1er', '4e']);
    expect(haut.y).toBeGreaterThan(bas.y);
    // Le 1er rang est sur le bord haut de la zone de tracé (cadre moins la marge intérieure de 5 pt).
    const [cadre] = cadres(traces(pdf));
    expect(fin(montee)[1]).toBeCloseTo(cadre.haut - 5, 6);
    expect(extractPdfText(pdf)).toMatch(souple('juin 2023 : 2e sur 30'));
  });

  it('rang : gris neutre, jamais bleu ni orange, sans courbe de moyenne même si les points en portent une ; point isolé creux si effectif faible', async () => {
    // Moyennes renseignées sur des mois consécutifs : seul le type de série empêche leur tracé.
    const rang = serie({
      ficheNumero: 12, seriesId: 'rang', label: 'Rang au méta-classement', kind: 'rang',
      points: [
        pt('2023-03', 3, 50),
        pt('2023-04', 1, 51),
        pt('2023-05', null, 52),
        pt('2023-06', 2, 53, { pointille: true, effectifs: [6] }),
      ],
      segments: [{ i0: 0, v0: 3, i1: 1, v1: 1, cote: 'dessus', pointille: false }],
      firstMonth: '2023-03',
    });
    const ts = traces(await rendre(histo([rang])));
    expect(traitsDe(ts, COUL.rang)).toHaveLength(2); // légende + segment
    expect(traitsDe(ts, COUL.dessus)).toHaveLength(1); // légende seule
    expect(traitsDe(ts, COUL.dessous)).toHaveLength(1); // légende seule
    expect(traitsDe(ts, COUL.ensemble)).toHaveLength(1); // légende seule : aucune courbe de moyenne
    const ronds = ts.filter((t) => t.forme !== 'trait');
    expect(ronds.some((t) => t.fond === COUL.ensemble)).toBe(false); // ni disque de moyenne
    expect(ronds).toContainEqual(expect.objectContaining({ forme: 'cercle', contour: COUL.rang, fond: COUL.blanc }));
    expect(ronds.some((t) => t.fond === COUL.dessus || t.contour === COUL.dessus)).toBe(false);
  });

  it('points isolés : côté et effectif faible lus sur le point, jamais recalculés ; moyenne isolée en disque noir', async () => {
    const s = serie({
      // Valeurs contraires au côté fourni : le rendu suit `cote`, pas la comparaison.
      points: [
        pt('2023-04', 80, 70, { cote: 'dessous', pointille: true }),
        pt('2023-05', null, null),
        pt('2023-06', 60, 70, { cote: 'dessus' }),
      ],
    });
    const ts = traces(await rendre(histo([s])));
    const ronds = ts.filter((t) => t.forme !== 'trait');
    expect(ronds).toContainEqual(
      expect.objectContaining({ forme: 'cercle', contour: COUL.dessous, fond: COUL.blanc, pointille: false }),
    );
    expect(ronds.filter((t) => t.forme === 'disque' && t.fond === COUL.dessus)).toHaveLength(1);
    expect(ronds.filter((t) => t.forme === 'disque' && t.fond === COUL.ensemble)).toHaveLength(2);
    expect(traitsDe(ts, COUL.ensemble)).toHaveLength(1); // légende seule : aucun trait entre moyennes isolées
  });

  it('sous-titre des régions : jamais seul en bas de page, quelle que soit la hauteur de la première ligne de régions', async () => {
    // Titre de région replié sur plusieurs lignes : la première ligne de régions est plus haute
    // qu'une ligne à titre et pied d'une seule ligne.
    const courbe = {
      points: [pt('2023-04', 80, 78), pt('2023-05', 82, 80)],
      segments: [{ i0: 0, v0: 80, i1: 1, v1: 82, cote: 'dessus' as const, pointille: false }],
      lastMonth: '2023-05',
    };
    const region = serie({
      ficheNumero: 4, seriesId: 'region:R', kind: 'region', label: `REGIONX ${'AUVERGNE '.repeat(30).trim()}`, ...courbe,
    });
    let reports = 0;
    // Hauteur des séries fixes balayée par pas d'une ligne de titre (10,5 pt), sur plus d'une ligne de grille.
    for (let paires = 1; paires <= 5; paires++) {
      for (let lignes = 0; lignes <= 12; lignes++) {
        const fixes = Array.from({ length: 2 * paires }, (_, k) =>
          serie({ seriesId: `s${k}`, label: k === 0 ? `Note ${'MOYENNE '.repeat(3 * lignes)}`.trim() : 'Note moyenne', ...courbe }),
        );
        const places = textesPlaces(await rendre(histo([...fixes, region])));
        const sousTitre = places.find((t) => t.texte.startsWith('Fiche 4 - note moyenne'))!;
        const titreRegion = places.find((t) => t.texte.startsWith('REGIONX'))!;
        expect(titreRegion.page, `${paires} paire(s), ${lignes} ligne(s) de titre ajoutée(s)`).toBe(sousTitre.page);
        if (sousTitre.y > 760) reports++; // sous-titre reporté en tête de page
      }
    }
    expect(reports).toBeGreaterThan(0); // le balayage atteint bien le bas de page
  });
});
