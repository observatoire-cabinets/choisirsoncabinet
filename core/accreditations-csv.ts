/** Exports CSV de l'onglet Accréditations (Excel FR : ';', virgule, BOM UTF-8). */
import type { AccreditationsView, StatutCabinet } from './accreditations';

const BOM = '﻿';
function cell(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const STATUT_LABELS: Record<StatutCabinet, string> = {
  accredite: 'Accrédité',
  'autorise-sans-numero': 'Autorisé sans accréditation (recevabilité opérationnelle)',
  sorti: 'Sorti de liste (motif non indiqué par la source)',
  'sorti-avec-numero': 'Sorti de liste en portant un numéro (motif non indiqué par la source)',
  'sorti-concordance-cofrac': 'Sorti de liste — concordance constatée sur le relevé COFRAC',
  'jamais-observe': 'Jamais observé sur la liste (fenêtres d’observation)',
  'non-rapproche': 'Non rapproché',
};

export function buildStatutsCsv(v: AccreditationsView): string {
  const head = 'Cabinet;Statut;SIREN;N° accréditation;Dép.;Dernier état présent;Premier état absent;Concordance COFRAC (date du relevé)';
  const lines = v.statuts.map((s) =>
    [
      cell(s.cabinet), cell(STATUT_LABELS[s.statut]), cell(s.siren), cell(s.num), cell(s.dept),
      cell(s.dernierEtatPresent), cell(s.premierEtatAbsent), cell(s.concordanceDate),
    ].join(';'),
  );
  return BOM + [head, ...lines].join('\r\n') + '\r\n';
}

export function buildChronologieCsv(v: AccreditationsView): string {
  const head = 'Date;Type;Organismes;Accrédités;Sans numéro;Source';
  const lines = v.chronologie.map((c) =>
    [cell(c.date), cell(c.kind === 'etat' ? 'relevé' : 'bilan annuel'), cell(c.organismes),
      cell(c.accredites), cell(c.sansNumero), cell(c.source)].join(';'),
  );
  return BOM + [head, ...lines].join('\r\n') + '\r\n';
}

export function buildSortiesCsv(v: AccreditationsView): string {
  const head = 'SIREN;Nom (dernier connu);N° accréditation;Dép.;Présent au;Absent au;Motif;Revenu en liste;Concordance COFRAC;Piste';
  const lines = v.sorties.map((s) =>
    [
      cell(s.siren), cell(s.nom), cell(s.num), cell(s.dept), cell(s.dernierPresent),
      cell(s.premierAbsent), cell(s.motif), cell(s.revenu ? 'oui' : ''),
      cell(s.concordanceDate), cell(s.piste ? `${s.piste.revenuNom} (${s.piste.lecture}) — à confirmer` : ''),
    ].join(';'),
  );
  return BOM + [head, ...lines].join('\r\n') + '\r\n';
}
