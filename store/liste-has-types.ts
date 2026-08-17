/** Types des données « liste HAS / accréditations » (amorce + archive locale). */
import type { ListeHasEtat } from '../core/liste-has-parse';
import type { CofracRrsRow } from '../core/cofrac-parse';

export type { ListeHasEtat };

/** Effectifs publiés par les bilans annuels HAS (points au 31/12). */
export interface BilanAnnuel {
  date: string; // YYYY-MM-DD
  autorises: number;
  accredites: number | null; // null quand le bilan ne le publie pas
  derogation: number | null;
  source: string; // ex. « Bilan annuel HAS 2024 »
}

/** Piste de succession d'entité (rapprochement par nom, JAMAIS affirmé). */
export interface PisteSuccession {
  sortiSiren: string;
  sortiNom: string;
  revenuSiren: string;
  revenuNom: string;
  lecture: string; // formulation neutre, ex. « même nom, autre SIREN »
}

/** Alias curaté : nom Synaé (oe_nom) → SIREN de la liste HAS. */
export interface AliasEntry {
  oeNom: string;
  siren: string;
}

/** Relevé COFRAC daté (archive locale). */
export interface CofracReleve {
  date_releve: string; // YYYY-MM-DD
  sha256: string;
  rows: CofracRrsRow[];
}

export interface ListeHasSeed {
  etats: ListeHasEtat[];
  bilans: BilanAnnuel[];
  /** Faits datés publiés par les bilans annuels HAS (encadré du volet ②). */
  faits: string[];
  pistes: PisteSuccession[];
  alias: AliasEntry[];
}
