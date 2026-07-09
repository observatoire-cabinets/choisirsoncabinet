/**
 * Tests de rafraîchissement depuis les sources publiques + archivage daté.
 *
 * AUCUN RÉSEAU : `fetchImpl` est mocké (routeur URL → Response) et les décodeurs
 * parquet sont injectés (le décodage binaire hyparquet = code lib, hors périmètre
 * de ce test unitaire ; les MAPPERS purs, eux, sont exercés sur des lignes
 * fixture). Archivage + swap testés sur des répertoires temporaires (os.tmpdir),
 * y compris le chemin d'échec (un téléchargement qui jette en cours de route ne
 * doit PAS toucher currentDir ni créer d'archive).
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rename, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  parseFinessStockLine,
  parseFinessSnapshotDate,
  buildFinessEjMapping,
} from '../core/finess-parse';
import { buildFinessCapacity, parseEquipementLine } from '../core/finess-capacity-parse';
import { FINESS_DATASET_API, FINESS_CAPACITY_DATASET_API } from '../core/finess-resolve';
import {
  essmsRowFromRaw,
  evalHistoryRowFromRaw,
  parseBaseDocJsonlLine,
  toUtcDateString,
  HAS_ESSMS_URL,
  HAS_EVAL_URL,
  HAS_BASE_DOC_URL,
  type RawParquetRow,
} from '../core/has-parse';
import { refreshDataset, writeDatasetTwoPhase, type DatasetWriteIo } from './refresh';
import { loadDataset } from './load';
import type { Dataset } from './types';

// ─── Fixtures FINESS établissements (CSV latin-1, ';'-délimité) ──────────────────
// 10 lignes structureet. Univers NATIONAL : geos 7,8,9 ne sont PAS dans la cohorte
// HAS mais comptent dans ej_size (invariant national). geo court "12345" → pad9.
function ejCsv(headerDate: string): string {
  return [
    `finess;etalab;10;${headerDate}`,
    'structureet;000000001;000000100;NOMé A;;;', // EJ100
    'structureet;000000002;000000100;NOM B;;;', // EJ100
    'structureet;000000007;000000100;NAT ONLY;;;', // EJ100 (national-only)
    'structureet;000000003;000000200;NOM C;;;', // EJ200 (mono)
    'structureet;000000004;000000300;NOM D;;;', // EJ300
    'structureet;000000005;000000300;NOM E;;;', // EJ300
    'structureet;000000006;000000400;NOM F;;;', // EJ400
    'structureet;000000008;000000400;NAT ONLY;;;', // EJ400 (national-only)
    'structureet;000000009;000000400;NAT ONLY;;;', // EJ400 (national-only)
    'structureet;12345;000000500;SHORT GEO;;;', // pad9 → 000012345, EJ500
  ].join('\n');
}

// ─── Fixtures FINESS capacité (équipements, ';'-délimité) ────────────────────────
// idx: 0 equipementsocial,1 geo,...,9 capinstot,...,15 indsupinst.
function equip(geo: string, cap: string, indsup: string): string {
  const f = new Array(16).fill('');
  f[0] = 'equipementsocial';
  f[1] = geo;
  f[9] = cap;
  f[15] = indsup;
  return f.join(';');
}
function capCsv(headerDate: string): string {
  return [
    `finess;etalab;5;${headerDate}`,
    equip('000000001', '80', ''), // geo1 +80
    equip('000000001', '5', ''), // geo1 +5 → 85
    equip('000000002', '40', 'O'), // geo2 SUPPRIMÉ → exclu
    equip('000000003', '30', ''), // geo3 30
    equip('000000999', '100', ''), // national-only → prune
  ].join('\n');
}

// ─── Fixtures base_document_essms (JSONL) ────────────────────────────────────────
function baseDocJsonl(): string {
  return [
    JSON.stringify({
      finess_geo: '000000001',
      identification: { raison_sociale_et: 'EHPAD LES LILAS' },
      coordonnees: [
        {
          adresse_postale_ligne_1: '12 RUE DES FLEURS',
          adresse_postale_ligne_2: 'BATIMENT A',
          code_postal: '01000',
          libelle_commune: 'BOURG',
        },
      ],
    }),
    JSON.stringify({
      finess_geo: '000000003',
      identification: { raison_sociale_et: 'FOYER C' },
      coordonnees: [{ code_postal: '01440', libelle_commune: 'VIRIAT' }],
    }),
    JSON.stringify({
      finess_geo: '000000999', // national-only → pruné
      identification: { raison_sociale_et: 'NAT ONLY' },
      coordonnees: [{ code_postal: '75000', libelle_commune: 'PARIS' }],
    }),
  ].join('\n');
}

// ─── Fixtures parquet (objets bruts, comme les rend hyparquet) ───────────────────
const essmsRaw: RawParquetRow[] = [
  mkEssms('000000001', 82.5, 'CAB A'),
  mkEssms('000000002', 70.0, 'CAB A'),
  mkEssms('000000003', 66.0, 'CAB B'),
  mkEssms('000000004', 90.0, 'CAB B'),
  mkEssms('000000005', 55.0, 'CAB A'),
  mkEssms('000000006', 61.0, 'CAB B'),
  mkEssms('12345', 77.0, 'CAB A'), // geo court → cohorte 000012345
];
function mkEssms(geo: string, moy: number, cabinet: string): RawParquetRow {
  return {
    finess_geo: geo,
    moy_objectifs_100: moy,
    oe_nom: cabinet,
    raison_sociale: `RS ${geo}`,
    region_libelle: 'Auvergne-Rhône-Alpes',
    essms_statut_juridique: 'Public',
    essms_categ_finess_libelle: 'EHPAD',
    essms_categ_finess_code: '500',
    departement_code: '01',
    eval_date_cloture_tech: new Date(Date.UTC(2024, 4, 12)),
  };
}
const evalRaw: RawParquetRow[] = [
  { eval_code: 'E1', oe_nom: 'CAB A', eval_date_cloture_tech: new Date(Date.UTC(2024, 4, 12)), region_libelle: 'Auvergne-Rhône-Alpes' },
  { eval_code: 'E2', oe_nom: 'CAB B', eval_date_cloture_tech: new Date(Date.UTC(2023, 1, 3)), region_libelle: 'Bretagne' },
];

// ─── Routeur fetch mocké ─────────────────────────────────────────────────────────
type Routes = Record<string, () => Response | Promise<Response>>;
function makeFetch(routes: Routes): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const h = routes[url];
    if (!h) throw new Error(`fetch inattendu: ${url}`);
    return h();
  }) as unknown as typeof fetch;
}
function stdRoutes(opts: { ejDate: string; capDate: string; throwOn?: string }): Routes {
  const guard = (u: string, r: () => Response): (() => Response) => () => {
    if (opts.throwOn === u) throw new Error(`réseau simulé KO: ${u}`);
    return r();
  };
  return {
    [FINESS_DATASET_API]: guard(FINESS_DATASET_API, () =>
      Response.json({ resources: [{ title: 'FINESS Établissements au 15/06/2026', format: 'csv', url: 'https://fake/ej.csv' }] }),
    ),
    'https://fake/ej.csv': guard('https://fake/ej.csv', () => new Response(Buffer.from(ejCsv(opts.ejDate), 'latin1'))),
    [FINESS_CAPACITY_DATASET_API]: guard(FINESS_CAPACITY_DATASET_API, () =>
      Response.json({ resources: [{ title: 'FINESS équipements sociaux et médico-sociaux au 15/06/2026', format: 'csv', url: 'https://fake/cap.csv' }] }),
    ),
    'https://fake/cap.csv': guard('https://fake/cap.csv', () => new Response(Buffer.from(capCsv(opts.capDate), 'latin1'))),
    [HAS_ESSMS_URL]: guard(HAS_ESSMS_URL, () => new Response(new Uint8Array([0]))),
    [HAS_EVAL_URL]: guard(HAS_EVAL_URL, () => new Response(new Uint8Array([0]))),
    [HAS_BASE_DOC_URL]: guard(HAS_BASE_DOC_URL, () => new Response(baseDocJsonl())),
  };
}
const injectedParsers = {
  parseEssmsParquet: async () => essmsRaw,
  parseEvalParquet: async () => evalRaw,
};

// ─── Dataset "courant" fixture (prev) écrit dans currentDir ───────────────────────
const PREV: Dataset = {
  meta: {
    builtAt: '2026-05-01T00:00:00.000Z',
    hasSyncedAt: '2026-05-01T00:00:00.000Z',
    finessSnapshotMax: '2026-05-12',
    sources: [{ name: 'src', url: 'u', license: 'Licence Ouverte 2.0', retrievedAt: '2026-05-01T00:00:00.000Z' }],
  },
  essms: [
    { finessGeo: '000000001', score: 50, cabinet: 'OLD CAB', raisonSociale: 'OLD', region: 'R', statut: 'S', categ: 'C', categCode: 'CC', departement: '01', evalDate: '2024-01-01', grade: null, chapters: [null, null, null], imperatives: [], ciEvaluated: null, ciMet: null, ciAbove35: null },
  ],
  ejSnapshots: [
    { snapshotDate: '2021-12-31', finessGeo: '000000001', ejSize: 1 },
    { snapshotDate: '2024-12-31', finessGeo: '000000001', ejSize: 2 },
    { snapshotDate: '2026-05-12', finessGeo: '000000001', ejSize: 2 },
  ],
  capacitySnapshots: [{ snapshotDate: '2026-05-12', finessGeo: '000000001', capacityInstalled: 70 }],
  baseDoc: [{ finessGeo: '000000001', officialLabel: 'OLD LABEL', addressLine1: null, addressLine2: null, postalCode: null, commune: null }],
  evalHistory: [{ evalCode: 'OLD1', cabinet: 'OLD CAB', dateCloture: '2024-01-01', region: 'R' }],
};

async function writePrev(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'meta.json'), JSON.stringify(PREV.meta));
  await writeFile(join(dir, 'essms.json'), JSON.stringify(PREV.essms));
  await writeFile(join(dir, 'ej-snapshots.json'), JSON.stringify(PREV.ejSnapshots));
  await writeFile(join(dir, 'capacity-snapshots.json'), JSON.stringify(PREV.capacitySnapshots));
  await writeFile(join(dir, 'base-doc.json'), JSON.stringify(PREV.baseDoc));
  await writeFile(join(dir, 'eval-history.json'), JSON.stringify(PREV.evalHistory));
}
async function snapshotDir(dir: string): Promise<Record<string, string>> {
  const names = await readdir(dir);
  const out: Record<string, string> = {};
  for (const n of names) out[n] = await readFile(join(dir, n), 'utf8');
  return out;
}
async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
async function mkTmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'refresh-'));
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('finess-parse (copie core)', () => {
  it('pad9 le geo et compte ej_size sur l’univers NATIONAL du fichier', () => {
    const parsed = buildFinessEjMapping(ejCsv('2026-06-15').split('\n'));
    expect(parsed.snapshotDate?.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    const byGeo = Object.fromEntries(parsed.rows.map((r) => [r.finessGeo, r.ejSize]));
    expect(byGeo['000000001']).toBe(3); // EJ100 : geos 1,2,7 (dont national-only 7)
    expect(byGeo['000000003']).toBe(1); // EJ200 mono
    expect(byGeo['000000006']).toBe(3); // EJ400 : geos 6,8,9
    expect(byGeo['000012345']).toBe(1); // geo court paddé
    expect(parsed.rows).toHaveLength(10);
  });
  it('parseFinessStockLine ignore l’en-tête et les lignes non-structureet', () => {
    expect(parseFinessStockLine('finess;etalab;10;2026-06-15')).toBeNull();
    expect(parseFinessSnapshotDate('finess;etalab;10;2026-06-15')?.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });
});

describe('finess-capacity-parse (copie core)', () => {
  it('somme capinstot par geo en EXCLUANT les installations supprimées (indsupinst=O)', () => {
    const parsed = buildFinessCapacity(capCsv('2026-06-15').split('\n'));
    const byGeo = Object.fromEntries(parsed.rows.map((r) => [r.finessGeo, r.capacityInstalled]));
    expect(byGeo['000000001']).toBe(85); // 80 + 5
    expect(byGeo['000000002']).toBeUndefined(); // seule ligne supprimée → absent
    expect(byGeo['000000003']).toBe(30);
    expect(parsed.snapshotDate?.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });
  it('parseEquipementLine marque suppressed quand indsupinst=O', () => {
    expect(parseEquipementLine(equip('000000002', '40', 'O'))?.suppressed).toBe(true);
    expect(parseEquipementLine(equip('000000002', '40', ''))?.suppressed).toBe(false);
  });
});

describe('has-parse (mappers purs)', () => {
  it('essmsRowFromRaw reproduit les casts/COALESCE de l’export SQL', () => {
    const r = essmsRowFromRaw(mkEssms('000000001', 82.5, 'CAB A'));
    expect(r).toEqual({
      finessGeo: '000000001',
      score: 82.5,
      cabinet: 'CAB A',
      raisonSociale: 'RS 000000001',
      region: 'Auvergne-Rhône-Alpes',
      statut: 'Public',
      categ: 'EHPAD',
      categCode: '500',
      departement: '01',
      evalDate: '2024-05-12',
      grade: null,
      chapters: [null, null, null],
      imperatives: [],
      ciEvaluated: null,
      ciMet: null,
      ciAbove35: null,
    });
  });
  it('score null quand moy_objectifs_100 absent ; COALESCE → "" pour region/statut/categ', () => {
    const r = essmsRowFromRaw({ finess_geo: '000000009' });
    expect(r.score).toBeNull();
    expect(r.region).toBe('');
    expect(r.statut).toBe('');
    expect(r.categ).toBe('');
    expect(r.cabinet).toBeNull(); // oe_nom : PAS de coalesce
    expect(r.evalDate).toBeNull();
  });
  it('evalHistoryRowFromRaw extrait code/cabinet/date UTC/région', () => {
    expect(evalHistoryRowFromRaw(evalRaw[1])).toEqual({
      evalCode: 'E2',
      cabinet: 'CAB B',
      dateCloture: '2023-02-03',
      region: 'Bretagne',
    });
  });
  it('parseBaseDocJsonlLine extrait le nom officiel + adresse coordonnees[0]', () => {
    const line = JSON.stringify({
      finess_geo: '000000001',
      identification: { raison_sociale_et: 'EHPAD LES LILAS' },
      coordonnees: [{ adresse_postale_ligne_1: '12 RUE', adresse_postale_ligne_2: 'BAT A', code_postal: '01000', libelle_commune: 'BOURG' }],
    });
    expect(parseBaseDocJsonlLine(line)).toEqual({
      finessGeo: '000000001',
      officialLabel: 'EHPAD LES LILAS',
      addressLine1: '12 RUE',
      addressLine2: 'BAT A',
      postalCode: '01000',
      commune: 'BOURG',
    });
  });
  it('parseBaseDocJsonlLine renvoie null sur JSON malformé ou finess_geo manquant', () => {
    expect(parseBaseDocJsonlLine('{ pas du json')).toBeNull();
    expect(parseBaseDocJsonlLine(JSON.stringify({ identification: {} }))).toBeNull();
    expect(parseBaseDocJsonlLine('   ')).toBeNull();
  });
  it('toUtcDateString formate en YYYY-MM-DD UTC (mirroir to_char ::date)', () => {
    expect(toUtcDateString(new Date(Date.UTC(2026, 5, 15)))).toBe('2026-06-15');
    expect(toUtcDateString(null)).toBeNull();
  });
});

describe('refreshDataset — reconstruction + archivage + swap', () => {
  it('reconstruit les 6 fichiers, fusionne l’historique EJ et archive l’ancien (source FINESS plus fraîche)', async () => {
    const root = await mkTmp();
    try {
      const currentDir = join(root, 'current');
      const archiveRoot = join(root, 'archives');
      await writePrev(currentDir);

      const res = await refreshDataset({
        currentDir,
        archiveRoot,
        fetchImpl: makeFetch(stdRoutes({ ejDate: '2026-06-15', capDate: '2026-06-15' })),
        ...injectedParsers,
        now: new Date(Date.UTC(2026, 6, 5, 9, 0, 0)),
      });

      // Fraîcheur : nouvelle date > embarquée → snapshot ajouté, pas de warning.
      expect(res.finessFreshness.isNewer).toBe(true);
      expect(res.finessFreshness.resolvedDate).toBe('2026-06-15');
      expect(res.finessFreshness.warning).toBeNull();

      const ds = res.dataset;
      // essms/eval/base-doc REMPLACÉS par le frais (cohorte).
      expect(ds.essms).toHaveLength(7);
      expect(ds.essms.find((e) => e.finessGeo === '12345')?.score).toBe(77);
      expect(ds.evalHistory.map((e) => e.evalCode).sort()).toEqual(['E1', 'E2']);
      expect(ds.baseDoc.map((b) => b.finessGeo).sort()).toEqual(['000000001', '000000003']); // 999 pruné
      expect(ds.baseDoc.find((b) => b.finessGeo === '000000001')?.addressLine1).toBe('12 RUE DES FLEURS');

      // EJ : historique conservé + snapshot frais ajouté (dates < frais conservées).
      const ejDates = [...new Set(ds.ejSnapshots.map((s) => s.snapshotDate))].sort();
      expect(ejDates).toEqual(['2021-12-31', '2024-12-31', '2026-05-12', '2026-06-15']);
      const freshEj = ds.ejSnapshots.filter((s) => s.snapshotDate === '2026-06-15');
      expect(freshEj).toHaveLength(7); // cohorte, geos national-only 7/8/9 prunés
      expect(freshEj.find((s) => s.finessGeo === '000000001')?.ejSize).toBe(3); // invariant national
      expect(freshEj.some((s) => s.finessGeo === '000000007')).toBe(false);
      expect(ds.meta.finessSnapshotMax).toBe('2026-06-15');

      // Capacité : idem — 2026-05-12 conservé + frais.
      const capDates = [...new Set(ds.capacitySnapshots.map((s) => s.snapshotDate))].sort();
      expect(capDates).toEqual(['2026-05-12', '2026-06-15']);
      expect(ds.capacitySnapshots.find((s) => s.snapshotDate === '2026-06-15' && s.finessGeo === '000000001')?.capacityInstalled).toBe(85);

      // meta.sources : attributions conservées, retrievedAt HAS = maintenant.
      expect(ds.meta.sources).toHaveLength(4);
      expect(ds.meta.hasSyncedAt).toBe('2026-07-05T09:00:00.000Z');

      // Archive : ancien dataset copié, intact.
      expect(res.archivedPrevious).not.toBeNull();
      const archMeta = JSON.parse(await readFile(join(res.archivedPrevious!, 'meta.json'), 'utf8'));
      expect(archMeta.finessSnapshotMax).toBe('2026-05-12');

      // currentDir rechargeable et à jour.
      const reloaded = await loadDataset(currentDir);
      expect(reloaded.meta.finessSnapshotMax).toBe('2026-06-15');
      expect(reloaded.essms).toHaveLength(7);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('contrôle de fraîcheur : date FINESS <= embarquée → snapshot conservé (pas de doublon) + warning', async () => {
    const root = await mkTmp();
    try {
      const currentDir = join(root, 'current');
      const archiveRoot = join(root, 'archives');
      await writePrev(currentDir);

      const res = await refreshDataset({
        currentDir,
        archiveRoot,
        fetchImpl: makeFetch(stdRoutes({ ejDate: '2026-05-12', capDate: '2026-05-12' })), // == embarquée
        ...injectedParsers,
        now: new Date(Date.UTC(2026, 6, 5)),
      });

      expect(res.finessFreshness.isNewer).toBe(false);
      expect(res.finessFreshness.warning).toMatch(/conserv/i);
      // Pas de nouvelle date EJ.
      const ejDates = [...new Set(res.dataset.ejSnapshots.map((s) => s.snapshotDate))].sort();
      expect(ejDates).toEqual(['2021-12-31', '2024-12-31', '2026-05-12']);
      expect(res.dataset.meta.finessSnapshotMax).toBe('2026-05-12');
      // Mais HAS (essms/eval/base-doc) bien rafraîchis.
      expect(res.dataset.essms).toHaveLength(7);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('CHEMIN D’ÉCHEC : un téléchargement qui jette laisse currentDir INTACT et ne crée aucune archive', async () => {
    const root = await mkTmp();
    try {
      const currentDir = join(root, 'current');
      const archiveRoot = join(root, 'archives');
      await writePrev(currentDir);
      const before = await snapshotDir(currentDir);

      await expect(
        refreshDataset({
          currentDir,
          archiveRoot,
          fetchImpl: makeFetch(stdRoutes({ ejDate: '2026-06-15', capDate: '2026-06-15', throwOn: HAS_EVAL_URL })),
          ...injectedParsers,
          now: new Date(Date.UTC(2026, 6, 5)),
        }),
      ).rejects.toThrow(/réseau simulé KO/);

      const after = await snapshotDir(currentDir);
      expect(after).toEqual(before); // aucun octet modifié
      expect(await exists(archiveRoot)).toBe(false); // aucune archive orpheline
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('writeDatasetTwoPhase — staging complet PUIS renames en rafale', () => {
  // Dataset "suivant" distinct de PREV pour distinguer ancien/nouveau contenu.
  const NEXT: Dataset = {
    ...PREV,
    meta: { ...PREV.meta, builtAt: '2026-07-05T00:00:00.000Z', finessSnapshotMax: '2026-06-15' },
    essms: [
      { finessGeo: '000000002', score: 88, cabinet: 'NEW CAB', raisonSociale: 'NEW', region: 'R2', statut: 'S2', categ: 'C2', categCode: 'CC2', departement: '02', evalDate: '2026-01-01', grade: null, chapters: [null, null, null], imperatives: [], ciEvaluated: null, ciMet: null, ciAbove35: null },
    ],
    evalHistory: [{ evalCode: 'NEW1', cabinet: 'NEW CAB', dateCloture: '2026-01-01', region: 'R2' }],
  };
  const FILES = ['meta.json', 'essms.json', 'ej-snapshots.json', 'capacity-snapshots.json', 'base-doc.json', 'eval-history.json'];

  it('écrit les 6 fichiers TEMPORAIRES avant le PREMIER rename (ordre des opérations espionné)', async () => {
    const root = await mkTmp();
    try {
      await writePrev(root);
      const ops: string[] = [];
      const io: DatasetWriteIo = {
        writeFile: async (p, d, e) => {
          ops.push(`write:${basename(String(p))}`);
          return writeFile(p, d, e);
        },
        rename: async (a, b) => {
          ops.push(`rename:${basename(String(b))}`);
          return rename(a, b);
        },
      };
      await writeDatasetTwoPhase(root, NEXT, io);

      // Phase 1 complète (6 écritures temp) AVANT la phase 2 (6 renames).
      expect(ops).toHaveLength(12);
      const firstRename = ops.findIndex((o) => o.startsWith('rename:'));
      expect(firstRename).toBe(6); // aucun rename intercalé dans les écritures
      expect(ops.slice(0, 6).every((o) => o.startsWith('write:') && o.includes('.tmp-'))).toBe(true);
      expect(ops.slice(6).map((o) => o.replace('rename:', '')).sort()).toEqual([...FILES].sort());

      // Résultat rechargeable et à jour ; aucun temporaire résiduel.
      const reloaded = await loadDataset(root);
      expect(reloaded.meta.finessSnapshotMax).toBe('2026-06-15');
      expect((await readdir(root)).filter((n) => n.includes('.tmp-'))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('un rename qui échoue au 3e fichier laisse chaque FINAL complet (ancien OU nouveau, jamais partiel) et nettoie les temporaires', async () => {
    const root = await mkTmp();
    try {
      await writePrev(root);
      const oldContents = await snapshotDir(root);
      let renames = 0;
      const io: DatasetWriteIo = {
        writeFile,
        rename: async (a, b) => {
          renames++;
          if (renames === 3) throw new Error('rename simulé KO (3e fichier)');
          return rename(a, b);
        },
      };
      await expect(writeDatasetTwoPhase(root, NEXT, io)).rejects.toThrow(/rename simulé KO/);

      // Chaque fichier FINAL est un JSON complet égal soit à l'ancien soit au nouveau
      // contenu — JAMAIS une écriture partielle (les finaux ne sont touchés que par
      // rename atomique, jamais par write).
      const newContents: Record<string, string> = {
        'meta.json': JSON.stringify(NEXT.meta),
        'essms.json': JSON.stringify(NEXT.essms),
        'ej-snapshots.json': JSON.stringify(NEXT.ejSnapshots),
        'capacity-snapshots.json': JSON.stringify(NEXT.capacitySnapshots),
        'base-doc.json': JSON.stringify(NEXT.baseDoc),
        'eval-history.json': JSON.stringify(NEXT.evalHistory),
      };
      for (const f of FILES) {
        const got = await readFile(join(root, f), 'utf8');
        expect([oldContents[f], newContents[f]]).toContain(got);
        expect(() => JSON.parse(got)).not.toThrow();
      }
      // Temporaires non renommés nettoyés (best effort).
      expect((await readdir(root)).filter((n) => n.includes('.tmp-'))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
