import { frDate, escapeHtml } from '../util';
import type { CabinetDetail } from '../../../../store/cabinet-detail';

type Ranked = CabinetDetail['establishments'][number] & { rank: number };

/**
 * Écran Cabinet choisi : comparaison au national + la liste COMPLÈTE des
 * structures évaluées par le cabinet, triée du score le plus bas au plus élevé,
 * avec filtre de recherche et export PDF.
 */
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
    renderDetail(detail, sel.value, d);
  });
}

function renderDetail(detail: HTMLElement, cabinet: string, d: CabinetDetail): void {
  const gapStr = (d.gapVsNational >= 0 ? '+' : '') + d.gapVsNational.toFixed(2);
  const ranked: Ranked[] = d.establishments.map((e, i) => ({ ...e, rank: i + 1 }));

  detail.innerHTML = `
    <p>Évaluations scorées : <strong>${d.nEvaluations}</strong>
       · Moyenne cabinet : <strong>${d.meanCabinet.toFixed(2)}</strong>
       · Moyenne nationale : <strong>${d.meanNational.toFixed(2)}</strong></p>
    <p>Écart au national : <strong id="cabinet-gap">${gapStr}</strong> points (écart brut, non ajusté).</p>
    <h3>Structures évaluées par ce cabinet, du score le plus bas au plus élevé
        (<span id="cabinet-count">${ranked.length}</span>)</h3>
    <div style="margin:8px 0; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
      <input id="cabinet-filter" type="search" placeholder="Filtrer par nom ou commune…"
             style="min-width:260px;" />
      <button id="cabinet-export">Exporter le classement (PDF)</button>
      <span id="cabinet-export-status" class="note"></span>
    </div>
    <table id="cabinet-list">
      <thead><tr><th>Rang</th><th>Structure</th><th>Adresse</th><th>Score</th><th>Date</th></tr></thead>
      <tbody></tbody>
    </table>
    <p class="note">Faits bruts issus de données publiques (HAS + FINESS). Le score mesure la
       conformité méthodologique au référentiel, pas la qualité réelle des soins ; un score bas ne
       présume ni de la qualité réelle des soins ni du travail du cabinet ; association n'est pas
       causalité.</p>
  `;

  const tbody = detail.querySelector('#cabinet-list tbody') as HTMLElement;
  const filterInput = detail.querySelector('#cabinet-filter') as HTMLInputElement;
  const countSpan = detail.querySelector('#cabinet-count') as HTMLElement;

  const rowHtml = (e: Ranked): string =>
    `<tr><td>${e.rank}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.address)}</td>` +
    `<td>${e.score}</td><td>${e.evalDate ? frDate(e.evalDate) : '—'}</td></tr>`;

  const draw = (): void => {
    const q = filterInput.value.trim().toLowerCase();
    const shown = q
      ? ranked.filter((e) => e.name.toLowerCase().includes(q) || e.address.toLowerCase().includes(q))
      : ranked;
    tbody.innerHTML = shown.map(rowHtml).join('');
    countSpan.textContent = q ? `${shown.length} sur ${ranked.length}` : String(ranked.length);
  };
  draw();
  filterInput.addEventListener('input', draw);

  const exportBtn = detail.querySelector('#cabinet-export') as HTMLButtonElement;
  const exportStatus = detail.querySelector('#cabinet-export-status') as HTMLElement;
  exportBtn.addEventListener('click', async () => {
    const dir = await window.api.pickOutputDir();
    if (!dir) return;
    exportBtn.disabled = true;
    exportStatus.textContent = 'Génération du PDF…';
    try {
      const path = await window.api.exportCabinetRanking(cabinet, dir);
      exportStatus.textContent = `PDF écrit : ${path}`;
    } catch (e) {
      exportStatus.textContent = `Erreur : ${(e as Error).message}`;
    } finally {
      exportBtn.disabled = false;
    }
  });
}
