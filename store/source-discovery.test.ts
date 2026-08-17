import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HAS_LISTE_URL_DEFAUT,
  HAS_JCMS_PERMALIEN,
  HAS_PAGE_PIVOT,
  COFRAC_RRS_URL_DEFAUT,
  COFRAC_PAGE_PIVOT,
  readSources,
  writeSources,
  fetchListeHasPdf,
  fetchCofracRrsHtml,
} from './source-discovery';

const tmp = (): Promise<string> => mkdtemp(join(tmpdir(), 'obs-src-'));

/** Routeur URL → réponse. Toute URL non listée → HTTP 404. */
const router = (routes: Record<string, () => Response>): typeof fetch =>
  (async (url: RequestInfo | URL) => {
    const u = String(url);
    for (const [k, v] of Object.entries(routes)) if (u.startsWith(k)) return v();
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

// Un « PDF » minimal : les octets magiques %PDF- suffisent au niveau 1.
const FAKE_PDF = Buffer.from('%PDF-1.4 fake');
const validateOk = async (): Promise<boolean> => true;
const validateKo = async (): Promise<boolean> => false;

describe('source-discovery — liste HAS', () => {
  it("niveau 1 : l'URL mémorisée répond par un PDF → servi SANS validation, aucun changement de source", async () => {
    const root = await tmp();
    const fetchImpl = router({
      [HAS_LISTE_URL_DEFAUT]: () => new Response(FAKE_PDF, { status: 200 }),
    });
    // validateKo : preuve que la plausibilité ne gate PAS le niveau 1 — le brut
    // doit rester archivable même quand l'analyseur est cassé (garde-fou d'archivage).
    const r = await fetchListeHasPdf({ archiveRoot: root, fetchImpl, validate: validateKo });
    expect(r).not.toBeNull();
    expect(r!.urlChanged).toBe(false);
    expect(r!.urlAncienne).toBeNull();
    expect(r!.methode).toBeNull();
    const sources = await readSources(root);
    expect(sources.listeHas.url).toBe(HAS_LISTE_URL_DEFAUT);
  });

  it('niveau 2 : URL morte → redécouverte via permalien jcms (META Refresh) → adoption journalisée', async () => {
    const root = await tmp();
    const nouvelle = 'https://www.has-sante.fr/upload/docs/application/pdf/2027-01/liste_v2.pdf';
    const fetchImpl = router({
      // URL mémorisée morte :
      [HAS_LISTE_URL_DEFAUT]: () => new Response('gone', { status: 404 }),
      // le permalien jcms débouche sur la page doXiti qui porte le META Refresh :
      [HAS_JCMS_PERMALIEN]: () =>
        new Response(
          `<HTML><META http-equiv="Refresh" content="0; URL='../../../../upload/docs/application/pdf/2027-01/liste_v2.pdf'"></HTML>`,
          { status: 200 },
        ),
      [nouvelle]: () => new Response(FAKE_PDF, { status: 200 }),
    });
    const r = await fetchListeHasPdf({ archiveRoot: root, fetchImpl, validate: validateOk });
    expect(r).not.toBeNull();
    expect(r!.urlChanged).toBe(true);
    // L'adoption expose l'ancienne URL et la méthode : la collecte les journalise.
    expect(r!.urlAncienne).toBe(HAS_LISTE_URL_DEFAUT);
    expect(r!.methode).toBe('permalien-jcms');
    const sources = await readSources(root);
    expect(sources.listeHas.url).toBe(nouvelle);
    expect(sources.listeHas.discoveredVia).toBe('permalien-jcms');
  });

  it('niveau 3 : jcms mort aussi → balayage de la page pivot', async () => {
    const root = await tmp();
    const nouvelle = 'https://www.has-sante.fr/jcms/p_9999999/fr/liste-des-organismes-autorises-pour-l-evaluation-des-essms';
    const fetchImpl = router({
      [HAS_LISTE_URL_DEFAUT]: () => new Response('gone', { status: 404 }),
      [HAS_JCMS_PERMALIEN]: () => new Response('gone', { status: 404 }),
      [HAS_PAGE_PIVOT]: () =>
        new Response(
          `<html><a href="/jcms/p_9999999/fr/liste-des-organismes-autorises-pour-l-evaluation-des-essms">Liste des organismes autorisés</a></html>`,
          { status: 200 },
        ),
      [nouvelle]: () => new Response(FAKE_PDF, { status: 200 }),
    });
    const r = await fetchListeHasPdf({ archiveRoot: root, fetchImpl, validate: validateOk });
    expect(r).not.toBeNull();
    // Mutation démontrée : un suffixe parasite sur l'URL adoptée passait inaperçu.
    expect(r!.url).toBe(nouvelle);
    const sources = await readSources(root);
    expect(sources.listeHas.discoveredVia).toBe('page-pivot');
    expect(sources.listeHas.url).toBe(nouvelle);
  });

  it('niveau 3 : le href au slug exact prime sur un href moins spécifique placé avant lui', async () => {
    const root = await tmp();
    const archive = 'https://www.has-sante.fr/jcms/p_1111111/fr/liste-des-organismes-autorises-archive-2022';
    const exact = 'https://www.has-sante.fr/jcms/p_9999999/fr/liste-des-organismes-autorises-pour-l-evaluation-des-essms';
    const fetchImpl = router({
      [HAS_LISTE_URL_DEFAUT]: () => new Response('gone', { status: 404 }),
      [HAS_JCMS_PERMALIEN]: () => new Response('gone', { status: 404 }),
      [HAS_PAGE_PIVOT]: () =>
        new Response(
          `<html>
             <a href="/jcms/p_1111111/fr/liste-des-organismes-autorises-archive-2022">Archive 2022</a>
             <a href="/jcms/p_9999999/fr/liste-des-organismes-autorises-pour-l-evaluation-des-essms">Liste courante</a>
           </html>`,
          { status: 200 },
        ),
      [archive]: () => new Response(FAKE_PDF, { status: 200 }),
      [exact]: () => new Response(FAKE_PDF, { status: 200 }),
    });
    const r = await fetchListeHasPdf({ archiveRoot: root, fetchImpl, validate: validateOk });
    expect(r).not.toBeNull();
    expect(r!.url).toBe(exact);
    expect((await readSources(root)).listeHas.url).toBe(exact);
  });

  it("un validateur qui lève (ex. pdfjs sur du HTML) est traité comme implausible, pas comme une erreur de la fonction", async () => {
    const root = await tmp();
    const nouvelle = 'https://www.has-sante.fr/upload/docs/application/pdf/2027-01/liste_v2.pdf';
    const validateThrows = async (): Promise<boolean> => {
      throw new Error('InvalidPDFException');
    };
    const fetchImpl = router({
      [HAS_LISTE_URL_DEFAUT]: () => new Response('gone', { status: 404 }),
      [HAS_JCMS_PERMALIEN]: () =>
        new Response(
          `<HTML><META http-equiv="Refresh" content="0; URL='../../../../upload/docs/application/pdf/2027-01/liste_v2.pdf'"></HTML>`,
          { status: 200 },
        ),
      [nouvelle]: () => new Response(FAKE_PDF, { status: 200 }),
    });
    const r = await fetchListeHasPdf({ archiveRoot: root, fetchImpl, validate: validateThrows });
    expect(r).toBeNull();
    expect((await readSources(root)).listeHas.url).toBe(HAS_LISTE_URL_DEFAUT);
  });

  it('un second saut (302 doXiti) vers une page HTML soft-404 est écarté même avec un validateur laxiste', async () => {
    const root = await tmp();
    const intermediaire = 'https://www.has-sante.fr/upload/docs/application/pdf/2027-02/redirect.pdf';
    const cibleFinale = 'https://www.has-sante.fr/upload/docs/application/pdf/2027-02/liste_v3.pdf';
    const fetchImpl = router({
      [HAS_LISTE_URL_DEFAUT]: () => new Response('gone', { status: 404 }),
      [HAS_JCMS_PERMALIEN]: () =>
        new Response(
          `<HTML><META http-equiv="Refresh" content="0; URL='../../../../upload/docs/application/pdf/2027-02/redirect.pdf'"></HTML>`,
          { status: 200 },
        ),
      // Premier saut : la cible n'est pas un PDF mais une nouvelle page doXiti :
      [intermediaire]: () =>
        new Response(
          `<HTML><META http-equiv="Refresh" content="0; URL='../../../../upload/docs/application/pdf/2027-02/liste_v3.pdf'"></HTML>`,
          { status: 200 },
        ),
      // Second saut : soft-404, page d'erreur HTML servie avec un statut 200 :
      [cibleFinale]: () => new Response('<html>Document indisponible</html>', { status: 200 }),
    });
    // Validateur laxiste : la protection doit donc venir du re-contrôle des
    // octets magiques après le second saut, pas de validate().
    const r = await fetchListeHasPdf({ archiveRoot: root, fetchImpl, validate: validateOk });
    expect(r).toBeNull();
    expect((await readSources(root)).listeHas.url).toBe(HAS_LISTE_URL_DEFAUT);
  });

  it("un candidat implausible n'est JAMAIS adopté", async () => {
    const root = await tmp();
    const fetchImpl = router({
      [HAS_LISTE_URL_DEFAUT]: () => new Response('gone', { status: 404 }),
      [HAS_JCMS_PERMALIEN]: () =>
        new Response(
          `<HTML><META http-equiv="Refresh" content="0; URL='../../../../upload/docs/autre.pdf'"></HTML>`,
          { status: 200 },
        ),
      'https://www.has-sante.fr/upload/docs/autre.pdf': () => new Response(FAKE_PDF, { status: 200 }),
    });
    const r = await fetchListeHasPdf({ archiveRoot: root, fetchImpl, validate: validateKo });
    expect(r).toBeNull();
    // La source mémorisée reste l'ancienne : pas d'adoption d'un document douteux.
    expect((await readSources(root)).listeHas.url).toBe(HAS_LISTE_URL_DEFAUT);
  });

  it("une URL embarquée plus récente prime sur la config locale plus ancienne", async () => {
    const root = await tmp();
    await writeSources(root, {
      version: 0, // plus ancienne que la version embarquée courante
      listeHas: { url: 'https://exemple.invalid/vieux.pdf', discoveredVia: 'memorisee', updatedAt: '2025-01-01' },
      cofracRrs: { url: COFRAC_RRS_URL_DEFAUT, discoveredVia: 'defaut', updatedAt: '2025-01-01' },
    });
    const sources = await readSources(root);
    // readSources remet les défauts embarqués quand la version stockée est plus ancienne.
    expect(sources.listeHas.url).toBe(HAS_LISTE_URL_DEFAUT);
  });

  it('chaque requête porte un délai maximal (AbortSignal transmis au fetch)', async () => {
    // Réseau défensif : pas de faux timers — un fetchImpl espion
    // vérifie simplement que l'option signal est transmise à chaque appel.
    const root = await tmp();
    const signaux: unknown[] = [];
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      signaux.push(init?.signal);
      return new Response(FAKE_PDF, { status: 200 });
    }) as typeof fetch;
    await fetchListeHasPdf({ archiveRoot: root, fetchImpl, validate: validateOk });
    expect(signaux.length).toBeGreaterThan(0);
    for (const s of signaux) expect(s).toBeInstanceOf(AbortSignal);
  });
});

describe("source-discovery — crochet de test (URL forcée par l'environnement)", () => {
  afterEach(() => {
    delete process.env['OBS_LISTE_HAS_URL'];
    delete process.env['OBS_COFRAC_URL'];
  });

  /** fetch espion : consigne chaque URL demandée et échoue (port fermé simulé). */
  const fetchEchec = (urls: string[]): typeof fetch =>
    (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

  it("liste : l'URL forcée est appliquée et son échec ne déclenche AUCUNE redécouverte (permalien/pivot jamais consultés)", async () => {
    const root = await tmp();
    process.env['OBS_LISTE_HAS_URL'] = 'http://127.0.0.1:9/liste.pdf';
    const urls: string[] = [];
    const r = await fetchListeHasPdf({ archiveRoot: root, fetchImpl: fetchEchec(urls), validate: validateOk });
    expect(r).toBeNull();
    // Une seule requête, sur l'URL forcée : ni permalien jcms ni page pivot.
    expect(urls).toEqual(['http://127.0.0.1:9/liste.pdf']);
  });

  it("cofrac : l'URL forcée est appliquée et son échec ne déclenche AUCUNE redécouverte (pivot jamais consulté)", async () => {
    const root = await tmp();
    process.env['OBS_COFRAC_URL'] = 'http://127.0.0.1:9/rrs.php';
    const urls: string[] = [];
    const r = await fetchCofracRrsHtml({ archiveRoot: root, fetchImpl: fetchEchec(urls), validate: () => true });
    expect(r).toBeNull();
    expect(urls).toEqual(['http://127.0.0.1:9/rrs.php']);
  });
});

describe('source-discovery — relevé COFRAC', () => {
  // Plausibilité minimale pour ces tests : présence d'une ligne 3-XXXX.
  const cofracValidateOk = (html: string): boolean => html.includes('3-0001');

  it('URL mémorisée valide → servie sans changement, aucune écriture', async () => {
    const root = await tmp();
    const fetchImpl = router({
      [COFRAC_RRS_URL_DEFAUT]: () => new Response('<html>3-0001</html>', { status: 200 }),
    });
    const r = await fetchCofracRrsHtml({ archiveRoot: root, fetchImpl, validate: cofracValidateOk });
    expect(r).not.toBeNull();
    expect(r!.urlChanged).toBe(false);
    expect(r!.urlAncienne).toBeNull();
    expect(r!.methode).toBeNull();
    const sources = await readSources(root);
    expect(sources.cofracRrs.url).toBe(COFRAC_RRS_URL_DEFAUT);
  });

  it("URL mémorisée morte → pivot avec un lien parasite avant le vrai lien relatif sans slash → adoption du vrai lien", async () => {
    const root = await tmp();
    const nouvelle = 'https://tools.cofrac.fr/fr/easysearch/rrs2.php';
    const fetchImpl = router({
      [COFRAC_RRS_URL_DEFAUT]: () => new Response('gone', { status: 404 }),
      // href relatif SANS slash initial : éprouve la branche '/fr/easysearch/'.
      [nouvelle]: () => new Response('<html>3-0001</html>', { status: 200 }),
      [COFRAC_PAGE_PIVOT]: () =>
        new Response(
          `<html><link href="/assets/vendor.9BqRRSx3.css"><a href="rrs2.php">Recherche</a></html>`,
          { status: 200 },
        ),
    });
    const r = await fetchCofracRrsHtml({ archiveRoot: root, fetchImpl, validate: cofracValidateOk });
    expect(r).not.toBeNull();
    expect(r!.urlChanged).toBe(true);
    expect(r!.urlAncienne).toBe(COFRAC_RRS_URL_DEFAUT);
    expect(r!.methode).toBe('page-pivot');
    expect(r!.url).toBe(nouvelle);
    const sources = await readSources(root);
    expect(sources.cofracRrs.url).toBe(nouvelle);
    expect(sources.cofracRrs.discoveredVia).toBe('page-pivot');
  });

  it("pivot sans lien pertinent → trou d'observation, source inchangée", async () => {
    const root = await tmp();
    const fetchImpl = router({
      [COFRAC_RRS_URL_DEFAUT]: () => new Response('gone', { status: 404 }),
      [COFRAC_PAGE_PIVOT]: () => new Response('<html><a href="/contact">Contact</a></html>', { status: 200 }),
    });
    const r = await fetchCofracRrsHtml({ archiveRoot: root, fetchImpl, validate: cofracValidateOk });
    expect(r).toBeNull();
    const sources = await readSources(root);
    expect(sources.cofracRrs.url).toBe(COFRAC_RRS_URL_DEFAUT);
  });

  it("URL mémorisée sert une page de maintenance (implausible) ; le pivot retombe sur la MÊME URL → pas d'adoption erronée", async () => {
    const root = await tmp();
    const fetchImpl = router({
      // L'URL mémorisée répond 200 mais avec une page de maintenance, pas un relevé :
      [COFRAC_RRS_URL_DEFAUT]: () => new Response('<html>Site en maintenance</html>', { status: 200 }),
      [COFRAC_PAGE_PIVOT]: () =>
        new Response(`<html><a href="${COFRAC_RRS_URL_DEFAUT}">Recherche</a></html>`, { status: 200 }),
    });
    // validate rend 0 ligne sur la page de maintenance : le candidat identique
    // à l'URL mémorisée doit lui aussi passer par validate() (contrairement au
    // niveau 1 HAS, qui n'exige que %PDF-) — sinon la maintenance serait
    // adoptée comme relevé valide simplement parce que l'URL n'a pas changé.
    const r = await fetchCofracRrsHtml({ archiveRoot: root, fetchImpl, validate: cofracValidateOk });
    expect(r).toBeNull();
    const sources = await readSources(root);
    expect(sources.cofracRrs.url).toBe(COFRAC_RRS_URL_DEFAUT);
  });
});
