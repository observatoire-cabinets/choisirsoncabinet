// scripts/check-cotation-coverage.ts
// Garde-fou véracité : échoue (exit 1) si la couverture des cotations chute
// sous les seuils — signal d'une dérive de schéma HAS (colonne renommée).
import { loadDataset } from '../store/load';
import { cotationCoverage } from '../core/cotations';

const MIN_GRADED = 0.5;      // ajusté après 1er run réel (le grade est très bien rempli côté HAS)
const MIN_CHAPTER = 0.5;
const MIN_IMPERATIVE = 0.3;  // tous les ESSMS n'ont pas de critère impératif coté

async function main(): Promise<void> {
  const dir = process.argv[2] ?? 'data/generated';
  const c = cotationCoverage(await loadDataset(dir));
  console.log('Couverture des cotations :', c);
  const problems: string[] = [];
  if (c.gradedRate < MIN_GRADED) problems.push(`grade ${(c.gradedRate * 100).toFixed(1)}% < ${MIN_GRADED * 100}%`);
  if (c.chapterRate < MIN_CHAPTER) problems.push(`chapitre ${(c.chapterRate * 100).toFixed(1)}% < ${MIN_CHAPTER * 100}%`);
  if (c.imperativeRate < MIN_IMPERATIVE) problems.push(`critères impératifs ${(c.imperativeRate * 100).toFixed(1)}% < ${MIN_IMPERATIVE * 100}%`);
  if (problems.length) {
    console.error('⚠️  COUVERTURE INSUFFISANTE (dérive de schéma HAS possible) :', problems.join(' ; '));
    process.exit(1);
  }
  console.log('✅ Couverture des cotations suffisante.');
}
main().catch((e) => { console.error(e); process.exit(1); });
