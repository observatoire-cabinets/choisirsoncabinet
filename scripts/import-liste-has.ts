/**
 * Importe les états de la liste HAS depuis une archive d'états JSON vers
 * l'amorce embarquée data/generated/liste-has/. Relançable ; échoue si les
 * comptages ne correspondent pas aux valeurs de référence.
 *
 *   pnpm tsx scripts/import-liste-has.ts --source "./archive/etats"
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ListeHasEtat } from '../core/liste-has-parse';
import type { BilanAnnuel, PisteSuccession } from '../store/liste-has-types';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
};

// Comptages de référence (vérifiés par deux méthodes indépendantes).
const REFERENCE: Record<string, { organismes: number; accredites: number }> = {
  '2022-10-11': { organismes: 42, accredites: 0 },
  '2022-10-17': { organismes: 43, accredites: 0 },
  '2023-04-07': { organismes: 98, accredites: 0 },
  '2023-09-24': { organismes: 115, accredites: 4 },
  '2026-03-06': { organismes: 118, accredites: 100 },
  '2026-05-07': { organismes: 119, accredites: 104 },
  '2026-07-16': { organismes: 117, accredites: 103 },
  '2026-08-13': { organismes: 115, accredites: 103 },
};

// Effectifs des bilans annuels HAS (sources publiques, valeurs relues dans les PDF).
const BILANS: BilanAnnuel[] = [
  { date: '2022-12-31', autorises: 72, accredites: null, derogation: null, source: 'Bilan annuel HAS 2023' },
  { date: '2023-12-31', autorises: 117, accredites: null, derogation: null, source: 'Bilan annuel HAS 2023' },
  { date: '2024-12-31', autorises: 128, accredites: 87, derogation: 41, source: 'Bilan annuel HAS 2024' },
  { date: '2025-12-31', autorises: 121, accredites: 100, derogation: 21, source: 'Bilan annuel HAS 2025' },
];

// Faits datés que la HAS publie dans ses bilans annuels sur cette fenêtre —
// formulations factuelles, sourcées (affichés en encadré du volet ②).
const FAITS_BILANS: string[] = [
  "8 organismes sortis de la liste en 2024 à la demande des organismes eux-mêmes (source : Bilan annuel HAS 2024).",
  "11 organismes ont arrêté leur activité d'évaluation en 2025 (source : Bilan annuel HAS 2025).",
  "7 organismes autorisés n'ont réalisé aucune évaluation en 2024 (source : Bilan annuel HAS 2024).",
  "Première diminution du nombre d'organismes autorisés, relevée par la HAS en 2025 (source : Bilan annuel HAS 2025).",
];

// Pistes de succession (rapprochements par nom — jamais affirmés).
const PISTES: PisteSuccession[] = [
  { sortiSiren: '442928826', sortiNom: 'STRATELYS', revenuSiren: '479667735', revenuNom: 'STRATELYS', lecture: 'même nom, autre SIREN' },
  { sortiSiren: '800719262', sortiNom: 'AUTONOMII', revenuSiren: '934830639', revenuNom: 'AUTONOMII EVALUATION', lecture: 'nom repris avec variation, autre SIREN' },
  { sortiSiren: '411588619', sortiNom: 'CABINET GK Conseil', revenuSiren: '928991629', revenuNom: 'GK CONSEIL AUDIT', lecture: 'nom repris avec variation, autre SIREN' },
  { sortiSiren: '835149824', sortiNom: 'MEDICONSEIL FORMATION', revenuSiren: '939988499', revenuNom: 'MEDICONSEIL EVALUATION', lecture: 'nom repris avec variation, autre SIREN' },
];

function main(): void {
  const source = arg('source');
  if (!source) {
    console.error('Usage : pnpm tsx scripts/import-liste-has.ts --source "<dossier des états JSON>"');
    process.exit(1);
  }
  const outDir = join(__dirname, '..', 'data', 'generated', 'liste-has');
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(source).filter((f) => f.endsWith('_etat.json')).sort();
  const etats: ListeHasEtat[] = files.map(
    (f) => JSON.parse(readFileSync(join(source, f), 'utf8')) as ListeHasEtat,
  );

  let failed = 0;
  for (const e of etats) {
    const ref = REFERENCE[e.date_releve];
    if (!ref) {
      console.log(`  état ${e.date_releve} : hors référence (nouvel état), accepté tel quel`);
      continue;
    }
    const acc = e.organismes.filter((o) => o.num !== '').length;
    if (e.organismes.length !== ref.organismes || acc !== ref.accredites) {
      console.error(
        `  état ${e.date_releve} ❌ ${e.organismes.length}/${acc} != référence ${ref.organismes}/${ref.accredites}`,
      );
      failed++;
    } else {
      console.log(`  état ${e.date_releve} ✅ ${e.organismes.length} organismes, ${acc} accrédités`);
    }
  }
  if (failed > 0) {
    console.error(`${failed} état(s) hors référence — import refusé.`);
    process.exit(1);
  }

  writeFileSync(join(outDir, 'etats.json'), JSON.stringify(etats, null, 1), 'utf8');
  writeFileSync(join(outDir, 'bilans.json'), JSON.stringify(BILANS, null, 1), 'utf8');
  writeFileSync(join(outDir, 'faits.json'), JSON.stringify(FAITS_BILANS, null, 1), 'utf8');
  writeFileSync(join(outDir, 'pistes.json'), JSON.stringify(PISTES, null, 1), 'utf8');
  // alias.json : créé vide s'il n'existe pas (curaté à la main ensuite, jamais écrasé).
  try {
    readFileSync(join(outDir, 'alias.json'));
    console.log('  alias.json existant conservé');
  } catch {
    writeFileSync(join(outDir, 'alias.json'), '[]\n', 'utf8');
  }
  console.log(`Amorce écrite dans ${outDir} (${etats.length} états).`);
}

main();
