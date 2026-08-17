import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collecteListeHas, collecteCofrac, relireBruts, SEUIL_PLAUSIBILITE } from './collecte';
import { ensureArchive, readAllEtats, appendIndex } from './liste-has-archive';
import { HAS_JCMS_PERMALIEN } from './source-discovery';

const tmp = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'obs-col-'));
  await ensureArchive(root);
  return root;
};

/** Texte analysable minimal : `n` organismes accrédités, mise en page 2023+. */
const texteListe = (n: number, dateSource: string): string => {
  let t = `Liste des organismes autorisés à évaluer\nActualisée le ${dateSource}\nAuvergne-Rhône-Alpes\n01 - Ain\nNOM DES ORGANISMES NUMÉRO\nD'ACCRÉDITATION ADRESSE POSTALE NUMÉRO SIREN\n`;
  for (let i = 0; i < n; i++) {
    const siren = String(100000000 + i);
    t += `ORGANISME ${i} 3-${1000 + i}\n1 RUE DE TEST\n01000 BOURG\nFrance\n${siren}\n`;
  }
  return t;
};

/** Variante sans AUCUN numéro d'accréditation (déclenche l'alerte > 30 %). */
const texteListeSansNumero = (n: number, dateSource: string): string =>
  texteListe(n, dateSource).replace(/ 3-\d{4}\n/g, '\n');

// `Buffer<ArrayBuffer>` (pas `Buffer` nu) : BodyInit exige un ArrayBuffer sous-jacent.
const okFetch = (body: Buffer<ArrayBuffer> | string, status = 200): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;

const mkOpts = (root: string, pdfText: string) => ({
  archiveRoot: root,
  // Empreinte du CONTENU (pas de la longueur) : deux textes distincts de même
  // longueur ne doivent jamais produire le même « PDF » simulé.
  fetchImpl: okFetch(
    Buffer.from('%PDF-fake-' + createHash('sha256').update(pdfText).digest('hex').slice(0, 12)),
  ),
  extractText: async () => pdfText,
  now: new Date('2026-08-20T07:00:00Z'),
});

describe('collecteListeHas', () => {
  it('premier relevé : brut archivé, état écrit, index « archive », aucun delta', async () => {
    const root = await tmp();
    const r = await collecteListeHas(mkOpts(root, texteListe(70, '20 août 2026')));
    expect(r.resultat).toBe('archive');
    const etats = await readAllEtats(root);
    expect(etats).toHaveLength(1);
    expect(etats[0].date_releve).toBe('2026-08-20');
    expect(etats[0].organismes).toHaveLength(70);
    expect((await readdir(join(root, 'brut'))).length).toBe(1);
    expect(r.sorties).toEqual([]);
  });

  it('document inchangé (même empreinte) : observation consignée, pas de doublon', async () => {
    const root = await tmp();
    await collecteListeHas(mkOpts(root, texteListe(70, '20 août 2026')));
    const r2 = await collecteListeHas({
      ...mkOpts(root, texteListe(70, '20 août 2026')),
      now: new Date('2026-08-21T07:00:00Z'),
    });
    expect(r2.resultat).toBe('inchange');
    expect((await readdir(join(root, 'brut'))).length).toBe(1);
    const index = (await readFile(join(root, 'index.jsonl'), 'utf8')).trim().split('\n');
    expect(index.length).toBe(2);
  });

  it('sorties : SIREN présent avant, absent après → journalisées SANS motif', async () => {
    const root = await tmp();
    // État précédent : 70 organismes (100000000..100000069).
    await collecteListeHas(mkOpts(root, texteListe(70, '20 août 2026')));
    // Nouvel état : 69 organismes (100000001..100000069) — 100000000 sorti.
    let t = texteListe(70, '21 août 2026');
    t = t.replace(`ORGANISME 0 3-1000\n1 RUE DE TEST\n01000 BOURG\nFrance\n100000000\n`, '');
    const r = await collecteListeHas({ ...mkOpts(root, t), now: new Date('2026-08-21T07:00:00Z') });
    expect(r.resultat).toBe('archive');
    expect(r.sorties).toHaveLength(1);
    expect(r.sorties[0].siren).toBe('100000000');
    const journal = await readFile(join(root, 'journal-sorties.jsonl'), 'utf8');
    expect(journal).toContain('"motif":"non indiqué par la source"');
  });

  it(`seuil de plausibilité : moins de ${SEUIL_PLAUSIBILITE} organismes analysés → delta refusé, état non écrit, brut conservé`, async () => {
    const root = await tmp();
    await collecteListeHas(mkOpts(root, texteListe(70, '20 août 2026')));
    const r = await collecteListeHas({
      ...mkOpts(root, texteListe(3, '21 août 2026')), // analyseur « cassé »
      now: new Date('2026-08-21T07:00:00Z'),
    });
    expect(r.resultat).toBe('delta_refuse');
    // Aucune fausse sortie, pas de nouvel état, mais le brut EST archivé.
    expect(r.sorties).toEqual([]);
    expect(await readAllEtats(root)).toHaveLength(1);
    expect((await readdir(join(root, 'brut'))).length).toBe(2);
  });

  it('échec réseau : trou d’observation journalisé, résultat « echec », rien d’autre ne bouge', async () => {
    const root = await tmp();
    const r = await collecteListeHas({
      archiveRoot: root,
      fetchImpl: (async () => {
        throw new Error('réseau coupé');
      }) as typeof fetch,
      extractText: async () => '',
      now: new Date('2026-08-20T07:00:00Z'),
    });
    expect(r.resultat).toBe('echec');
    const index = await readFile(join(root, 'index.jsonl'), 'utf8');
    expect(index).toContain('"resultat":"echec"');
    expect(index).toContain('observation');
  });

  it('une collecte déjà faite aujourd’hui (index du jour, MÊME source) → « deja_fait », aucun réseau', async () => {
    const root = await tmp();
    await appendIndex(root, { horodatage: '2026-08-20_060000', resultat: 'archive', source: 'liste', sha256: 'x' });
    let called = false;
    const r = await collecteListeHas({
      archiveRoot: root,
      fetchImpl: (async () => {
        called = true;
        return new Response('x');
      }) as typeof fetch,
      extractText: async () => '',
      now: new Date('2026-08-20T09:00:00Z'),
    });
    expect(r.resultat).toBe('deja_fait');
    expect(called).toBe(false);
  });

  it('index partagé : une collecte COFRAC intercalée ne casse pas la dédup de la liste', async () => {
    const root = await tmp();
    // Jour 1 : liste puis COFRAC (l'ordre de runCollecte).
    await collecteListeHas(mkOpts(root, texteListe(70, '20 août 2026')));
    await collecteCofrac({
      archiveRoot: root,
      fetchImpl: okFetch(
        '<table><tr><td>3-1972</td><td>CABINET TEST</td><td>16/01/2025</td><td>retrait</td></tr></table>',
      ),
      now: new Date('2026-08-20T07:05:00Z'),
    });
    // Jour 2 : MÊME PDF de liste → 'inchange' (l'empreinte du HTML COFRAC,
    // pourtant plus récente dans l'index, n'interfère pas : filtrage par source).
    const r = await collecteListeHas({
      ...mkOpts(root, texteListe(70, '20 août 2026')),
      now: new Date('2026-08-21T07:00:00Z'),
    });
    expect(r.resultat).toBe('inchange');
  });

  it('liste en échec le matin + COFRAC archivé → la liste réessaie le MÊME jour', async () => {
    const root = await tmp();
    await appendIndex(root, { horodatage: '2026-08-20_060000', resultat: 'echec', source: 'liste' });
    await appendIndex(root, { horodatage: '2026-08-20_060100', resultat: 'archive', source: 'cofrac', sha256: 'html' });
    // Le succès COFRAC du matin ne masque pas la liste : la collecte repart.
    const r = await collecteListeHas(mkOpts(root, texteListe(70, '20 août 2026')));
    expect(r.resultat).toBe('archive');
  });

  it("part sans numéro > 30 % : alerte consignée dans l'index, la collecte aboutit quand même", async () => {
    const root = await tmp();
    const r = await collecteListeHas(mkOpts(root, texteListeSansNumero(70, '20 août 2026')));
    // On alerte, on ne bloque RIEN : état écrit, résultat « archive ».
    expect(r.resultat).toBe('archive');
    expect(await readAllEtats(root)).toHaveLength(1);
    const index = await readFile(join(root, 'index.jsonl'), 'utf8');
    expect(index).toContain('"resultat":"alerte_sans_numero"');
    expect(index).toContain('"sans":70');
    expect(index).toContain('"total":70');
  });

  it("changement d'URL adopté : entrée source_changee consignée, collecte aboutie", async () => {
    const root = await tmp();
    const texte = texteListe(70, '20 août 2026');
    const nouvelle = 'https://www.has-sante.fr/upload/docs/application/pdf/2027-01/liste_v2.pdf';
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const u = String(url);
      // Nouvelle URL : le PDF vit là désormais.
      if (u === nouvelle) return new Response(Buffer.from('%PDF-fake-v2'), { status: 200 });
      // Permalien jcms : page doXiti portant le META Refresh vers la nouvelle URL.
      if (u === HAS_JCMS_PERMALIEN) {
        return new Response(
          `<HTML><META http-equiv="Refresh" content="0; URL='../../../../upload/docs/application/pdf/2027-01/liste_v2.pdf'"></HTML>`,
          { status: 200 },
        );
      }
      // URL mémorisée (et tout le reste) : morte.
      return new Response('gone', { status: 404 });
    }) as typeof fetch;
    const r = await collecteListeHas({
      archiveRoot: root,
      fetchImpl,
      extractText: async () => texte,
      now: new Date('2026-08-20T07:00:00Z'),
    });
    expect(r.resultat).toBe('archive');
    const index = await readFile(join(root, 'index.jsonl'), 'utf8');
    expect(index).toContain('"resultat":"source_changee"');
    expect(index).toContain('"urlAncienne":');
    expect(index).toContain(`"urlNouvelle":"${nouvelle}"`);
    expect(index).toContain('"methode":"permalien-jcms"');
  });

  it("analyse qui lève après archivage : consignée, brut conservé, relecture possible", async () => {
    const root = await tmp();
    const r = await collecteListeHas({
      archiveRoot: root,
      fetchImpl: okFetch(Buffer.from('%PDF-fake-corrompu')),
      extractText: async () => {
        throw new Error('extraction impossible');
      },
      now: new Date('2026-08-20T07:00:00Z'),
    });
    // Le brut est archivé, l'index dit la vérité, rien ne jette.
    expect(r.resultat).toBe('archive');
    expect(r.sorties).toEqual([]);
    expect(await readAllEtats(root)).toHaveLength(0);
    expect((await readdir(join(root, 'brut'))).length).toBe(1);
    const index = await readFile(join(root, 'index.jsonl'), 'utf8');
    expect(index).toContain('"resultat":"analyse_echec"');
    // Même jour : l'entrée 'archive' du matin suffit, aucun réseau.
    let called = false;
    const r2 = await collecteListeHas({
      archiveRoot: root,
      fetchImpl: (async () => {
        called = true;
        return new Response('x');
      }) as typeof fetch,
      extractText: async () => '',
      now: new Date('2026-08-20T09:00:00Z'),
    });
    expect(r2.resultat).toBe('deja_fait');
    expect(called).toBe(false);
    // Correction livrée : la relecture du brut fait apparaître l'état.
    const rl = await relireBruts({
      archiveRoot: root,
      extractText: async () => texteListe(70, '20 août 2026'),
    });
    expect(rl).toEqual({ relus: 1, remplaces: 1, refuses: 0 });
    expect((await readAllEtats(root))[0].organismes).toHaveLength(70);
  });

  it("panne d'écriture locale (index remplacé par un dossier) : « echec » rendu, jamais d'exception", async () => {
    const root = await tmp();
    // Simule un index inécrivable (verrou, corruption : le chemin est occupé par un dossier).
    await mkdir(join(root, 'index.jsonl'));
    const r = await collecteListeHas(mkOpts(root, texteListe(70, '20 août 2026')));
    expect(r.resultat).toBe('echec');
    expect(r.sorties).toEqual([]);
  });
});

describe('relireBruts', () => {
  it("un brut ré-analysé après « correction » remplace l'état de même date_releve", async () => {
    const root = await tmp();
    // Collecte initiale : l'« analyseur » du jour ne voit que 65 organismes.
    await collecteListeHas(mkOpts(root, texteListe(65, '20 août 2026')));
    expect((await readAllEtats(root))[0].organismes).toHaveLength(65);
    // Correction livrée (mise à jour du logiciel) : la re-analyse du MÊME brut
    // rend 70 organismes — l'état du 2026-08-20 est remplacé, pas dupliqué.
    const r = await relireBruts({
      archiveRoot: root,
      extractText: async () => texteListe(70, '20 août 2026'),
    });
    expect(r).toEqual({ relus: 1, remplaces: 1, refuses: 0 });
    const etats = await readAllEtats(root);
    expect(etats).toHaveLength(1);
    expect(etats[0].date_releve).toBe('2026-08-20');
    expect(etats[0].organismes).toHaveLength(70);
  });

  it('re-analyse sous le seuil de plausibilité : état existant CONSERVÉ, refus compté et consigné', async () => {
    const root = await tmp();
    await collecteListeHas(mkOpts(root, texteListe(65, '20 août 2026')));
    // Analyseur en régression : la re-analyse ne rend que 3 organismes.
    const r = await relireBruts({
      archiveRoot: root,
      extractText: async () => texteListe(3, '20 août 2026'),
      now: new Date('2026-08-22T07:00:00Z'),
    });
    expect(r).toEqual({ relus: 1, remplaces: 0, refuses: 1 });
    const etats = await readAllEtats(root);
    expect(etats).toHaveLength(1);
    expect(etats[0].organismes).toHaveLength(65);
    const index = await readFile(join(root, 'index.jsonl'), 'utf8');
    expect(index).toContain('"resultat":"relecture"');
    expect(index).toContain('"refuses":1');
  });

  it('brut illisible (répertoire homonyme) : pas d’exception, les autres bruts rejoués', async () => {
    const root = await tmp();
    await collecteListeHas({
      ...mkOpts(root, texteListe(65, '21 août 2026')),
      now: new Date('2026-08-21T07:00:00Z'),
    });
    // Un RÉPERTOIRE porte un nom de brut : readFile échoue, la boucle continue.
    await mkdir(join(root, 'brut', '2026-08-20_070000_liste-has.pdf'));
    const r = await relireBruts({
      archiveRoot: root,
      extractText: async () => texteListe(70, '21 août 2026'),
    });
    expect(r).toEqual({ relus: 2, remplaces: 1, refuses: 0 });
    const etats = await readAllEtats(root);
    expect(etats).toHaveLength(1);
    expect(etats[0].organismes).toHaveLength(70);
  });
});

describe('collecteCofrac', () => {
  it('relevé RRS : brut archivé + extraction filtrée section 3', async () => {
    const root = await tmp();
    const html = `<table><tr><td>3-1972</td><td>CABINET TEST</td><td>16/01/2025</td><td>retrait</td></tr>
      <tr><td>8-1857</td><td>LABO</td><td>24/12/2024</td><td></td></tr></table>`;
    const r = await collecteCofrac({
      archiveRoot: root,
      fetchImpl: okFetch(html),
      now: new Date('2026-08-20T07:00:00Z'),
    });
    expect(r.resultat).toBe('archive');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].num).toBe('3-1972');
  });

  it('page méconnaissable → échec propre, aucune concordance possible', async () => {
    const root = await tmp();
    const r = await collecteCofrac({
      archiveRoot: root,
      fetchImpl: okFetch('<html>maintenance</html>'),
      now: new Date('2026-08-20T07:00:00Z'),
    });
    expect(r.resultat).toBe('echec');
    expect(r.rows).toEqual([]);
  });

  it('deuxième appel le même jour → « deja_fait », aucun réseau', async () => {
    const root = await tmp();
    const html =
      '<table><tr><td>3-1972</td><td>CABINET TEST</td><td>16/01/2025</td><td>retrait</td></tr></table>';
    await collecteCofrac({
      archiveRoot: root,
      fetchImpl: okFetch(html),
      now: new Date('2026-08-20T07:00:00Z'),
    });
    let called = false;
    const r = await collecteCofrac({
      archiveRoot: root,
      fetchImpl: (async () => {
        called = true;
        return new Response('x');
      }) as typeof fetch,
      now: new Date('2026-08-20T08:00:00Z'),
    });
    expect(r.resultat).toBe('deja_fait');
    expect(called).toBe(false);
  });

  it('appel un autre jour, HTML identique → « inchange », un seul brut', async () => {
    const root = await tmp();
    const html =
      '<table><tr><td>3-1972</td><td>CABINET TEST</td><td>16/01/2025</td><td>retrait</td></tr></table>';
    await collecteCofrac({
      archiveRoot: root,
      fetchImpl: okFetch(html),
      now: new Date('2026-08-20T07:00:00Z'),
    });
    const r = await collecteCofrac({
      archiveRoot: root,
      fetchImpl: okFetch(html),
      now: new Date('2026-08-21T07:00:00Z'),
    });
    expect(r.resultat).toBe('inchange');
    expect(r.rows).toEqual([]);
    expect((await readdir(join(root, 'brut'))).length).toBe(1);
    const index = await readFile(join(root, 'index.jsonl'), 'utf8');
    expect(index).toContain('"resultat":"inchange"');
  });

  it("panne d'écriture locale (index remplacé par un dossier) : « echec » rendu, jamais d'exception", async () => {
    const root = await tmp();
    await mkdir(join(root, 'index.jsonl'));
    const r = await collecteCofrac({
      archiveRoot: root,
      fetchImpl: okFetch(
        '<table><tr><td>3-1972</td><td>CABINET TEST</td><td>16/01/2025</td><td>retrait</td></tr></table>',
      ),
      now: new Date('2026-08-20T07:00:00Z'),
    });
    expect(r.resultat).toBe('echec');
    expect(r.rows).toEqual([]);
  });
});
