/**
 * RUN RÉEL (manuel) du rafraîchissement depuis les sources publiques.
 *
 * Télécharge tout (~350 Mo : base-doc JSONL 308 Mo + 2 parquets HAS + 2 CSV
 * FINESS), reconstruit un Dataset frais, puis contrôle golden (chemin STORE) sur
 * le dataset rafraîchi + premier diff RÉEL de registre des cabinets.
 *
 * NE TOUCHE PAS `data/generated/` (snapshot embarqué de référence). Le refresh
 * s'exécute sur une COPIE dans `data/refresh-test/current/` ; l'archive
 * va dans `data/refresh-test/archives/`. `data/refresh-test/` est gitignore.
 * L'intégrité de `data/generated` est prouvée par hachage AVANT/APRÈS.
 *
 * Run : pnpm tsx scripts/refresh-real.ts
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, rm, cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { refreshDataset } from '../store/refresh';
import { loadDataset } from '../store/load';
import { makeStoreProxy } from '../store/proxy';
import { setSignificanceAlpha } from '../core/significance';
import { analyzeMonoMultiFromProd } from '../core/mono-multi-extract';
import { cabinetRegistry, diffRegistries } from '../store/registry';

const GENERATED = join(process.cwd(), 'data', 'generated');
const SCRATCH_ROOT = join(process.cwd(), 'data', 'refresh-test');
const SCRATCH_CURRENT = join(SCRATCH_ROOT, 'current');
const SCRATCH_ARCHIVES = join(SCRATCH_ROOT, 'archives');

async function hashDir(dir: string): Promise<Record<string, string>> {
  const names = (await readdir(dir)).sort();
  const out: Record<string, string> = {};
  for (const n of names) {
    const buf = await readFile(join(dir, n));
    out[n] = createHash('sha256').update(buf).digest('hex');
  }
  return out;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Enveloppe fetch : mesure taille (content-length) + durée par téléchargement. */
function instrumentedFetch(): { fetchImpl: typeof fetch; log: { url: string; bytes: number; ms: number }[] } {
  const log: { url: string; bytes: number; ms: number }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const t0 = Date.now();
    const res = await fetch(input as Parameters<typeof fetch>[0], init);
    const cl = Number(res.headers.get('content-length') ?? 0);
    log.push({ url, bytes: cl, ms: Date.now() - t0 });
    return res;
  }) as unknown as typeof fetch;
  return { fetchImpl, log };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log('RUN RÉEL refresh (sources publiques)\n');

  // ── Intégrité data/generated : empreinte AVANT ─────────────────────────────────
  const before = await hashDir(GENERATED);
  console.log(`[garde] data/generated : ${Object.keys(before).length} fichiers hachés (avant).`);

  // ── Baseline registre (ancien dataset) ────────────────────────────────────────
  const oldDs = await loadDataset(GENERATED);
  const oldRegistry = cabinetRegistry(oldDs.evalHistory);

  // ── Copie data/generated → scratch (le refresh écrit LÀ, pas dans generated) ───
  await rm(SCRATCH_ROOT, { recursive: true, force: true });
  await mkdir(SCRATCH_ROOT, { recursive: true });
  await cp(GENERATED, SCRATCH_CURRENT, { recursive: true });
  console.log(`[scratch] copie → ${SCRATCH_CURRENT}\n`);

  // ── Refresh RÉEL ───────────────────────────────────────────────────────────────
  const { fetchImpl, log } = instrumentedFetch();
  console.log('[refresh] téléchargement + reconstruction en cours (~350 Mo)…');
  const res = await refreshDataset({
    currentDir: SCRATCH_CURRENT,
    archiveRoot: SCRATCH_ARCHIVES,
    fetchImpl,
  });
  const ds = res.dataset;

  console.log('\n[téléchargements]');
  for (const l of log) {
    const short = l.url.length > 70 ? `…${l.url.slice(-67)}` : l.url;
    console.log(`  ${(l.ms / 1000).toFixed(1)}s  ${l.bytes ? mb(l.bytes).padStart(9) : '   (chunk)'}  ${short}`);
  }

  console.log('\n[volumes dataset rafraîchi]');
  console.log(`  essms            ${String(ds.essms.length).padStart(7)}`);
  console.log(`  eval-history     ${String(ds.evalHistory.length).padStart(7)}`);
  console.log(`  ej-snapshots     ${String(ds.ejSnapshots.length).padStart(7)}  dates=${[...new Set(ds.ejSnapshots.map((s) => s.snapshotDate))].sort().join(', ')}`);
  console.log(`  capacity         ${String(ds.capacitySnapshots.length).padStart(7)}  dates=${[...new Set(ds.capacitySnapshots.map((s) => s.snapshotDate))].sort().join(', ')}`);
  console.log(`  base-doc         ${String(ds.baseDoc.length).padStart(7)}`);
  console.log(`  meta.finessSnapshotMax=${ds.meta.finessSnapshotMax}  hasSyncedAt=${ds.meta.hasSyncedAt}`);

  console.log('\n[fraîcheur]');
  console.log(`  FINESS EJ       résolu=${res.finessFreshness.resolvedDate} embarqué=${res.finessFreshness.embeddedMax} newer=${res.finessFreshness.isNewer}${res.finessFreshness.warning ? ` ⚠️ ${res.finessFreshness.warning}` : ''}`);
  console.log(`  FINESS capacité résolu=${res.capacityFreshness.resolvedDate} embarqué=${res.capacityFreshness.embeddedMax} newer=${res.capacityFreshness.isNewer}${res.capacityFreshness.warning ? ` ⚠️ ${res.capacityFreshness.warning}` : ''}`);

  // ── Contrôle GOLDEN sur le dataset rafraîchi (chemin STORE, α=0,01) ────────────
  setSignificanceAlpha(0.01);
  const mm = await analyzeMonoMultiFromProd(makeStoreProxy(ds));
  const goldenOk = mm.betaAdj > 4.0 && mm.betaAdj < 4.2 && mm.n > 18000;
  console.log('\n[golden — chemin store sur données du jour]');
  console.log(`  N=${mm.n}  nMono=${mm.nMono}  nMulti=${mm.nMulti}  β=+${mm.betaAdj.toFixed(6)}  se=${mm.se.toFixed(6)}  p=${mm.p.toExponential(3)}  IC[${mm.ciLow.toFixed(4)};${mm.ciHigh.toFixed(4)}]`);
  console.log(`  → ${goldenOk ? 'GOLDEN OK (β∈]4,0;4,2[ et N>18000)' : '⚠️ HORS BANDE ATTENDUE'}`);

  // ── Premier diff RÉEL de registre des cabinets ────────────────────────────────
  const newRegistry = cabinetRegistry(ds.evalHistory);
  const diff = diffRegistries(oldRegistry, newRegistry);
  console.log('\n[diff registre cabinets — ancien seed vs données du jour]');
  console.log(`  cabinets (ancien)=${oldRegistry.length}  (nouveau)=${newRegistry.length}`);
  console.log(`  apparus=${diff.appeared.length}  disparus=${diff.disappeared.length}`);
  if (diff.appeared.length) console.log(`    apparus: ${diff.appeared.slice(0, 10).map((r) => r.cabinet).join(' | ')}${diff.appeared.length > 10 ? ' …' : ''}`);
  if (diff.disappeared.length) console.log(`    disparus: ${diff.disappeared.slice(0, 10).map((r) => r.cabinet).join(' | ')}${diff.disappeared.length > 10 ? ' …' : ''}`);

  // ── Intégrité data/generated : empreinte APRÈS ────────────────────────────────
  const after = await hashDir(GENERATED);
  const untouched = JSON.stringify(before) === JSON.stringify(after);
  console.log('\n[garde] data/generated APRÈS refresh :');
  for (const n of Object.keys(before)) {
    console.log(`  ${untouched || before[n] === after[n] ? 'OK ' : 'MODIFIÉ '} ${n}  ${(after[n] ?? 'ABSENT').slice(0, 12)}`);
  }
  console.log(`  → data/generated ${untouched ? 'INTACT (hash identique avant/après)' : '⚠️ MODIFIÉ — ANOMALIE'}`);

  console.log(`\nTerminé en ${((Date.now() - t0) / 1000).toFixed(0)}s.  archive=${res.archivedPrevious}`);

  if (!goldenOk || !untouched) process.exit(2);
}

main().catch((err) => {
  console.error('\nRUN RÉEL ÉCHOUÉ:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
