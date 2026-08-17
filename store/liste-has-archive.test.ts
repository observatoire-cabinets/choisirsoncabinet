import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureArchive,
  seedEtats,
  readAllEtats,
  writeEtat,
  appendIndex,
  appendJournalSorties,
  latestSha,
  acquireLock,
  releaseLock,
  readCofracReleves,
  writeCofracReleve,
} from './liste-has-archive';
import type { ListeHasEtat } from '../core/liste-has-parse';

const mkEtat = (date: string, sha: string, sirens: string[]): ListeHasEtat => ({
  date_source: date,
  date_releve: date,
  sha256: sha,
  organismes: sirens.map((s) => ({ siren: s, nom: `ORG ${s}`, num: '', dept: '01' })),
});

const tmp = (): Promise<string> => mkdtemp(join(tmpdir(), 'obs-lha-'));

describe('liste-has-archive', () => {
  it('ensureArchive crée la structure complète', async () => {
    const root = await tmp();
    await ensureArchive(root);
    const entries = (await readdir(root)).sort();
    expect(entries).toEqual(expect.arrayContaining(['brut', 'cofrac', 'etats']));
  });

  it("seedEtats verse l'amorce puis ne ré-écrit jamais un état local (ajout seul)", async () => {
    const root = await tmp();
    await ensureArchive(root);
    // Un état local préexistant, différent de l'amorce à la même date.
    await writeEtat(root, mkEtat('2022-10-11', 'sha-local', ['111111111']));
    await seedEtats(root, [
      mkEtat('2022-10-11', 'sha-seed', ['222222222']),
      mkEtat('2023-04-07', 'sha-b', ['333333333']),
    ]);
    const etats = await readAllEtats(root);
    expect(etats.map((e) => e.date_releve)).toEqual(['2022-10-11', '2023-04-07']);
    // L'état local du 2022-10-11 est CONSERVÉ (jamais écrasé par l'amorce).
    expect(etats[0].sha256).toBe('sha-local');
  });

  it('readAllEtats trie par date_releve croissante', async () => {
    const root = await tmp();
    await ensureArchive(root);
    await writeEtat(root, mkEtat('2026-08-13', 'c', ['1']));
    await writeEtat(root, mkEtat('2022-10-11', 'a', ['2']));
    const etats = await readAllEtats(root);
    expect(etats.map((e) => e.date_releve)).toEqual(['2022-10-11', '2026-08-13']);
  });

  it("appendIndex ajoute (jamais d'écrasement) et latestSha lit la dernière empreinte de SA source", async () => {
    const root = await tmp();
    await ensureArchive(root);
    expect(await latestSha(root, 'liste')).toBeNull();
    await appendIndex(root, { horodatage: '2026-08-17_070000', resultat: 'archive', source: 'liste', sha256: 'aaa' });
    await appendIndex(root, { horodatage: '2026-08-17_070100', resultat: 'archive', source: 'cofrac', sha256: 'bbb' });
    await appendIndex(root, { horodatage: '2026-08-18_070000', resultat: 'inchange', source: 'liste', sha256: 'aaa' });
    await appendIndex(root, { horodatage: '2026-08-19_070000', resultat: 'echec', source: 'liste', erreur: 'HTTP 503' });
    // L'index est partagé : chaque source ne voit que ses propres empreintes.
    expect(await latestSha(root, 'liste')).toBe('aaa');
    expect(await latestSha(root, 'cofrac')).toBe('bbb');
    const lines = (await readFile(join(root, 'index.jsonl'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(4);
  });

  it('appendJournalSorties écrit le jsonl ET la version lisible (journal-sorties.md)', async () => {
    const root = await tmp();
    await ensureArchive(root);
    await appendJournalSorties(root, [
      {
        siren: '878950963',
        nom_dernier_connu: 'CABINET OULAD',
        numero_dernier_connu: '3-1972',
        departement: '59',
        dernier_etat_present: '2026-07-16',
        premier_etat_absent: '2026-08-13',
        motif: 'non indiqué par la source',
      },
    ]);
    const jsonl = await readFile(join(root, 'journal-sorties.jsonl'), 'utf8');
    expect(jsonl).toContain('"siren":"878950963"');
    const lisible = await readFile(join(root, 'journal-sorties.md'), 'utf8');
    expect(lisible).toContain(
      '- CABINET OULAD (SIREN 878950963, dép. 59, n° 3-1972) — présent au 2026-07-16, absent au 2026-08-13. Motif non indiqué par la source.',
    );
  });

  it('appendJournalSorties est idempotent : double append des mêmes sorties → une seule ligne', async () => {
    const root = await tmp();
    await ensureArchive(root);
    const sortie = {
      siren: '878950963',
      nom_dernier_connu: 'CABINET OULAD',
      numero_dernier_connu: '3-1972',
      departement: '59',
      dernier_etat_present: '2026-07-16',
      premier_etat_absent: '2026-08-13',
      motif: 'non indiqué par la source',
    };
    await appendJournalSorties(root, [sortie]);
    // Re-détection après une panne entre journal et état : mêmes sorties.
    await appendJournalSorties(root, [{ ...sortie }]);
    const jsonl = (await readFile(join(root, 'journal-sorties.jsonl'), 'utf8')).trim().split('\n');
    expect(jsonl).toHaveLength(1);
    const md = (await readFile(join(root, 'journal-sorties.md'), 'utf8')).trim().split('\n');
    expect(md).toHaveLength(1);
  });

  it('verrou : deuxième acquisition refusée, libération puis reprise possible', async () => {
    const root = await tmp();
    await ensureArchive(root);
    expect(await acquireLock(root, new Date('2026-08-17T06:00:00Z'))).toBe(true);
    expect(await acquireLock(root, new Date('2026-08-17T06:05:00Z'))).toBe(false);
    await releaseLock(root);
    expect(await acquireLock(root, new Date('2026-08-17T06:10:00Z'))).toBe(true);
  });

  it('verrou : 2 acquisitions simultanées → exactement une acquise', async () => {
    const root = await tmp();
    await ensureArchive(root);
    const d = new Date('2026-08-17T06:00:00Z');
    // Course lire-puis-écrire : sans écriture exclusive, les deux liraient
    // « pas de verrou » et écriraient chacune le leur (double acquisition).
    const r = await Promise.all([acquireLock(root, d), acquireLock(root, d)]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });

  it('verrou obsolète (> 2 h) : acquisition forcée', async () => {
    const root = await tmp();
    await ensureArchive(root);
    expect(await acquireLock(root, new Date('2026-08-17T06:00:00Z'))).toBe(true);
    // 3 h plus tard, le verrou d'un processus mort ne bloque plus.
    expect(await acquireLock(root, new Date('2026-08-17T09:00:00Z'))).toBe(true);
  });

  it('relevés COFRAC : écriture datée + relecture triée', async () => {
    const root = await tmp();
    await ensureArchive(root);
    await writeCofracReleve(root, {
      date_releve: '2026-08-17',
      sha256: 'x',
      rows: [{ num: '3-1972', nom: 'CABINET O', date: null, commentaire: null }],
    });
    const releves = await readCofracReleves(root);
    expect(releves).toHaveLength(1);
    expect(releves[0].rows[0].num).toBe('3-1972');
  });
});

describe('robustesse de l’index', () => {
  it("latestSha tolère une ligne d'index corrompue", async () => {
    const root = await tmp();
    await ensureArchive(root);
    await appendIndex(root, { horodatage: '2026-08-17_070000', resultat: 'archive', source: 'liste', sha256: 'aaa' });
    // Ligne poubelle non-JSON (crash mi-écriture) APRÈS l'entrée valide :
    // elle est sautée, l'empreinte précédente reste lisible.
    await appendFile(join(root, 'index.jsonl'), '{"horodatage":"2026-08-18_07', 'utf8');
    expect(await latestSha(root, 'liste')).toBe('aaa');
  });
});
