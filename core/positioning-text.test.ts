import { describe, it, expect } from 'vitest';
import {
  moisFr,
  periodeLabel,
  pluriel,
  ordinal,
  entierFr,
  valeurPositionnement,
  bornesAxeLabels,
  derniereValeurLabel,
  effectifsLabel,
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
} from './positioning-text';
import { domaineSerie } from './positioning-plot';
import {
  SEUIL_POINT,
  type CabinetPositioningHistory,
  type PositioningPoint,
  type PositioningSeries,
} from './cabinet-positioning-history';

const pt = (month: string, cabinet: number | null, o: Partial<PositioningPoint> = {}): PositioningPoint => ({
  month, cabinet, ensemble: 80, nCabinetsEnsemble: 30, effectifs: [12], reliability: null,
  pointille: false, cote: cabinet === null ? null : 'dessus', ...o,
});
const serie = (o: Partial<PositioningSeries> = {}): PositioningSeries => ({
  ficheNumero: 3, seriesId: 'niveau', label: 'Note moyenne', kind: 'niveau',
  points: [pt('2023-01', 82), pt('2023-02', 78)], segments: [],
  firstMonth: '2023-01', lastMonth: '2023-02', ...o,
});

describe('moisFr', () => {
  it('mois abrégé et année', () => {
    expect(moisFr('2023-01')).toBe('janv. 2023');
    expect(moisFr('2024-08')).toBe('août 2024');
    expect(moisFr('2026-12')).toBe('déc. 2026');
  });
});

describe('periodeLabel', () => {
  it('« de … à … », jamais « du … au … »', () => {
    expect(periodeLabel('2023-01', '2026-03')).toBe('de janv. 2023 à mars 2026');
  });

  it('un seul mois : « en … »', () => {
    expect(periodeLabel('2026-03', '2026-03')).toBe('en mars 2026');
    expect(periodeLabel('2023-04', '2023-04')).toBe('en avr. 2023');
  });

  it('élision devant avr., août et oct.', () => {
    expect(periodeLabel('2023-04', '2025-10')).toBe("d'avr. 2023 à oct. 2025");
    expect(periodeLabel('2024-08', '2024-09')).toBe("d'août 2024 à sept. 2024");
    expect(periodeLabel('2022-10', '2024-04')).toBe("d'oct. 2022 à avr. 2024");
  });
});

describe('pluriel', () => {
  it('0 et 1 au singulier, 2 et plus au pluriel', () => {
    expect(pluriel(0, 'cabinet classé', 'cabinets classés')).toBe('cabinet classé');
    expect(pluriel(1, 'cabinet classé', 'cabinets classés')).toBe('cabinet classé');
    expect(pluriel(2, 'cabinet classé', 'cabinets classés')).toBe('cabinets classés');
    expect(pluriel(140, 'évaluation datée', 'évaluations datées')).toBe('évaluations datées');
  });
});

describe('ordinal', () => {
  it('1er, puis 2e, 3e…', () => {
    expect(ordinal(1)).toBe('1er');
    expect(ordinal(2)).toBe('2e');
    expect(ordinal(59)).toBe('59e');
  });
});

describe('entierFr', () => {
  it('séparateur de milliers (espace insécable)', () => {
    expect(entierFr(7)).toBe('7');
    expect(entierFr(999)).toBe('999');
    expect(entierFr(1998)).toBe('1\u00A0998');
    expect(entierFr(1234567)).toBe('1\u00A0234\u00A0567');
  });
});

describe('valeurPositionnement', () => {
  it('note et région à une décimale, écart signé à une décimale (moins ASCII), HHI à deux décimales, rang ordinal', () => {
    expect(valeurPositionnement('niveau', 82.06)).toBe('82,1');
    expect(valeurPositionnement('region', 70)).toBe('70,0');
    expect(valeurPositionnement('ecart', 3.08)).toBe('+3,1');
    expect(valeurPositionnement('ecart', -0.44)).toBe('-0,4');
    expect(valeurPositionnement('ecart', -0.04)).toBe('0,0'); // jamais « -0,0 » ni « +0,0 »
    expect(valeurPositionnement('niveau', -0.04)).toBe('0,0');
    expect(valeurPositionnement('hhi', 0.456)).toBe('0,46');
    expect(valeurPositionnement('rang', 1)).toBe('1er');
    expect(valeurPositionnement('rang', 59)).toBe('59e');
  });
});

describe('bornesAxeLabels', () => {
  it('valeur haute du domaine en haut, valeur basse en bas, au format de la série', () => {
    expect(bornesAxeLabels(serie(), { lo: 77.52, hi: 82.48 })).toEqual({ haut: '82,5', bas: '77,5' });
    expect(bornesAxeLabels(serie({ kind: 'region' }), { lo: 60, hi: 90 })).toEqual({ haut: '90,0', bas: '60,0' });
    expect(bornesAxeLabels(serie({ kind: 'ecart' }), { lo: -0.42, hi: 3.08 })).toEqual({ haut: '+3,1', bas: '-0,4' });
    expect(bornesAxeLabels(serie({ kind: 'hhi' }), { lo: 0.3, hi: 0.456 })).toEqual({ haut: '0,46', bas: '0,30' });
  });

  it('domaine de tracé tel que calculé pour la série', () => {
    // Valeurs 78 à 82 (cabinet et moyenne), élargies de 12 % de l'étendue de chaque côté.
    const s = serie({ points: [pt('2023-01', 82, { ensemble: 80 }), pt('2023-02', 78, { ensemble: 80 })] });
    expect(bornesAxeLabels(s, domaineSerie(s))).toEqual({ haut: '82,5', bas: '77,5' });
  });

  it('rang : axe inversé, « 1er » en haut ; rangs entiers contenus dans le domaine, bornés au 1er et aux cabinets classés', () => {
    const rang = serie({ kind: 'rang', points: [pt('2023-01', 1, { ensemble: null, nCabinetsEnsemble: 140 })] });
    expect(bornesAxeLabels(rang, { lo: 0.76, hi: 3.24 })).toEqual({ haut: '1er', bas: '3e' });
    expect(bornesAxeLabels(rang, { lo: 47.3, hi: 72.7 })).toEqual({ haut: '48e', bas: '72e' });
    // Domaine élargi au-delà des rangs possibles (1er à 140e sur 140) : jamais « 0e » ni « 157e ».
    expect(bornesAxeLabels(rang, { lo: -15.68, hi: 156.68 })).toEqual({ haut: '1er', bas: '140e' });
    // Rang constant : domaine d'une unité de chaque côté.
    expect(bornesAxeLabels(rang, { lo: 0, hi: 2 })).toEqual({ haut: '1er', bas: '2e' });
  });

  it('rang : sur le domaine calculé pour la série, les libellés sont exactement ses bords', () => {
    const rang = (valeurs: number[], classes = 140) =>
      serie({ kind: 'rang', points: valeurs.map((v, i) => pt(`2023-0${i + 1}`, v, { ensemble: null, nCabinetsEnsemble: classes })) });
    const cas: [PositioningSeries, { lo: number; hi: number }][] = [
      [rang([50, 70]), { lo: 47, hi: 73 }], // 47,6 → 72,4 arrondi vers l'extérieur
      [rang([59, 59]), { lo: 58, hi: 60 }], // rang constant : un rang de chaque côté
      [rang([1, 140]), { lo: 1, hi: 140 }], // ramené au 1er et au nombre de cabinets classés
      [rang([3, 1]), { lo: 1, hi: 4 }],
      [rang([1, 1], 1), { lo: 1, hi: 2 }], // un seul cabinet classé : 1er à 2e
    ];
    for (const [s, attendu] of cas) {
      const d = domaineSerie(s);
      expect(d).toEqual(attendu);
      expect(bornesAxeLabels(s, d)).toEqual({ haut: ordinal(d.lo), bas: ordinal(d.hi) });
    }
  });
});

describe('derniereValeurLabel', () => {
  it('valeurs du cabinet et de la moyenne au dernier mois tracé', () => {
    expect(derniereValeurLabel(serie())).toBe('févr. 2023 : cabinet 78,0 · moyenne 80,0');
    const ecart = serie({ kind: 'ecart', points: [pt('2023-01', 3.08, { ensemble: -0.44 })], lastMonth: '2023-01' });
    expect(derniereValeurLabel(ecart)).toBe('janv. 2023 : cabinet +3,1 · moyenne -0,4');
    const hhi = serie({ kind: 'hhi', points: [pt('2023-01', 0.456, { ensemble: 0.3 })], lastMonth: '2023-01' });
    expect(derniereValeurLabel(hhi)).toBe('janv. 2023 : cabinet 0,46 · moyenne 0,30');
  });

  it('sans moyenne ce mois-là : tiret ; dernier mois tracé, pas dernier mois de la série', () => {
    const s = serie({
      points: [pt('2023-01', 82, { ensemble: null }), pt('2023-02', null)],
      lastMonth: '2023-01',
    });
    expect(derniereValeurLabel(s)).toBe('janv. 2023 : cabinet 82,0 · moyenne —');
  });

  it('rang : « r sur N » (cabinets classés ce mois-là)', () => {
    const rang = serie({
      kind: 'rang',
      points: [pt('2023-01', 3, { ensemble: null }), pt('2023-02', 59, { ensemble: null, nCabinetsEnsemble: 140 })],
    });
    expect(derniereValeurLabel(rang)).toBe('févr. 2023 : 59e sur 140');
  });

  it('carte sans valeur tracée : null', () => {
    expect(derniereValeurLabel(serie({ points: [pt('2023-01', null)], firstMonth: null, lastMonth: null }))).toBeNull();
  });
});

describe('effectifsLabel', () => {
  it('écart : cible puis référence, dans l’ordre du titre', () => {
    // effectifs = [nRéférence, nCible] : « Multi vs mono » → multi (cible) d'abord.
    expect(effectifsLabel('ecart', [48, 8])).toBe('n = 8 / 48');
    expect(effectifsLabel('ecart', [])).toBe('n = 0 / 0');
  });

  it('autres séries : effectif unique', () => {
    expect(effectifsLabel('niveau', [12])).toBe('n = 12');
    expect(effectifsLabel('rang', [1])).toBe('n = 1');
    expect(effectifsLabel('region', [])).toBe('n = 0');
  });

  it('séparateur de milliers', () => {
    expect(effectifsLabel('niveau', [1998])).toBe('n = 1\u00A0998');
    expect(effectifsLabel('ecart', [1998, 1203])).toBe('n = 1\u00A0203 / 1\u00A0998');
  });
});

describe('piedDeCarte', () => {
  it('période, valeurs du dernier mois tracé, puis effectifs du dernier mois', () => {
    expect(piedDeCarte(serie())).toBe('de janv. 2023 à févr. 2023 · févr. 2023 : cabinet 78,0 · moyenne 80,0 · n = 12');
    const avril = serie({ points: [pt('2023-04', 82), pt('2023-10', 78)], firstMonth: '2023-04', lastMonth: '2023-10' });
    expect(piedDeCarte(avril)).toBe("d'avr. 2023 à oct. 2023 · oct. 2023 : cabinet 78,0 · moyenne 80,0 · n = 12");
  });

  it('écart : valeurs signées, effectifs dans l’ordre du titre ; un seul mois : « en … »', () => {
    const s = serie({
      kind: 'ecart', points: [pt('2023-01', 1, { ensemble: 0.5, effectifs: [48, 8] })],
      firstMonth: '2023-01', lastMonth: '2023-01',
    });
    expect(piedDeCarte(s)).toBe('en janv. 2023 · janv. 2023 : cabinet +1,0 · moyenne +0,5 · n = 8 / 48');
  });

  it('rang : « r sur N » (N cabinets classés, écrit une seule fois) et absence de courbe de moyenne', () => {
    const rang = (n: number) => serie({ kind: 'rang', points: [pt('2023-01', 1, { ensemble: null, nCabinetsEnsemble: n, effectifs: [1] })],
      firstMonth: '2023-01', lastMonth: '2023-01' });
    expect(piedDeCarte(rang(1))).toBe('en janv. 2023 · janv. 2023 : 1er sur 1 · n = 1 · sans courbe de moyenne');
    expect(piedDeCarte(rang(30))).toBe('en janv. 2023 · janv. 2023 : 1er sur 30 · n = 1 · sans courbe de moyenne');
    expect(piedDeCarte(rang(30))).not.toContain('classé');
  });

  it('carte vide : uniquement les effectifs', () => {
    expect(piedDeCarte(serie({ points: [pt('2023-01', null, { effectifs: [2] })], firstMonth: null, lastMonth: null }))).toBe('n = 2');
    expect(piedDeCarte(serie({ points: [], firstMonth: null, lastMonth: null }))).toBe('n = 0');
  });
});

describe('titreCarte', () => {
  it('« Fiche n — libellé » ; libellé seul pour une région', () => {
    expect(titreCarte(serie())).toBe('Fiche 3 — Note moyenne');
    expect(titreCarte(serie({ kind: 'region', ficheNumero: 4, label: 'BRETAGNE' }))).toBe('BRETAGNE');
  });
});

describe('enTetePositionnement', () => {
  const h: CabinetPositioningHistory = {
    cabinet: 'CAB A', months: ['2023-04', '2023-05'], series: [],
    firstMonth: '2023-04', lastMonth: '2026-03', nDated: 137, nUndated: 2,
  };

  it('période, évaluations datées, non datées exclues', () => {
    expect(enTetePositionnement(h)).toBe(
      'Points mensuels cumulés (évaluations closes à la fin de chaque mois) · ' +
        "historique d'avr. 2023 à mars 2026 · 137 évaluations datées · 2 sans date de clôture, exclues.",
    );
  });

  it('accords au singulier ; sans non datées : aucune mention ; sans période : historique indisponible', () => {
    expect(enTetePositionnement({ ...h, nDated: 1, nUndated: 1 })).toMatch(/· 1 évaluation datée · 1 sans date de clôture, exclue\.$/);
    expect(enTetePositionnement({ ...h, nUndated: 0 })).toMatch(/· 137 évaluations datées\.$/);
    expect(enTetePositionnement({ ...h, firstMonth: null, lastMonth: null })).toContain('· historique indisponible ·');
  });

  it('entiers avec séparateur de milliers ; période d’un seul mois', () => {
    expect(enTetePositionnement({ ...h, nDated: 1998, nUndated: 1234 })).toMatch(
      /· 1\u00A0998 évaluations datées · 1\u00A0234 sans date de clôture, exclues\.$/,
    );
    expect(enTetePositionnement({ ...h, firstMonth: '2026-03', lastMonth: '2026-03' })).toContain('· historique en mars 2026 ·');
  });
});

describe('légende, mentions, intertitre et note', () => {
  it('légende dans l’ordre, chaque entrée liée à son tracé', () => {
    expect(LEGENDE_POSITIONNEMENT).toEqual([
      { cle: 'ensemble', texte: 'Moyenne des cabinets (non ajustée)' },
      { cle: 'dessus', texte: 'Cabinet, au-dessus de la moyenne' },
      { cle: 'dessous', texte: 'Cabinet, en dessous de la moyenne' },
      { cle: 'rang', texte: 'Rang (sans moyenne)' },
      { cle: 'effectif-faible', texte: 'Effectif faible (pointillé ; point isolé : cercle creux)' },
    ]);
  });

  it('mentions et intertitre', () => {
    expect(MENTION_DALTONIENS).toBe('Couleurs choisies pour rester lisibles par les personnes daltoniennes.');
    expect(MENTION_CARTE_VIDE).toBe('Effectif insuffisant sur toute la période');
    expect(MENTION_HISTORIQUE_NON_DISPONIBLE).toBe('Historique du positionnement non disponible.');
    expect(SOUS_TITRE_REGIONS).toBe("Fiche 4 — note moyenne dans chaque région d'intervention");
  });

  it('note : seuil de point du calcul, échelle sur 100, sens du rang, formulation neutre', () => {
    expect(NOTE_POSITIONNEMENT).toContain(`au moins ${SEUIL_POINT} évaluations (${SEUIL_POINT} dans chaque groupe pour un écart)`);
    expect(NOTE_POSITIONNEMENT).toContain('Scores sur 100 ; écarts en points');
    expect(NOTE_POSITIONNEMENT).toContain('axes signalés décroissant');
    expect(NOTE_POSITIONNEMENT).toContain(
      "Rang (fiche 12) : ordre du méta-classement publié, par nombre d'axes signalés décroissant ; " +
        'le 1er rang est celui qui en compte le plus.',
    );
    expect(NOTE_POSITIONNEMENT).toContain("être au-dessus ou en dessous de la moyenne n'est pas un jugement.");
  });
});

describe('historiqueTracable', () => {
  const h: CabinetPositioningHistory = {
    cabinet: 'CAB A', months: ['2023-01', '2023-02'], series: [serie()],
    firstMonth: '2023-01', lastMonth: '2023-02', nDated: 12, nUndated: 0,
  };

  it('historique obtenu, avec au moins une série et une valeur tracée du cabinet', () => {
    expect(historiqueTracable(h)).toBe(true);
  });

  it('historique absent, sans série, ou cabinet sans aucune valeur tracée (aucune évaluation datée) : non', () => {
    expect(historiqueTracable(null)).toBe(false);
    expect(historiqueTracable({ ...h, series: [] })).toBe(false);
    const vide = serie({ points: [pt('2023-01', null, { effectifs: [] })], firstMonth: null, lastMonth: null });
    expect(historiqueTracable({ ...h, series: [vide], firstMonth: null, lastMonth: null, nDated: 0, nUndated: 3 })).toBe(false);
  });
});
