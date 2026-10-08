/**
 * Ré-analyse des PDF de référence (core/__fixtures__/liste-has) avec l'analyseur
 * courant et mise à jour des états correspondants de l'amorce embarquée
 * (data/generated/liste-has/etats.json). Les dates absentes de l'amorce sont
 * ajoutées ; date_releve est le jour du fichier, sha256 l'empreinte du PDF.
 *
 *   pnpm tsx scripts/reanalyse-amorce-liste-has.ts --dates 2026-07-16,2026-10-06
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { extractListeHasText } from '../core/liste-has-pdf';
import { parseListeHasText, type ListeHasEtat } from '../core/liste-has-parse';

async function main(): Promise<void> {
  const i = process.argv.indexOf('--dates');
  const dates = i >= 0 ? (process.argv[i + 1] ?? '').split(',').filter(Boolean) : [];
  if (dates.length === 0) {
    console.error('Usage : pnpm tsx scripts/reanalyse-amorce-liste-has.ts --dates AAAA-MM-JJ[,AAAA-MM-JJ]');
    process.exit(1);
  }
  const racine = join(__dirname, '..');
  const fichier = join(racine, 'data', 'generated', 'liste-has', 'etats.json');
  const etats = JSON.parse(readFileSync(fichier, 'utf8')) as ListeHasEtat[];
  for (const d of dates) {
    const pdf = readFileSync(join(racine, 'core', '__fixtures__', 'liste-has', `liste-has-${d}.pdf`));
    const etat = parseListeHasText(await extractListeHasText(pdf));
    etat.date_releve = d;
    etat.sha256 = createHash('sha256').update(pdf).digest('hex');
    const idx = etats.findIndex((e) => e.date_releve === d);
    if (idx >= 0) etats[idx] = etat;
    else etats.push(etat);
    const acc = etat.organismes.filter((o) => o.num !== '').length;
    console.log(`  ${d} : ${etat.organismes.length} organismes, ${acc} accrédités`);
  }
  etats.sort((a, b) => a.date_releve.localeCompare(b.date_releve));
  writeFileSync(fichier, JSON.stringify(etats, null, 1), 'utf8');
  console.log(`Amorce mise à jour (${etats.length} états).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
