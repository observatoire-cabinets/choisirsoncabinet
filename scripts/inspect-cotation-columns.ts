// scripts/inspect-cotation-columns.ts
// Liste les colonnes de cotation du parquet HAS par_essms via les métadonnées.
import { HAS_ESSMS_URL } from '../core/has-parse';

async function main(): Promise<void> {
  const { asyncBufferFromUrl, parquetMetadataAsync } = await import('hyparquet');
  const file = await asyncBufferFromUrl({ url: HAS_ESSMS_URL });
  const meta = await parquetMetadataAsync(file);
  const cols = meta.schema.map((s: { name: string }) => s.name);
  const chap = cols.filter((c) => /^cotation_chapitre_/.test(c)).sort();
  const imp = cols.filter((c) => /^cotation_critere_imperatif_/.test(c)).sort();
  const counters = cols.filter((c) => /^nb_ci/.test(c) || c === 'indice_qualite').sort();
  console.log('indice_qualite présent :', cols.includes('indice_qualite'));
  console.log('chapitres :', chap);
  console.log('compteurs CI + grade :', counters);
  console.log(`critères impératifs (${imp.length}) :`, imp);
}
main().catch((e) => { console.error(e); process.exit(1); });
