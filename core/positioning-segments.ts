/**
 * Découpe la courbe d'un cabinet en segments situés au-dessus ou en dessous de
 * la courbe de l'ensemble des cabinets, coupés exactement au point de croisement
 * (interpolation linéaire entre deux mois). Indices fractionnaires = position sur
 * l'axe des mois. Un mois sans valeur pour le cabinet interrompt la courbe.
 *
 * Côté d'un segment : signe du premier écart non nul connu (cabinet moins
 * ensemble) parmi ses deux extrémités ; sans écart non nul connu, le côté
 * précédent est conservé (« dessus » au départ). Égalité : le côté précédent est
 * conservé. Un mois sans valeur d'ensemble conserve aussi le côté précédent.
 *
 * Partagé par le rendu écran (SVG) et le rendu PDF : les deux tracent les mêmes segments.
 */

/** Position d'un segment par rapport à la courbe de l'ensemble. */
export type Cote = 'dessus' | 'dessous';

export interface PositioningSegment {
  i0: number;
  v0: number;
  i1: number;
  v1: number;
  cote: Cote;
  pointille: boolean;
}

const coteDe = (ecart: number): Cote => (ecart >= 0 ? 'dessus' : 'dessous');

/**
 * Côté de chaque mois renseigné du cabinet : signe de l'écart cabinet moins
 * ensemble ; écart nul ou ensemble absent : côté du mois renseigné précédent
 * (« dessus » au départ). null pour un mois sans valeur du cabinet. Sert au
 * tracé d'un point isolé, qui n'appartient à aucun segment.
 */
export function cotesDesPoints(cabinet: (number | null)[], ensemble: (number | null)[]): (Cote | null)[] {
  let cote: Cote = 'dessus';
  return cabinet.map((c, i) => {
    if (c === null) return null;
    const e = ensemble[i] ?? null;
    if (e !== null && c - e !== 0) cote = coteDe(c - e);
    return cote;
  });
}

/**
 * Segments de la courbe du cabinet, un par intervalle de mois consécutifs
 * renseignés, scindés en deux au croisement de la courbe de l'ensemble.
 * `pointille[i]` marque le mois i ; un segment est en pointillé si l'une de ses
 * deux extrémités l'est.
 */
export function decouperSegments(
  cabinet: (number | null)[],
  ensemble: (number | null)[],
  pointille: boolean[],
): PositioningSegment[] {
  const out: PositioningSegment[] = [];
  let cote: Cote = 'dessus';
  for (let i = 0; i + 1 < cabinet.length; i++) {
    const a = cabinet[i];
    const b = cabinet[i + 1];
    const ea = ensemble[i] ?? null;
    const eb = ensemble[i + 1] ?? null;
    if (a === null || b === null) {
      if (a !== null && ea !== null && a - ea !== 0) cote = coteDe(a - ea);
      continue;
    }
    const dash = (pointille[i] ?? false) || (pointille[i + 1] ?? false);
    const da = ea !== null ? a - ea : null;
    const db = eb !== null ? b - eb : null;
    if (da !== null && db !== null && da * db < 0) {
      const t = da / (da - db);
      const im = i + t;
      const vm = a + t * (b - a);
      out.push({ i0: i, v0: a, i1: im, v1: vm, cote: coteDe(da), pointille: dash });
      out.push({ i0: im, v0: vm, i1: i + 1, v1: b, cote: coteDe(db), pointille: dash });
      cote = coteDe(db);
      continue;
    }
    if (da !== null && da !== 0) cote = coteDe(da);
    else if (db !== null && db !== 0) cote = coteDe(db);
    out.push({ i0: i, v0: a, i1: i + 1, v1: b, cote, pointille: dash });
  }
  return out;
}
