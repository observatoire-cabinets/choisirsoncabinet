/**
 * Collecte quotidienne : liste HAS (PDF) et relevé COFRAC (HTML).
 * Ordre non négociable : télécharger → ARCHIVER LE BRUT (empreinte SHA-256)
 * → analyser → seuil de plausibilité → alerte sans-numéro → delta → journal.
 * Un échec est un fait : il se consigne (« trou d'observation »), il ne jette
 * jamais — y compris quand c'est l'ÉCRITURE locale qui tombe en panne (disque
 * plein, verrou d'antivirus, dossier remplacé) : chaque fonction exportée
 * rattrape sa queue en dernier ressort et rend 'echec' en consignant au mieux.
 * L'index est PARTAGÉ entre les deux collectes : chaque entrée porte
 * `source: 'liste' | 'cofrac'` — dédup et « déjà fait » filtrent dessus.
 * Convention temporelle : jours et horodatages sont en UTC (cohérence interne
 * totale — deja_fait, dédup, tri des états et delta partagent la même horloge) ;
 * la collecte planifiée vise une heure locale entre 06:00 et 21:59, où jour UTC = jour local.
 */
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractListeHasText } from '../core/liste-has-pdf';
import { parseListeHasText, type ListeHasEtat } from '../core/liste-has-parse';
import { parseCofracRrsHtml } from '../core/cofrac-parse';
import {
  appendIndex,
  appendJournalSorties,
  latestSha,
  readAllEtats,
  writeBrut,
  writeEtat,
  writeCofracReleve,
  type SourceCollecte,
} from './liste-has-archive';
import { fetchListeHasPdf, fetchCofracRrsHtml } from './source-discovery';
import type { CofracRrsRow } from '../core/cofrac-parse';

/** En dessous de ce nombre d'organismes analysés, on refuse tout delta. */
export const SEUIL_PLAUSIBILITE = 60;

/** Au-delà de cette part d'organismes sans numéro, on consigne une alerte
 * (garde-fou c — on alerte, on ne bloque RIEN). */
export const SEUIL_ALERTE_SANS_NUMERO = 0.3;

export interface SortieListe {
  siren: string;
  nom_dernier_connu: string;
  numero_dernier_connu: string | null;
  departement: string;
  dernier_etat_present: string;
  premier_etat_absent: string;
  motif: 'non indiqué par la source';
}

export interface CollecteListeHasOpts {
  archiveRoot: string;
  fetchImpl?: typeof fetch;
  /** Extraction PDF→texte injectable (tests). Défaut : extractListeHasText. */
  extractText?: (pdf: Buffer) => Promise<string>;
  now?: Date;
}

export interface CollecteListeHasResult {
  resultat: 'archive' | 'inchange' | 'delta_refuse' | 'echec' | 'deja_fait';
  sorties: SortieListe[];
}

const jour = (d: Date): string => d.toISOString().slice(0, 10);
const horodatage = (d: Date): string =>
  jour(d) + '_' + d.toISOString().slice(11, 19).replace(/:/g, '');

async function dejaFaitAujourdhui(
  root: string,
  aujourd: string,
  source: SourceCollecte,
): Promise<boolean> {
  // Relit l'index : une entrée du jour DE LA MÊME SOURCE (archive/inchange)
  // suffit — la collecte est quotidienne, pas plus. Un 'echec' du matin laisse
  // réessayer plus tard, et un succès COFRAC ne masque jamais un échec liste.
  try {
    const raw = await readFile(join(root, 'index.jsonl'), 'utf8');
    return raw
      .trim()
      .split('\n')
      .some((l) => {
        try {
          const e = JSON.parse(l) as { horodatage?: string; resultat?: string; source?: string };
          return (
            e.source === source &&
            typeof e.horodatage === 'string' &&
            e.horodatage.startsWith(aujourd) &&
            (e.resultat === 'archive' || e.resultat === 'inchange')
          );
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
}

/** Consignation de dernier ressort d'une panne d'écriture locale — best-effort :
 * si l'index lui-même est inécrivable, l'échec est rendu sans être consigné. */
async function consignerPanneEcriture(root: string, t: string, source: SourceCollecte): Promise<void> {
  try {
    await appendIndex(root, {
      horodatage: t,
      resultat: 'echec',
      source,
      remarque: "Panne d'écriture locale. Trou d'observation : aucune conclusion ne peut en être tirée.",
    });
  } catch {
    // Même la consignation échoue : le résultat 'echec' de l'appelant reste le fait.
  }
}

export async function collecteListeHas(
  opts: CollecteListeHasOpts,
): Promise<CollecteListeHasResult> {
  const now = opts.now ?? new Date();
  const aujourd = jour(now);
  const t = horodatage(now);
  const extract = opts.extractText ?? extractListeHasText;

  if (await dejaFaitAujourdhui(opts.archiveRoot, aujourd, 'liste')) {
    return { resultat: 'deja_fait', sorties: [] };
  }

  // Validation de plausibilité pour l'ADOPTION d'une nouvelle URL (niveaux 2/3
  // de la découverte) : le candidat doit s'analyser. Le niveau 1 (URL mémorisée)
  // n'est PAS gaté par cette validation — le brut s'archive même quand
  // l'analyseur est cassé, et delta_refuse reste atteignable plus bas.
  const validate = async (pdf: Buffer): Promise<boolean> => {
    try {
      const etat = parseListeHasText(await extract(pdf));
      return etat.organismes.length >= SEUIL_PLAUSIBILITE && etat.date_source !== null;
    } catch {
      return false;
    }
  };

  let fetched;
  try {
    fetched = await fetchListeHasPdf({
      archiveRoot: opts.archiveRoot,
      fetchImpl: opts.fetchImpl,
      validate,
      today: aujourd,
    });
  } catch {
    fetched = null;
  }

  // Dernier ressort (« il ne jette jamais ») : toute panne d'ÉCRITURE de la
  // queue — index remplacé par un dossier, brut/ supprimé, disque plein,
  // verrou d'antivirus — est un fait consigné, pas une exception propagée.
  try {
    if (!fetched) {
      await appendIndex(opts.archiveRoot, {
        horodatage: t,
        resultat: 'echec',
        source: 'liste',
        remarque: "Trou d'observation. Aucune conclusion ne peut en être tirée.",
      });
      return { resultat: 'echec', sorties: [] };
    }

    if (fetched.urlChanged) {
      // Adoption d'une nouvelle URL : consignée dans l'index.
      await appendIndex(opts.archiveRoot, {
        horodatage: t,
        resultat: 'source_changee',
        source: 'liste',
        urlAncienne: fetched.urlAncienne,
        urlNouvelle: fetched.url,
        methode: fetched.methode,
      });
    }

    const empreinte = createHash('sha256').update(fetched.pdf).digest('hex');
    if ((await latestSha(opts.archiveRoot, 'liste')) === empreinte) {
      await appendIndex(opts.archiveRoot, {
        horodatage: t,
        resultat: 'inchange',
        source: 'liste',
        sha256: empreinte,
        octets: fetched.pdf.length,
        url: fetched.url,
      });
      return { resultat: 'inchange', sorties: [] };
    }

    // ARCHIVER D'ABORD — le brut est en sécurité avant toute analyse.
    await writeBrut(opts.archiveRoot, `${t}_liste-has.pdf`, fetched.pdf);
    await appendIndex(opts.archiveRoot, {
      horodatage: t,
      resultat: 'archive',
      source: 'liste',
      sha256: empreinte,
      octets: fetched.pdf.length,
      url: fetched.url,
    });

    let etat: ListeHasEtat;
    try {
      etat = parseListeHasText(await extract(fetched.pdf));
    } catch {
      // Analyse impossible : l'index dit la vérité au lieu d'afficher un
      // 'archive' sain. Le brut, lui, est archivé — re-analyse possible.
      await appendIndex(opts.archiveRoot, {
        horodatage: t,
        resultat: 'analyse_echec',
        source: 'liste',
        remarque: 'Analyse impossible ; brut archivé, re-analyse possible après correction.',
      });
      return { resultat: 'archive', sorties: [] };
    }
    etat.date_releve = aujourd;
    etat.sha256 = empreinte;

    // Garde-fou : un analyseur cassé ne produit pas de fausses sorties.
    if (etat.organismes.length < SEUIL_PLAUSIBILITE) {
      await appendIndex(opts.archiveRoot, {
        horodatage: t,
        resultat: 'delta_refuse',
        source: 'liste',
        nb_analyses: etat.organismes.length,
        seuil: SEUIL_PLAUSIBILITE,
      });
      return { resultat: 'delta_refuse', sorties: [] };
    }

    // Garde-fou c : part sans numéro > 30 % → alerte consignée, rien n'est bloqué.
    const sans = etat.organismes.filter((o) => o.num === '').length;
    if (sans / etat.organismes.length > SEUIL_ALERTE_SANS_NUMERO) {
      await appendIndex(opts.archiveRoot, {
        horodatage: t,
        resultat: 'alerte_sans_numero',
        source: 'liste',
        sans,
        total: etat.organismes.length,
      });
    }

    const etats = await readAllEtats(opts.archiveRoot);
    const precedent = etats.filter((e) => e.date_releve < aujourd).pop() ?? null;

    const sorties: SortieListe[] = [];
    if (precedent) {
      const apres = new Set(etat.organismes.map((o) => o.siren));
      for (const o of precedent.organismes) {
        if (!apres.has(o.siren)) {
          sorties.push({
            siren: o.siren,
            nom_dernier_connu: o.nom,
            numero_dernier_connu: o.num || null,
            departement: o.dept,
            dernier_etat_present: precedent.date_releve,
            premier_etat_absent: aujourd,
            motif: 'non indiqué par la source',
          });
        }
      }
    }
    // Journal AVANT l'état : une panne entre les deux ne perd jamais une sortie
    // détectée (le lendemain rendrait « inchange », sans re-dérivation possible) ;
    // l'idempotence du journal rend le ré-append sans doublon.
    await appendJournalSorties(
      opts.archiveRoot,
      sorties.map((s) => ({ ...s })),
    );
    await writeEtat(opts.archiveRoot, etat);
    return { resultat: 'archive', sorties };
  } catch {
    await consignerPanneEcriture(opts.archiveRoot, t, 'liste');
    return { resultat: 'echec', sorties: [] };
  }
}

export interface RelireBrutsOpts {
  archiveRoot: string;
  /** Extraction PDF→texte injectable (tests). Défaut : extractListeHasText. */
  extractText?: (pdf: Buffer) => Promise<string>;
  /** Horloge injectable (tests) pour l'horodatage de la consignation. */
  now?: Date;
}

export interface RelireBrutsResult {
  relus: number;
  remplaces: number;
  /** Re-analyses refusées par le seuil de plausibilité (état existant conservé). */
  refuses: number;
}

/**
 * Re-analyse des bruts archivés (garde-fou de relecture) : après une correction
 * de l'analyseur livrée par mise à jour, rejoue chaque PDF de brut/ et remplace
 * l'état de même date_releve. Les états d'amorce (embarqués, sans brut local)
 * ne sont pas touchés — seul le brut fait foi. Une re-analyse sous le seuil de
 * plausibilité ne remplace RIEN (un analyseur en régression ne vide pas les
 * états, et un jour refusé en collecte ne gagne pas d'état par la relecture —
 * sinon la collecte suivante journaliserait des sorties fantômes).
 */
export async function relireBruts(opts: RelireBrutsOpts): Promise<RelireBrutsResult> {
  const extract = opts.extractText ?? extractListeHasText;
  const now = opts.now ?? new Date();
  let files: string[];
  try {
    files = (await readdir(join(opts.archiveRoot, 'brut')))
      .filter((f) => f.endsWith('_liste-has.pdf'))
      .sort();
  } catch {
    return { relus: 0, remplaces: 0, refuses: 0 };
  }
  let remplaces = 0;
  let refuses = 0;
  for (const f of files) {
    // Nom de brut : `YYYY-MM-DD_HHMMSS_liste-has.pdf` → date_releve = 10 premiers caractères.
    const dateReleve = f.slice(0, 10);
    try {
      const pdf = await readFile(join(opts.archiveRoot, 'brut', f));
      const etat = parseListeHasText(await extract(pdf));
      if (etat.organismes.length < SEUIL_PLAUSIBILITE || etat.date_source === null) {
        refuses++;
        continue; // implausible : l'état existant reste en place
      }
      etat.date_releve = dateReleve;
      etat.sha256 = createHash('sha256').update(pdf).digest('hex');
      await writeEtat(opts.archiveRoot, etat);
      remplaces++;
    } catch {
      continue; // brut illisible ou écriture en panne : les bruts suivants sont rejoués
    }
  }
  // Consignation de la relecture — best-effort : la relecture elle-même a eu lieu.
  try {
    await appendIndex(opts.archiveRoot, {
      horodatage: horodatage(now),
      resultat: 'relecture',
      source: 'liste',
      relus: files.length,
      remplaces,
      refuses,
    });
  } catch {
    // L'entrée d'index est un compte-rendu, pas une condition du résultat.
  }
  return { relus: files.length, remplaces, refuses };
}

export interface CollecteCofracOpts {
  archiveRoot: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export interface CollecteCofracResult {
  resultat: 'archive' | 'inchange' | 'deja_fait' | 'echec';
  rows: CofracRrsRow[];
}

export async function collecteCofrac(opts: CollecteCofracOpts): Promise<CollecteCofracResult> {
  const now = opts.now ?? new Date();
  const aujourd = jour(now);
  const t = horodatage(now);

  // Même garde quotidienne que la liste : plusieurs lancements de l'application
  // le même jour ne font ni requêtes ni bruts ni entrées d'index supplémentaires.
  if (await dejaFaitAujourdhui(opts.archiveRoot, aujourd, 'cofrac')) {
    return { resultat: 'deja_fait', rows: [] };
  }

  let fetched;
  try {
    fetched = await fetchCofracRrsHtml({
      archiveRoot: opts.archiveRoot,
      fetchImpl: opts.fetchImpl,
      validate: (html) => parseCofracRrsHtml(html).length > 0,
      today: aujourd,
    });
  } catch {
    fetched = null;
  }

  // Dernier ressort : mêmes pannes d'écriture locales que côté liste.
  try {
    if (!fetched) {
      await appendIndex(opts.archiveRoot, {
        horodatage: t,
        resultat: 'echec',
        source: 'cofrac',
        remarque: "Trou d'observation. Aucune conclusion ne peut en être tirée.",
      });
      return { resultat: 'echec', rows: [] };
    }

    if (fetched.urlChanged) {
      // Adoption d'une nouvelle URL : consignée dans l'index.
      await appendIndex(opts.archiveRoot, {
        horodatage: t,
        resultat: 'source_changee',
        source: 'cofrac',
        urlAncienne: fetched.urlAncienne,
        urlNouvelle: fetched.url,
        methode: fetched.methode,
      });
    }

    const empreinte = createHash('sha256').update(fetched.html, 'utf8').digest('hex');
    // Dédup par empreinte, même source : un HTML identique à la veille ne
    // ré-archive rien (croissance bornée du brut et de l'index).
    if ((await latestSha(opts.archiveRoot, 'cofrac')) === empreinte) {
      await appendIndex(opts.archiveRoot, {
        horodatage: t,
        resultat: 'inchange',
        source: 'cofrac',
        sha256: empreinte,
      });
      return { resultat: 'inchange', rows: [] };
    }

    await writeBrut(opts.archiveRoot, `${t}_cofrac-rrs.html`, Buffer.from(fetched.html, 'utf8'));
    const rows = parseCofracRrsHtml(fetched.html);
    await writeCofracReleve(opts.archiveRoot, { date_releve: aujourd, sha256: empreinte, rows });
    await appendIndex(opts.archiveRoot, {
      horodatage: t,
      resultat: 'archive',
      source: 'cofrac',
      sha256: empreinte,
      lignes: rows.length,
    });
    return { resultat: 'archive', rows };
  } catch {
    await consignerPanneEcriture(opts.archiveRoot, t, 'cofrac');
    return { resultat: 'echec', rows: [] };
  }
}
