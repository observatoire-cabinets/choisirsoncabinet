/**
 * CLI de génération BOUT-EN-BOUT (12 fiches de l'Observatoire, hors-ligne).
 *
 * Charge le Dataset local (fichiers JSON générés), recalcule chaque fiche et écrit
 * les PDF dans `--out`. Aucune I/O réseau/DB/S3/email — pipeline 100 % offline.
 *
 * Usage :
 *   pnpm tsx scripts/generate-cli.ts --out out
 *     [--fiches 1,2,3] [--alpha 0.05] [--data data/generated]
 *
 * Seuil α : 0,05 par défaut ; bascule 0,01
 * disponible pour le harnais de comparaison. Voir core/significance.ts.
 *
 * Politique d'erreur (opérateur) : run BRUYANT mais COMPLET. Une fiche qui échoue
 * est signalée (❌) sans interrompre le lot ; le process sort en code 1 si AU
 * MOINS une fiche a échoué — l'opérateur voit tout ce qui a marché ET ce qui non.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDataset } from '../store/load';
import { makeStoreProxy } from '../store/proxy';
import { generateFiche } from '../core/generate';
import { setSignificanceAlpha, alphaLabel, type Alpha } from '../core/significance';
import { FICHE_CALENDAR } from '../core/fiche-calendar';

const arg = (name: string, dflt: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
};

const out = arg('out', 'out');
const dataDir = arg('data', 'data/generated');
const alpha = Number(arg('alpha', '0.05'));
const fiches = arg('fiches', FICHE_CALENDAR.map((e) => e.numero).join(','))
  .split(',')
  .map((s) => Number(s.trim()));

// Validation α : seuls 0,05 et 0,01 sont acceptés (setSignificanceAlpha
// lève aussi, mais on veut un message CLI amical avant tout chargement).
if (alpha !== 0.05 && alpha !== 0.01) {
  console.error(`Erreur : --alpha invalide « ${arg('alpha', '0.05')} » — valeurs acceptées : 0.05 ou 0.01.`);
  process.exit(1);
}

setSignificanceAlpha(alpha as Alpha);

// tsx compile ce projet en CJS (pas de `"type":"module"`) → pas de top-level
// await disponible : la logique asynchrone vit dans main().
async function main(): Promise<void> {
  const ds = await loadDataset(dataDir);
  await mkdir(out, { recursive: true });

  // UNE extraction as-of pour les 12 fiches : proxy construit une fois,
  // réutilisé à chaque appel (4e argument de generateFiche).
  const proxy = makeStoreProxy(ds);

  console.log(`Génération ${fiches.length} fiche(s), ${alphaLabel()}, données du ${ds.meta.hasSyncedAt}`);

  let written = 0;
  const failed: number[] = [];

  for (const numero of fiches) {
    // Chaque fiche isolée : un échec est signalé et le lot CONTINUE.
    try {
      const res = await generateFiche(ds, numero, undefined, proxy);
      for (const f of res.files) await writeFile(join(out, f.filename), f.content);
      written += res.files.length;
      console.log(`  fiche ${numero} ✅ (${res.files.length} PDF)`);
      // Dégradations non bloquantes rendues visibles (produit opposable).
      for (const w of res.warnings) console.log(`  fiche ${numero} ⚠ ${w}`);
    } catch (e) {
      failed.push(numero);
      console.error(`  fiche ${numero} ❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(
    `\nTerminé : ${fiches.length - failed.length}/${fiches.length} fiche(s) OK, ${written} PDF écrits dans ${out}` +
      (failed.length ? ` — ÉCHECS : fiche(s) ${failed.join(', ')}` : ''),
  );

  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
