/**
 * Moteur de l'onglet « Accréditations » (liste HAS + relevé COFRAC).
 * Purement calculatoire, formulation factuelle : une sortie de liste n'est
 * JAMAIS qualifiée (motif non indiqué par la source) ; un rapprochement par
 * nom est une piste, jamais une continuité juridique affirmée.
 */
import type { ListeHasEtat, ListeHasOrganisme } from './liste-has-parse';
import type {
  AliasEntry,
  BilanAnnuel,
  CofracReleve,
  PisteSuccession,
} from '../store/liste-has-types';
import type { CofracRrsRow } from './cofrac-parse';

export type StatutCabinet =
  | 'accredite'
  | 'autorise-sans-numero'
  | 'sorti'
  | 'sorti-avec-numero'
  | 'sorti-concordance-cofrac'
  | 'jamais-observe'
  | 'non-rapproche';

export interface CabinetStatut {
  cabinet: string;
  statut: StatutCabinet;
  siren: string | null;
  num: string | null;
  dept: string | null;
  dernierEtatPresent: string | null;
  premierEtatAbsent: string | null;
  concordance: CofracRrsRow | null;
  /** Date du relevé COFRAC où la concordance a été constatée. */
  concordanceDate: string | null;
}

export interface ChronologieRow {
  date: string;
  kind: 'etat' | 'bilan';
  organismes: number | null;
  accredites: number | null;
  sansNumero: number | null;
  source: string;
}

export interface MouvementRow {
  de: string;
  a: string;
  jours: number;
  avant: number;
  apres: number;
  entrees: number;
  sorties: number;
}

export interface SortieRow {
  siren: string;
  nom: string;
  num: string | null;
  dept: string;
  dernierPresent: string;
  premierAbsent: string;
  motif: 'non indiqué par la source';
  revenu: boolean;
  concordance: CofracRrsRow | null;
  concordanceDate: string | null;
  piste: PisteSuccession | null;
}

/** Signaux d'état de la collecte — calculés par l'engine
 * (qui lit l'index et les réglages), transmis au moteur qui reste pur. */
export interface CollecteSignaux {
  /** Date du premier échec de la série d'échecs consécutifs la plus récente
   * (null si le dernier relevé a réussi). */
  sourceIntrouvableDepuis: string | null;
  /** Heure « HH:MM » de la prochaine collecte planifiée (null si tâche inactive). */
  prochaineCollecte: string | null;
}

export interface AccreditationsInput {
  /** Cabinets connus de l'application (oe_nom Synaé, univers listCabinets). */
  cabinets: string[];
  etats: ListeHasEtat[];
  bilans: BilanAnnuel[];
  /** Faits datés publiés par les bilans annuels HAS (encadré du volet ②). */
  faits: string[];
  pistes: PisteSuccession[];
  alias: AliasEntry[];
  cofrac: CofracReleve[];
  /** Signaux de collecte fournis par l'appelant — optionnel (neutre si absent). */
  collecte?: CollecteSignaux;
}

export interface AccreditationsView {
  dernierEtat: string | null;
  dernierReleveCofrac: string | null;
  statuts: CabinetStatut[];
  tauxRapprochement: { rapproches: number; total: number };
  /** Entrées du dernier état de la liste non rapprochées d'un cabinet Synaé. */
  entreesListeSansEvaluations: number;
  chronologie: ChronologieRow[];
  mouvements: MouvementRow[];
  sorties: SortieRow[];
  /** Faits datés des bilans annuels HAS, sourcés. */
  faitsBilans: string[];
  /** Signaux d'état de la collecte (neutres si non fournis en entrée). */
  collecte: CollecteSignaux;
}

const FORMES_JURIDIQUES =
  /\b(SARL|SASU|SAS|SA|EURL|SELARL|SCOP|SCIC|SNC|GIE|ASSOCIATION|ASSO)\b/g;

/** Normalisation pour rapprochement : casse, accents, ponctuation, formes, espaces. */
export function normalizeCabinetName(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .toUpperCase()
    .replace(FORMES_JURIDIQUES, ' ')
    .replace(/[^A-Z0-9]+/g, ' ') // ponctuation (&, -, ', …) → espace
    .replace(/\s+/g, ' ')
    .trim();
}

const joursEntre = (a: string, b: string): number =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

interface Presence {
  organisme: ListeHasOrganisme;
  dernierPresent: string;
  premierAbsent: string | null; // null = présent au dernier état
  /** Dernier numéro NON VIDE porté par le SIREN au fil des états (pour la
   * concordance COFRAC : un numéro disparu de la liste reste documenté). */
  dernierNum: string | null;
}

/** Présence de chaque SIREN au fil des états (dernier état où vu + fenêtre de sortie). */
function presenceParSiren(etats: ListeHasEtat[]): Map<string, Presence> {
  const m = new Map<string, Presence>();
  for (let i = 0; i < etats.length; i++) {
    const e = etats[i];
    const present = new Set(e.organismes.map((o) => o.siren));
    for (const o of e.organismes) {
      const avant = m.get(o.siren);
      m.set(o.siren, {
        organisme: o,
        dernierPresent: e.date_releve,
        premierAbsent: null,
        dernierNum: o.num ? o.num : (avant?.dernierNum ?? null),
      });
    }
    // Marquer la fenêtre de sortie de ceux vus avant et absents ici.
    for (const [siren, p] of m) {
      if (!present.has(siren) && p.premierAbsent === null && p.dernierPresent < e.date_releve) {
        p.premierAbsent = e.date_releve;
      }
    }
  }
  return m;
}

function concordancePour(
  num: string | null,
  cofrac: CofracReleve[],
  depuis: string,
): { row: CofracRrsRow; date: string } | null {
  if (!num) return null;
  // Seuls les relevés datés depuis la dernière présence sont pertinents : une
  // ligne COFRAC ancienne (depuis retirée du RRS) ne documente pas cette sortie.
  // Du plus récent au plus ancien : la concordance la plus fraîche.
  const releves = cofrac
    .filter((r) => r.date_releve >= depuis)
    .sort((a, b) => b.date_releve.localeCompare(a.date_releve));
  for (const releve of releves) {
    const row = releve.rows.find((r) => r.num === num);
    if (row) return { row, date: releve.date_releve };
  }
  return null;
}

export function buildAccreditationsView(input: AccreditationsInput): AccreditationsView {
  const etats = [...input.etats].sort((a, b) => a.date_releve.localeCompare(b.date_releve));
  const dernier = etats.length ? etats[etats.length - 1] : null;
  const presence = presenceParSiren(etats);

  // Index de rapprochement : nom normalisé → SIREN (ambiguïté = plusieurs SIREN).
  // Sur TOUTES les graphies de TOUS les états : un nom historique d'un SIREN
  // renommé peut coïncider avec le nom final d'un autre — l'ambiguïté doit
  // couvrir ces graphies-là aussi. La clé vide n'est jamais indexée.
  const parNom = new Map<string, Set<string>>();
  for (const e of etats) {
    for (const o of e.organismes) {
      const n = normalizeCabinetName(o.nom);
      if (!n) continue;
      if (!parNom.has(n)) parNom.set(n, new Set());
      parNom.get(n)!.add(o.siren);
    }
  }
  const aliasParNom = new Map<string, string>();
  for (const a of input.alias) {
    const n = normalizeCabinetName(a.oeNom);
    if (n) aliasParNom.set(n, a.siren);
  }

  const statuts: CabinetStatut[] = input.cabinets.map((cabinet) => {
    const n = normalizeCabinetName(cabinet);
    // Clé vide (nom réduit aux formes juridiques) : aucun rapprochement possible.
    let siren: string | null = null;
    if (n) {
      siren = aliasParNom.get(n) ?? null;
      if (!siren) {
        const candidats = parNom.get(n);
        if (candidats && candidats.size === 1) siren = [...candidats][0];
        // candidats.size > 1 : ambigu → non rapproché (piste seulement, pas ici).
      }
    }
    if (!siren) {
      return {
        cabinet, statut: 'non-rapproche', siren: null, num: null, dept: null,
        dernierEtatPresent: null, premierEtatAbsent: null, concordance: null, concordanceDate: null,
      };
    }
    const p = presence.get(siren) ?? null;
    if (!p) {
      // Identité établie (alias) mais présent dans aucun état archivé.
      return {
        cabinet, statut: 'jamais-observe', siren, num: null, dept: null,
        dernierEtatPresent: null, premierEtatAbsent: null, concordance: null, concordanceDate: null,
      };
    }
    const num = p.organisme.num || null;
    if (p.premierAbsent === null) {
      return {
        cabinet,
        statut: num ? 'accredite' : 'autorise-sans-numero',
        siren, num, dept: p.organisme.dept,
        dernierEtatPresent: p.dernierPresent, premierEtatAbsent: null,
        concordance: null, concordanceDate: null,
      };
    }
    // Concordance sur le dernier numéro connu (pas celui de la dernière
    // présence, possiblement vide), dans la fenêtre ouverte par la sortie.
    const conc = concordancePour(p.dernierNum, input.cofrac, p.dernierPresent);
    return {
      cabinet,
      statut: conc ? 'sorti-concordance-cofrac' : num ? 'sorti-avec-numero' : 'sorti',
      siren, num, dept: p.organisme.dept,
      dernierEtatPresent: p.dernierPresent, premierEtatAbsent: p.premierAbsent,
      concordance: conc?.row ?? null, concordanceDate: conc?.date ?? null,
    };
  });

  const rapproches = statuts.filter((s) => s.siren !== null).length;

  // Compteur : SIREN du dernier état non rapprochés d'un cabinet Synaé
  // (organisme autorisé sans évaluations publiées — situation normale).
  const sirensRapproches = new Set(
    statuts.map((s) => s.siren).filter((s): s is string => s !== null),
  );
  const entreesListeSansEvaluations = dernier
    ? dernier.organismes.filter((o) => !sirensRapproches.has(o.siren)).length
    : 0;

  // Chronologie : états + bilans, tri par date.
  const chronologie: ChronologieRow[] = [
    ...etats.map((e): ChronologieRow => {
      const acc = e.organismes.filter((o) => o.num !== '').length;
      return {
        date: e.date_releve, kind: 'etat',
        organismes: e.organismes.length, accredites: acc,
        sansNumero: e.organismes.length - acc,
        source: 'relevé de la liste HAS',
      };
    }),
    ...input.bilans.map((b): ChronologieRow => ({
      date: b.date, kind: 'bilan',
      organismes: b.autorises, accredites: b.accredites, sansNumero: b.derogation,
      source: b.source,
    })),
  ].sort(
    // Comparateur total : à date égale, l'état précède le bilan (ordre stable).
    (a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'etat' ? -1 : 1),
  );

  // Mouvements entre états consécutifs.
  const mouvements: MouvementRow[] = [];
  for (let i = 1; i < etats.length; i++) {
    const avant = etats[i - 1];
    const apres = etats[i];
    const setAvant = new Set(avant.organismes.map((o) => o.siren));
    const setApres = new Set(apres.organismes.map((o) => o.siren));
    mouvements.push({
      de: avant.date_releve, a: apres.date_releve,
      jours: joursEntre(avant.date_releve, apres.date_releve),
      avant: avant.organismes.length, apres: apres.organismes.length,
      entrees: [...setApres].filter((s) => !setAvant.has(s)).length,
      sorties: [...setAvant].filter((s) => !setApres.has(s)).length,
    });
  }

  // Journal des sorties, dérivé des états (rejouable).
  const pistesParSiren = new Map(input.pistes.map((p) => [p.sortiSiren, p]));
  const sorties: SortieRow[] = [];
  for (let i = 1; i < etats.length; i++) {
    const avant = etats[i - 1];
    const apres = etats[i];
    const setApres = new Set(apres.organismes.map((o) => o.siren));
    for (const o of avant.organismes) {
      if (setApres.has(o.siren)) continue;
      // Revenu plus tard ?
      const revenu = etats
        .slice(i + 1)
        .some((e) => e.organismes.some((x) => x.siren === o.siren));
      const conc = concordancePour(o.num || null, input.cofrac, avant.date_releve);
      sorties.push({
        siren: o.siren, nom: o.nom, num: o.num || null, dept: o.dept,
        dernierPresent: avant.date_releve, premierAbsent: apres.date_releve,
        motif: 'non indiqué par la source',
        revenu,
        concordance: conc?.row ?? null, concordanceDate: conc?.date ?? null,
        piste: pistesParSiren.get(o.siren) ?? null,
      });
    }
  }
  // Comparateur total : fenêtre la plus récente d'abord, départage par SIREN.
  sorties.sort((a, b) => b.premierAbsent.localeCompare(a.premierAbsent) || a.siren.localeCompare(b.siren));

  const relevesCofrac = [...input.cofrac].sort((a, b) => a.date_releve.localeCompare(b.date_releve));
  return {
    dernierEtat: dernier?.date_releve ?? null,
    dernierReleveCofrac: relevesCofrac.length ? relevesCofrac[relevesCofrac.length - 1].date_releve : null,
    statuts,
    tauxRapprochement: { rapproches, total: input.cabinets.length },
    entreesListeSansEvaluations,
    chronologie,
    mouvements,
    sorties,
    faitsBilans: input.faits,
    collecte: input.collecte ?? { sourceIntrouvableDepuis: null, prochaineCollecte: null },
  };
}
