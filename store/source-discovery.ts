/**
 * Découverte évolutive des sources (liste HAS, relevé COFRAC).
 * Trois niveaux HAS : URL mémorisée → permalien jcms → page pivot.
 * Le niveau 1 sert le document dès que la réponse est un PDF (octets magiques) ;
 * la VALIDATION de plausibilité (injectée) ne gate que l'ADOPTION d'une
 * nouvelle URL (niveaux 2/3) — le brut reste archivable analyseur cassé.
 * L'adoption remplace l'URL mémorisée, se journalise dans sources.json et
 * expose (urlAncienne, methode) pour l'entrée d'index de la collecte.
 * L'historique est identifié par empreinte + date revendiquée — jamais par URL.
 * Réseau défensif : timeout AbortSignal sur chaque requête, taille bornée des
 * réponses, tolérance aux validateurs et aux écritures disque défaillants.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

/** Délai maximal de chaque requête réseau. */
export const TIMEOUT_MS = 30_000;

export const HAS_LISTE_URL_DEFAUT =
  'https://has-sante.fr/upload/docs/application/pdf/2022-08/liste_des_organismes_autorises_pour_l_evaluation_des_essms.pdf';
export const HAS_JCMS_PERMALIEN =
  'https://www.has-sante.fr/jcms/p_3358865/fr/liste-des-organismes-autorises-pour-l-evaluation-des-essms';
export const HAS_PAGE_PIVOT =
  'https://www.has-sante.fr/jcms/p_3336247/fr/les-organismes-accredites';
export const COFRAC_RRS_URL_DEFAUT = 'https://tools.cofrac.fr/fr/easysearch/rrs.php';
export const COFRAC_PAGE_PIVOT = 'https://tools.cofrac.fr/fr/easysearch/';

/** Version des défauts embarqués — incrémenter à chaque changement d'URL par défaut. */
export const SOURCES_VERSION = 1;

/** Slug complet de la liste HAS courante — priorise un candidat exact sur une variante (archive, etc.). */
const HAS_SLUG_EXACT = 'liste-des-organismes-autorises-pour-l-evaluation-des-essms';

/** Nombre maximal de candidats explorés à un niveau de secours (page pivot HAS ou COFRAC). */
const MAX_CANDIDATS = 5;

/** Taille maximale acceptée pour un corps de réponse (garde-fou mémoire). */
const TAILLE_MAX_OCTETS = 200_000_000;

/** Taille maximale d'un corps candidat pour tenter d'y chercher un META Refresh imbriqué. */
const TAILLE_MAX_META_REFRESH = 1_000_000;

export interface SourceState {
  url: string;
  discoveredVia: string; // 'defaut' | 'memorisee' | 'permalien-jcms' | 'page-pivot'
  updatedAt: string; // YYYY-MM-DD
}

export interface SourcesConfig {
  version: number;
  listeHas: SourceState;
  cofracRrs: SourceState;
}

const FICHIER = 'sources.json';

const DEFAUTS: SourcesConfig = {
  version: SOURCES_VERSION,
  listeHas: { url: HAS_LISTE_URL_DEFAUT, discoveredVia: 'defaut', updatedAt: '' },
  cofracRrs: { url: COFRAC_RRS_URL_DEFAUT, discoveredVia: 'defaut', updatedAt: '' },
};

export async function readSources(root: string): Promise<SourcesConfig> {
  const s = await readSourcesStockees(root);
  // Crochet de test : force l'URL (ex. un port fermé pour simuler le hors-ligne
  // de façon déterministe). Jamais utilisé en fonctionnement normal.
  const listeUrl = process.env['OBS_LISTE_HAS_URL'];
  const cofracUrl = process.env['OBS_COFRAC_URL'];
  if (!listeUrl && !cofracUrl) return s;
  return {
    ...s,
    listeHas: listeUrl ? { ...s.listeHas, url: listeUrl } : s.listeHas,
    cofracRrs: cofracUrl ? { ...s.cofracRrs, url: cofracUrl } : s.cofracRrs,
  };
}

async function readSourcesStockees(root: string): Promise<SourcesConfig> {
  try {
    const raw = JSON.parse(await readFile(join(root, FICHIER), 'utf8')) as SourcesConfig;
    // Une version embarquée plus récente (mise à jour du logiciel) prime sur
    // une config locale héritée d'une version antérieure.
    if (typeof raw.version !== 'number' || raw.version < SOURCES_VERSION) {
      return { ...DEFAUTS };
    }
    // Validation de forme minimale : un fichier tronqué ou partiel (ex.
    // {"version":1} seul, sans les sous-objets) ne doit pas faire planter
    // l'appelant en aval avec un TypeError sur une propriété absente.
    if (typeof raw.listeHas?.url !== 'string' || typeof raw.cofracRrs?.url !== 'string') {
      return { ...DEFAUTS };
    }
    return raw;
  } catch {
    return { ...DEFAUTS };
  }
}

export async function writeSources(root: string, s: SourcesConfig): Promise<void> {
  await writeFile(join(root, FICHIER), JSON.stringify(s, null, 1), 'utf8');
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Options réseau communes (en-tête, délai maximal) — site unique de construction. */
function fetchGarde(): RequestInit {
  return { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) };
}

async function tryFetchPdf(fetchImpl: typeof fetch, url: string): Promise<Buffer | null> {
  try {
    const res = await fetchImpl(url, fetchGarde());
    if (!res.ok) return null;
    const longueur = Number(res.headers.get('content-length') ?? 0);
    if (longueur > TAILLE_MAX_OCTETS) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Résout le META Refresh de la page doXiti en URL absolue upload/docs. */
export function resolveMetaRefresh(html: string, baseHost: string): string | null {
  const m = /URL='([^']+)'/i.exec(html) ?? /URL=([^">\s]+)/i.exec(html);
  if (!m) return null;
  const chemin = m[1].replace(/^(\.\.\/)+/, '/');
  if (!/upload\/docs\//i.test(chemin)) return null;
  if (chemin.startsWith('http')) {
    // URL absolue : on ne suit un hôte étranger sous aucun prétexte, même si
    // l'adoption finale reste de toute façon gatée par validate().
    return /^https:\/\/(www\.)?has-sante\.fr\//i.test(chemin) ? chemin : null;
  }
  return `${baseHost}${chemin.startsWith('/') ? '' : '/'}${chemin}`;
}

export interface FetchListeHasOpts {
  archiveRoot: string;
  fetchImpl?: typeof fetch;
  /**
   * Validation de plausibilité d'un PDF CANDIDAT (extraction+analyse en amont
   * réel). N'est consultée que pour l'ADOPTION d'une nouvelle URL (niveaux
   * 2/3) — jamais pour l'URL mémorisée du niveau 1.
   */
  validate: (pdf: Buffer) => Promise<boolean>;
  today?: string; // YYYY-MM-DD, injectable
}

export interface FetchListeHasResult {
  pdf: Buffer;
  url: string;
  urlChanged: boolean;
  /** URL mémorisée remplacée (null tant que urlChanged est faux). */
  urlAncienne: string | null;
  /** Méthode de découverte de la nouvelle URL (null tant que urlChanged est faux). */
  methode: string | null;
}

export async function fetchListeHasPdf(opts: FetchListeHasOpts): Promise<FetchListeHasResult | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sources = await readSources(opts.archiveRoot);
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  // Niveau 1 : URL mémorisée — le document est servi dès que la réponse est un
  // PDF (octets magiques). PAS de validation de plausibilité ici : le brut doit
  // rester archivable même quand l'analyseur est cassé (« archiver d'abord »).
  const direct = await tryFetchPdf(fetchImpl, sources.listeHas.url);
  if (direct && direct.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { pdf: direct, url: sources.listeHas.url, urlChanged: false, urlAncienne: null, methode: null };
  }

  // Crochet de test : URL forcée par l'environnement → AUCUNE redécouverte
  // (niveaux 2/3) : l'échec du direct est final. Jamais utilisé en
  // fonctionnement normal.
  if (process.env['OBS_LISTE_HAS_URL']) return null;

  // Niveau 2 : permalien jcms → doXiti → META Refresh.
  const candidats: { url: string; via: string }[] = [];
  try {
    const res = await fetchImpl(HAS_JCMS_PERMALIEN, fetchGarde());
    if (res.ok) {
      const resolue = resolveMetaRefresh(await res.text(), 'https://www.has-sante.fr');
      if (resolue) candidats.push({ url: resolue, via: 'permalien-jcms' });
    }
  } catch {
    // niveau suivant
  }

  // Niveau 3 : page pivot → liens « liste-des-organismes-autorises ».
  // Candidats dédupliqués, priorisés (slug exact d'abord, ordre du document
  // préservé au sein de chaque groupe) et bornés — une page hostile avec des
  // milliers de liens ne doit ni multiplier les requêtes ni faire adopter une
  // variante (archive, etc.) au détriment de la liste courante.
  if (!candidats.length) {
    try {
      const res = await fetchImpl(HAS_PAGE_PIVOT, fetchGarde());
      if (res.ok) {
        const html = await res.text();
        const hrefRe = /href="([^"]*liste-des-organismes-autorises[^"]*)"/gi;
        const vus = new Set<string>();
        const prioritaires: { url: string; via: string }[] = [];
        const autres: { url: string; via: string }[] = [];
        let m: RegExpExecArray | null;
        while ((m = hrefRe.exec(html))) {
          const href = m[1];
          const abs = href.startsWith('http') ? href : `https://www.has-sante.fr${href.startsWith('/') ? '' : '/'}${href}`;
          if (vus.has(abs)) continue;
          vus.add(abs);
          const candidat = { url: abs, via: 'page-pivot' };
          (abs.includes(HAS_SLUG_EXACT) ? prioritaires : autres).push(candidat);
        }
        candidats.push(...prioritaires, ...autres);
        candidats.length = Math.min(candidats.length, MAX_CANDIDATS);
      }
    } catch {
      // épuisé
    }
  }

  for (const c of candidats) {
    // Un candidat jcms peut lui-même rediriger (302 + doXiti) : on suit une fois.
    let pdf = await tryFetchPdf(fetchImpl, c.url);
    if (pdf && pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      // Ne tente la résolution META Refresh que sur un corps de taille
      // raisonnable (une page doXiti fait quelques Ko) : un corps non-PDF
      // volumineux ferait lever ERR_STRING_TOO_LONG sur toString('utf8').
      const resolue =
        pdf.length <= TAILLE_MAX_META_REFRESH ? resolveMetaRefresh(pdf.toString('utf8'), 'https://www.has-sante.fr') : null;
      pdf = resolue ? await tryFetchPdf(fetchImpl, resolue) : null;
      // Re-contrôle des octets magiques après le second saut : un soft-404
      // HTML (200 OK, corps HTML) ne doit jamais atteindre validate() comme
      // s'il s'agissait d'un PDF.
      if (pdf && pdf.subarray(0, 5).toString('latin1') !== '%PDF-') pdf = null;
      if (pdf && resolue) c.url = resolue;
    }
    if (!pdf) continue;

    // Pas de fausse adoption : si le candidat résout à l'URL déjà mémorisée
    // (ex. panne transitoire re-résolue à l'identique), ce n'est pas un
    // changement de source — on sert le document sans toucher sources.json.
    if (c.url === sources.listeHas.url) {
      return { pdf, url: c.url, urlChanged: false, urlAncienne: null, methode: null };
    }

    // validate() peut lever (ex. pdfjs sur du HTML) : un candidat qui fait
    // planter l'analyseur est implausible, pas une erreur de la fonction.
    let plausible = false;
    try {
      plausible = await opts.validate(pdf);
    } catch {
      plausible = false;
    }
    if (!plausible) continue; // implausible → jamais adopté

    const next: SourcesConfig = {
      ...sources,
      listeHas: { url: c.url, discoveredVia: c.via, updatedAt: today },
    };
    try {
      await writeSources(opts.archiveRoot, next);
    } catch {
      // La mémorisation est une optimisation, pas une condition de livraison
      // du brut déjà validé : on retourne quand même le résultat à l'appelant.
    }
    return {
      pdf,
      url: c.url,
      urlChanged: true,
      urlAncienne: sources.listeHas.url,
      methode: c.via,
    };
  }

  return null; // trou d'observation — l'appelant journalise
}

export interface FetchCofracOpts {
  archiveRoot: string;
  fetchImpl?: typeof fetch;
  /** Plausibilité : l'extraction rend au moins une ligne 3-XXXX. */
  validate: (html: string) => boolean;
  today?: string;
}

export interface FetchCofracResult {
  html: string;
  url: string;
  urlChanged: boolean;
  /** URL mémorisée remplacée (null tant que urlChanged est faux). */
  urlAncienne: string | null;
  /** Méthode de découverte de la nouvelle URL (null tant que urlChanged est faux). */
  methode: string | null;
}

/** Dernier segment de chemin d'un href, sans le préfixe hôte/chemin. */
function dernierSegment(href: string): string {
  return href.split('/').pop() ?? '';
}

export async function fetchCofracRrsHtml(opts: FetchCofracOpts): Promise<FetchCofracResult | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sources = await readSources(opts.archiveRoot);
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  try {
    const res = await fetchImpl(sources.cofracRrs.url, fetchGarde());
    if (res.ok) {
      const html = await res.text();
      if (opts.validate(html)) {
        return { html, url: sources.cofracRrs.url, urlChanged: false, urlAncienne: null, methode: null };
      }
    }
  } catch {
    // pivot
  }

  // Crochet de test : URL forcée par l'environnement → AUCUNE redécouverte
  // (pivot) : l'échec du direct est final. Jamais utilisé en fonctionnement
  // normal.
  if (process.env['OBS_COFRAC_URL']) return null;

  // Repli pivot multi-candidats : tous les hrefs pertinents de la page sont
  // collectés (pas seulement le premier), dédupliqués et bornés — un asset
  // sans rapport placé avant le vrai lien ne doit pas devenir l'unique
  // candidat retenu.
  const candidats: string[] = [];
  try {
    const res = await fetchImpl(COFRAC_PAGE_PIVOT, fetchGarde());
    if (res.ok) {
      const page = await res.text();
      const hrefRe = /href="([^"]+)"/gi;
      const vus = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = hrefRe.exec(page))) {
        const href = m[1];
        const pertinent = /^rrs[^/]*\.php$/i.test(dernierSegment(href)) || /suspension/i.test(href);
        if (!pertinent) continue;
        const abs = href.startsWith('http')
          ? href
          : `https://tools.cofrac.fr${href.startsWith('/') ? '' : '/fr/easysearch/'}${href}`;
        if (vus.has(abs)) continue;
        vus.add(abs);
        candidats.push(abs);
        if (candidats.length >= MAX_CANDIDATS) break;
      }
    }
  } catch {
    // épuisé
  }

  for (const abs of candidats) {
    let html: string;
    try {
      const res2 = await fetchImpl(abs, fetchGarde());
      if (!res2.ok) continue;
      html = await res2.text();
    } catch {
      continue;
    }

    // Pas de fausse adoption : si le candidat résout à l'URL déjà mémorisée,
    // ce n'est pas un changement de source. Contrairement au niveau 1 HAS
    // (qui n'exige que les octets magiques %PDF-), l'URL
    // mémorisée COFRAC est TOUJOURS gatée par validate() (voir le bloc de
    // tête ci-dessus) : une page de maintenance servie à cette URL ne doit
    // pas être adoptée comme relevé valide au seul motif que l'URL n'a pas
    // changé.
    if (abs === sources.cofracRrs.url) {
      let plausibleIdentique = false;
      try {
        plausibleIdentique = opts.validate(html);
      } catch {
        plausibleIdentique = false;
      }
      if (!plausibleIdentique) continue;
      return { html, url: abs, urlChanged: false, urlAncienne: null, methode: null };
    }

    let plausible = false;
    try {
      plausible = opts.validate(html);
    } catch {
      plausible = false;
    }
    if (!plausible) continue;

    try {
      await writeSources(opts.archiveRoot, {
        ...sources,
        cofracRrs: { url: abs, discoveredVia: 'page-pivot', updatedAt: today },
      });
    } catch {
      // La mémorisation est une optimisation, pas une condition de livraison.
    }
    return {
      html,
      url: abs,
      urlChanged: true,
      urlAncienne: sources.cofracRrs.url,
      methode: 'page-pivot',
    };
  }
  return null;
}
