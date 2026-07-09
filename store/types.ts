/** Une ligne ESSMS évaluée (extrait de has_essms_open, données publiques HAS). */
export interface EssmsRow {
  finessGeo: string;            // 9 chars, lpad '0'
  score: number | null;         // moy_objectifs_100
  cabinet: string | null;       // oe_nom
  raisonSociale: string | null; // nom fallback
  region: string;               // region_libelle
  statut: string;               // essms_statut_juridique
  categ: string;                // essms_categ_finess_libelle
  categCode: string;            // essms_categ_finess_code
  departement: string;          // departement_code
  evalDate: string | null;      // ISO, eval_date_cloture_tech
  grade: 'A' | 'B' | 'C' | 'D' | null;            // indice_qualite (recalculé)
  chapters: (number | null)[];                     // cotation_chapitre_1..3, échelle 1–4
  imperatives: { code: string; value: number }[];  // cotation_critere_imperatif_* non nuls
  ciEvaluated: number | null;                       // nb_ci
  ciMet: number | null;                             // nb_ci_atteints
  ciAbove35: number | null;                         // nb_ci_sup_3_5
}
/** Mapping FINESS daté (pruné à la cohorte HAS ; ejSize calculé sur le répertoire NATIONAL avant prune). */
export interface EjSnapshotRow { snapshotDate: string; finessGeo: string; ejSize: number; }
export interface CapacitySnapshotRow { snapshotDate: string; finessGeo: string; capacityInstalled: number; }
/** Nom officiel + adresse (base_document_essms, Licence Ouverte 2.0). */
export interface BaseDocRow {
  finessGeo: string; officialLabel: string | null;
  addressLine1: string | null; addressLine2: string | null;
  postalCode: string | null; commune: string | null;
}
/** Une évaluation (historique — registre des cabinets). */
export interface EvalHistoryRow { evalCode: string; cabinet: string | null; dateCloture: string | null; region: string | null; }

export interface DatasetMeta {
  builtAt: string;              // ISO
  hasSyncedAt: string;          // max(synced_at) has_essms_open
  finessSnapshotMax: string;    // max(snapshot_date) finess_ej_mapping
  sources: { name: string; url: string; license: string; retrievedAt: string }[];
}
export interface Dataset {
  meta: DatasetMeta;
  essms: EssmsRow[];
  ejSnapshots: EjSnapshotRow[];
  capacitySnapshots: CapacitySnapshotRow[];
  baseDoc: BaseDocRow[];
  evalHistory: EvalHistoryRow[];
}
