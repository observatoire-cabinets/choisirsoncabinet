/**
 * Calendrier des 12 fiches de l'Observatoire + registre
 * des contenus disponibles. Permet à la mécanique mensuelle de
 * résoudre « quelle fiche pour ce mois ».
 *
 * Les 12 fiches ont désormais un builder enregistré (cf. FICHE_BUILDERS) : fiche 1
 * mono/multi, fiche 2 statut, fiches d'axe « contraste » (4/5/6/8/9/11) et méta-
 * fiches (3/10/12). `getFicheBuilder` renvoie null pour tout numéro hors registre.
 */

import {
  buildFiche001Content,
  type FicheContent,
  type BuildFiche001Opts,
  type CabinetContrastSummary,
} from './fiche-001-content';
import { buildFiche002Content, type BuildFiche002Opts } from './fiche-002-content';
import {
  makeContrastFicheBuilder,
  CONTRAST_FICHE_CONFIGS,
  type BuildContrastFicheOpts,
} from './fiche-contrast-content';
import { buildFiche003Content } from './fiche-003-content';
import { buildFiche010Content } from './fiche-010-content';
import { buildFiche012Content } from './fiche-012-content';

/** Opts acceptées par n'importe quel builder de fiche (superset, tous optionnels). */
export type FicheBuilderOpts = BuildFiche001Opts & BuildFiche002Opts & BuildContrastFicheOpts;

/** Un builder de fiche : opts d'axe (recalculées) + synthèses par cabinet. */
export type FicheBuilder = (
  opts?: FicheBuilderOpts,
  cabinets?: CabinetContrastSummary[],
) => FicheContent;

export interface CalendarEntry {
  numero: number;
  titre: string;
  famille: string;
}

/** Calendrier indicatif des 12 fiches. */
export const FICHE_CALENDAR: ReadonlyArray<CalendarEntry> = [
  { numero: 1, titre: 'Mono vs multi-établissements', famille: 'A. Taille' },
  { numero: 2, titre: 'Effet du statut juridique (public / associatif / lucratif)', famille: 'B. Statut' },
  { numero: 3, titre: 'Cartographie de l’effet cabinet', famille: 'E. Cabinet' },
  { numero: 4, titre: 'Effet régional (variations inter-ARS)', famille: 'D. Territoire' },
  { numero: 5, titre: 'Effet du secteur (PA / PH adultes / PH enfants / autres)', famille: 'C. Secteur' },
  { numero: 6, titre: 'Effet de la capacité de l’établissement', famille: 'A. Taille' },
  { numero: 7, titre: 'Effet d’appartenance à un groupe lucratif national', famille: 'A. Taille' },
  { numero: 8, titre: 'Effet temporel (premier vs second semestre)', famille: 'E. Cabinet' },
  { numero: 9, titre: 'Effet établissement vs service (SAAD, SSIAD…)', famille: 'C. Secteur' },
  { numero: 10, titre: 'Effet de la spécialisation sectorielle du cabinet', famille: 'E. Cabinet' },
  { numero: 11, titre: 'Effet DROM vs métropole', famille: 'D. Territoire' },
  { numero: 12, titre: 'Synthèse annuelle — méta-fiche', famille: 'Toutes' },
];

/** Registre des contenus disponibles (numero → builder). */
const FICHE_BUILDERS: Readonly<Record<number, FicheBuilder>> = {
  1: buildFiche001Content,
  2: buildFiche002Content,
  // Fiches « contraste » saines (4 région, 5 secteur, 6 capacité, 8 temporel,
  // 9 étab/service, 11 DROM) — gabarit générique paramétré par config.
  ...Object.fromEntries(
    Object.values(CONTRAST_FICHE_CONFIGS).map((cfg) => [cfg.numero, makeContrastFicheBuilder(cfg)]),
  ),
  // Méta-fiches (profil par cabinet) — contenu narratif ; données en PJ via le provider méta.
  3: buildFiche003Content,
  10: buildFiche010Content,
  12: buildFiche012Content,
};

/** Période de départ du calendrier (M1). Override via OBSERVATOIRE_CALENDAR_START. */
export const DEFAULT_CALENDAR_START = '2026-06';

/** Retourne le builder de contenu d'une fiche, ou null si non disponible. */
export function getFicheBuilder(numero: number): FicheBuilder | null {
  return FICHE_BUILDERS[numero] ?? null;
}

/** Écart en mois entre deux périodes "YYYY-MM" (b - a). */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Numéro de fiche planifié pour une période donnée, selon l'ordre du calendrier
 * à partir de `start`. Retourne null hors de la plage des 12 fiches.
 */
export function resolveFicheNumeroForPeriod(
  period: string,
  start: string = process.env.OBSERVATOIRE_CALENDAR_START ?? DEFAULT_CALENDAR_START,
): number | null {
  const idx = monthDiff(start, period);
  if (idx < 0 || idx >= FICHE_CALENDAR.length) return null;
  return FICHE_CALENDAR[idx].numero;
}
