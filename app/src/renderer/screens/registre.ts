import { frDate, escapeHtml } from '../util';

/** Écran Registre : ligne de vie de chaque cabinet (première/dernière éval, volume). */
export async function renderRegistre(root: HTMLElement): Promise<void> {
  const reg = await window.api.registry();
  root.innerHTML = `
    <h2>Registre des cabinets</h2>
    <p class="note">Ligne de vie de chaque cabinet, reconstituée à partir des dates
      d'évaluation publiées (~2021 →).</p>
    <table id="registre">
      <thead><tr><th>Cabinet</th><th>Première éval.</th><th>Dernière éval. publiée</th><th>Total</th></tr></thead>
      <tbody>${reg
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.cabinet)}</td><td>${frDate(r.firstEval)}</td><td>${frDate(r.lastEval)}</td><td>${r.totalEvals}</td></tr>`,
        )
        .join('')}</tbody>
    </table>
    <p class="note">« Dernière évaluation publiée » ne signifie ni cessation d'activité ni
      perte d'accréditation (les données publiques ne le disent pas). Un changement de nom
      d'un cabinet apparaît comme une sortie suivie d'une entrée.</p>
  `;
}
