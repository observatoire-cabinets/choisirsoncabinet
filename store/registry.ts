/**
 * Registre des cabinets : ligne de vie par cabinet
 * (première/dernière évaluation publiée, volume par année) reconstruite
 * depuis l'historique public des évaluations (`evalHistory`, une ligne par
 * eval_code). Le diff entre deux versions du dataset (refresh d'archives)
 * détecte entrées/sorties par simple comparaison d'ensembles de noms.
 *
 * Limite documentée : la donnée publique ne porte que le nom du cabinet — un
 * renommage se traduit par UNE sortie + UNE entrée, indiscernable d'un départ
 * réel + une arrivée réelle. La formulation ci-dessous est donc volontairement
 * factuelle et ne conclut JAMAIS sur la cause d'une disparition (pas de
 * « fermé », pas de « perte d'accréditation ») — seule la donnée publiée est
 * décrite.
 */

import type { EvalHistoryRow } from './types';

export interface CabinetLifeline {
  cabinet: string;
  firstEval: string;
  lastEval: string;
  totalEvals: number;
  // Record<number,·> = fiction TS : à l'exécution les clés sont des strings (Object.keys → Number() côté UI) ; itération ascendante garantie par JS pour les clés entières.
  byYear: Record<number, number>;
}

export interface RegistryDiff {
  appeared: CabinetLifeline[];
  disappeared: CabinetLifeline[];
  disappearedLabel: (cabinet: string, lastEval: string) => string;
}

export function cabinetRegistry(history: EvalHistoryRow[]): CabinetLifeline[] {
  const byCab = new Map<string, EvalHistoryRow[]>();
  for (const h of history) {
    if (!h.cabinet || !h.dateCloture) continue;
    let bucket = byCab.get(h.cabinet);
    if (!bucket) {
      bucket = [];
      byCab.set(h.cabinet, bucket);
    }
    bucket.push(h);
  }
  return [...byCab.entries()]
    .map(([cabinet, evals]) => {
      const dates = evals.map((e) => e.dateCloture!).sort();
      const byYear: Record<number, number> = {};
      for (const d of dates) {
        const year = Number(d.slice(0, 4));
        byYear[year] = (byYear[year] ?? 0) + 1;
      }
      return {
        cabinet,
        firstEval: dates[0],
        lastEval: dates[dates.length - 1],
        totalEvals: dates.length,
        byYear,
      };
    })
    .sort((a, b) => a.cabinet.localeCompare(b.cabinet, 'fr'));
}

/**
 * Formatage fr (JJ/MM/AAAA) indépendant du fuseau horaire de la machine :
 * les dates ISO du dataset sont des dates-sans-heure ("2022-01-01"), donc on
 * découpe la chaîne directement plutôt que de passer par `new Date(iso)`
 * (qui interprète l'ISO en UTC minuit puis re-projette dans le fuseau LOCAL —
 * risque de décalage d'un jour sur une machine à l'ouest de l'UTC).
 */
const frDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/**
 * Formulation FACTUELLE imposée — ne jamais dire « fermé / accréditation perdue ».
 * Fonction pure exportée à part : une propriété-fonction ne survit pas à JSON.stringify
 * (frontière IPC) — cet export est importable des deux côtés du pont.
 */
export function disappearedLabel(cabinet: string, lastEval: string): string {
  return `${cabinet} : n'apparaît plus dans les données publiées (dernière évaluation publiée le ${frDate(lastEval)})`;
}

export function diffRegistries(before: CabinetLifeline[], after: CabinetLifeline[]): RegistryDiff {
  const beforeSet = new Set(before.map((r) => r.cabinet));
  const afterSet = new Set(after.map((r) => r.cabinet));
  return {
    appeared: after.filter((r) => !beforeSet.has(r.cabinet)),
    disappeared: before.filter((r) => !afterSet.has(r.cabinet)),
    disappearedLabel, // forme spec conservée ; délègue à l'export autonome ci-dessus
  };
}
