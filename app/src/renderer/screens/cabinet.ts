import { frDate, escapeHtml } from '../util';
import type { CabinetDetail } from '../../../../store/cabinet-detail';

type Establishment = CabinetDetail['establishments'][number];

/**
 * Écran Cabinet choisi : comparaison au national + la liste COMPLÈTE des
 * structures évaluées par le cabinet, triée alphabétiquement par nom (le score
 * par établissement n'est pas exposé), avec filtre de recherche et export PDF.
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
  const list: Establishment[] = d.establishments;

  detail.innerHTML = `
    <p>Évaluations scorées : <strong>${d.nEvaluations}</strong>
       · Moyenne cabinet : <strong>${d.meanCabinet.toFixed(2)}</strong>
       · Moyenne nationale : <strong>${d.meanNational.toFixed(2)}</strong></p>
    <p>Écart au national : <strong id="cabinet-gap">${gapStr}</strong> points (écart brut, non ajusté).</p>
    <details class="note" style="margin:6px 0 12px;">
      <summary style="cursor:pointer;">Clé de lecture — comment lire ces chiffres</summary>
      <ul style="margin:8px 0 0; padding-left:18px; line-height:1.5;">
        <li><strong>Évaluations scorées</strong> : nombre de structures évaluées par ce cabinet ayant un score (la plus récente par structure). Plus ce nombre est élevé, plus les moyennes ci-dessous sont solides.</li>
        <li><strong>Moyenne cabinet</strong> : moyenne des <strong>scores HAS</strong> (0 à 100) des structures qu'il a évaluées. Le score HAS mesure le niveau auquel une structure satisfait les exigences du référentiel, <em>tel que coté par l'évaluateur</em> — pas la qualité des soins, et sa justesse n'est pas vérifiable depuis l'open data. <strong>C'est pourquoi on ne l'affiche pas structure par structure</strong> (trop incertain isolément) ; seule sa moyenne, plus robuste, sert de repère.</li>
        <li><strong>Moyenne nationale</strong> : moyenne des scores de toutes les structures évaluées en France — le repère de comparaison.</li>
        <li><strong>Écart au national (en points)</strong> : moyenne cabinet moins moyenne nationale. Positif = au-dessus de la moyenne nationale ; négatif = en dessous.</li>
        <li><strong>Écart « brut, non ajusté »</strong> : calculé tel quel, <em>sans</em> neutraliser le type de structures évaluées (secteur, statut, taille, région). Un écart peut donc refléter la composition du portefeuille du cabinet plutôt qu'une tendance qui lui serait propre. Il ne se lit pas comme « laxiste » ou « sévère » ; et même ajusté, une association observée n'établit pas un lien de cause à effet.</li>
      </ul>
    </details>
    <h3>Structures évaluées par ce cabinet
        (<span id="cabinet-count">${list.length}</span>)</h3>
    <div style="margin:8px 0; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
      <input id="cabinet-filter" type="search" placeholder="Filtrer par nom ou commune…"
             style="min-width:260px;" />
      <button id="cabinet-export">Exporter les structures (PDF)</button>
      <span id="cabinet-export-status" class="note"></span>
    </div>
    <table id="cabinet-list">
      <thead><tr><th>Structure</th><th>Adresse</th><th>Date</th></tr></thead>
      <tbody></tbody>
    </table>
    <p class="note">Faits bruts issus de données publiques (HAS + FINESS). Le score mesure le niveau de
       satisfaction des exigences du référentiel par la structure, tel que coté par l'évaluateur, pas la
       qualité réelle des soins — et comme l'open data ne fournit que le score, pas le contenu du rapport,
       la justesse de la cotation elle-même n'y est pas vérifiable ; un score bas ne présume ni de la qualité
       réelle des soins ni du travail du cabinet ; association n'est pas causalité.</p>
  `;

  const tbody = detail.querySelector('#cabinet-list tbody') as HTMLElement;
  const filterInput = detail.querySelector('#cabinet-filter') as HTMLInputElement;
  const countSpan = detail.querySelector('#cabinet-count') as HTMLElement;

  const rowHtml = (e: Establishment): string =>
    `<tr><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.address)}</td>` +
    `<td>${e.evalDate ? frDate(e.evalDate) : '—'}</td></tr>`;

  const draw = (): void => {
    const q = filterInput.value.trim().toLowerCase();
    const shown = q
      ? list.filter((e) => e.name.toLowerCase().includes(q) || e.address.toLowerCase().includes(q))
      : list;
    tbody.innerHTML = shown.map(rowHtml).join('');
    countSpan.textContent = q ? `${shown.length} sur ${list.length}` : String(list.length);
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
