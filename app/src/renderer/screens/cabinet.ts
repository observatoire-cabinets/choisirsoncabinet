import { frDate, escapeHtml } from '../util';

/** Écran Cabinet choisi : comparaison au national + 5 structures les moins bien notées. */
export async function renderCabinet(root: HTMLElement): Promise<void> {
  const cabinets = await window.api.listCabinets();
  root.innerHTML = `
    <h2>Cabinet choisi</h2>
    <label>Cabinet :
      <select id="cabinet-select">
        <option value="">— choisir —</option>
        ${cabinets.map((c) => `<option>${escapeHtml(c)}</option>`).join('')}
      </select>
    </label>
    <div id="cabinet-detail"></div>
  `;

  const sel = root.querySelector('#cabinet-select') as HTMLSelectElement;
  const detail = root.querySelector('#cabinet-detail') as HTMLElement;

  sel.addEventListener('change', async () => {
    if (!sel.value) {
      detail.innerHTML = '';
      return;
    }
    const d = await window.api.cabinetDetail(sel.value);
    if (!d) {
      detail.innerHTML = '<p class="note">Aucune donnée pour ce cabinet.</p>';
      return;
    }
    const gapStr = (d.gapVsNational >= 0 ? '+' : '') + d.gapVsNational.toFixed(2);
    detail.innerHTML = `
      <p>Évaluations scorées : <strong>${d.nEvaluations}</strong>
         · Moyenne cabinet : <strong>${d.meanCabinet.toFixed(2)}</strong>
         · Moyenne nationale : <strong>${d.meanNational.toFixed(2)}</strong></p>
      <p>Écart au national : <strong id="cabinet-gap">${gapStr}</strong> points (écart brut, non ajusté).</p>
      <h3>Les 5 scores les plus bas attribués par ce cabinet</h3>
      <table id="cabinet-lowest">
        <thead><tr><th>Structure</th><th>Adresse</th><th>Score</th><th>Date</th></tr></thead>
        <tbody>${d.lowestScored
          .map(
            (s) =>
              `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.address)}</td><td>${s.score}</td><td>${s.evalDate ? frDate(s.evalDate) : '—'}</td></tr>`,
          )
          .join('')}</tbody>
      </table>
      <p class="note">Faits bruts issus de données publiques (HAS + FINESS). Un score bas ne
         présume ni de la qualité réelle des soins ni du travail du cabinet ; association
         n'est pas causalité.</p>
    `;
  });
}
