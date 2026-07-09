import { escapeHtml } from '../util';
import type { CotationCabinetRow, CotationCabinetProfile } from '../../../../core/cotations';

const TOOLBAR = 'margin:8px 0; display:flex; gap:12px; align-items:center; flex-wrap:wrap;';

const RELIA: Record<string, string> = { fiable: 'suffisante', tendance: 'à confirmer', descriptif: 'limitée' };
const pct = (x: number): string => `${Math.round(x * 100)}`;
const d2 = (x: number | null): string => (x === null ? '—' : x.toFixed(2).replace('.', ','));
const rate = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)} %`);

type SortKey = 'cabinet' | 'nStructures' | 'A' | 'B' | 'C' | 'D' | 'ch1' | 'ch2' | 'ch3' | 'ci';
function sortVal(r: CotationCabinetRow, k: SortKey): number | string {
  switch (k) {
    case 'cabinet': return r.cabinet.toLowerCase();
    case 'nStructures': return r.nStructures;
    case 'A': return r.gradeShare.A; case 'B': return r.gradeShare.B;
    case 'C': return r.gradeShare.C; case 'D': return r.gradeShare.D;
    case 'ch1': return r.chapterMeans[0] ?? -1; case 'ch2': return r.chapterMeans[1] ?? -1;
    case 'ch3': return r.chapterMeans[2] ?? -1; case 'ci': return r.imperativeSummary.metRate ?? -1;
  }
}

export async function renderCotations(root: HTMLElement): Promise<void> {
  const all = await window.api.cotationGeneralView();
  let sortKey: SortKey = 'cabinet';
  let sortAsc = true;
  let filter = '';

  function rowHtml(r: CotationCabinetRow): string {
    return `<tr class="cot-row" data-cabinet="${escapeHtml(r.cabinet)}">
      <td>${escapeHtml(r.cabinet)}</td><td>${r.nStructures}</td><td>${RELIA[r.reliability]}</td>
      <td>${pct(r.gradeShare.A)}</td><td>${pct(r.gradeShare.B)}</td><td>${pct(r.gradeShare.C)}</td><td>${pct(r.gradeShare.D)}</td>
      <td>${d2(r.chapterMeans[0])}</td><td>${d2(r.chapterMeans[1])}</td><td>${d2(r.chapterMeans[2])}</td>
      <td>${rate(r.imperativeSummary.metRate)}</td></tr>`;
  }

  function drawGeneral(): void {
    // Structure rendue UNE seule fois : l'input du filtre n'est jamais détaché
    // (seul le <tbody> est re-render dans renderRows), donc focus et caret restent
    // naturellement en place pendant la saisie.
    root.innerHTML = `<section id="cot-view-general">
      <h2>Cotations — vue générale</h2>
      <div style="${TOOLBAR}">
        <input id="cot-filter" type="search" placeholder="Rechercher un cabinet…" value="${escapeHtml(filter)}">
        <button id="cot-export-csv">Exporter (CSV)</button>
        <button id="cot-export-pdf">Exporter (PDF)</button>
        <span id="cot-export-status" class="note"></span>
      </div>
      <p class="note"><span id="cot-count">0</span> cabinets · grades A/B/C/D en %, cotations de chapitre 1 à 4, critères impératifs atteints. Cliquez un cabinet pour son profil détaillé.</p>
      <table id="cot-general"><thead><tr>
        <th data-sort="cabinet">Cabinet</th><th data-sort="nStructures">n</th><th>Fiab.</th>
        <th data-sort="A">A%</th><th data-sort="B">B%</th><th data-sort="C">C%</th><th data-sort="D">D%</th>
        <th data-sort="ch1">Ch.1</th><th data-sort="ch2">Ch.2</th><th data-sort="ch3">Ch.3</th><th data-sort="ci">CI atteints</th>
      </tr></thead><tbody></tbody></table></section>`;

    const tbody = root.querySelector<HTMLElement>('#cot-general tbody')!;
    const countEl = root.querySelector<HTMLElement>('#cot-count')!;

    function renderRows(): void {
      const shown = all
        .filter((r) => r.cabinet.toLowerCase().includes(filter))
        .sort((a, b) => {
          const va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
          const c = va < vb ? -1 : va > vb ? 1 : 0;
          return sortAsc ? c : -c;
        });
      tbody.innerHTML = shown.map(rowHtml).join('');
      countEl.textContent = String(shown.length);
      // Le tbody vient d'être re-render → (ré)attache le clic sur les nouvelles lignes.
      tbody.querySelectorAll<HTMLElement>('.cot-row').forEach((tr) =>
        tr.addEventListener('click', () => void drawProfile(tr.dataset['cabinet']!)));
    }

    const filterEl = root.querySelector<HTMLInputElement>('#cot-filter')!;
    filterEl.addEventListener('input', () => { filter = filterEl.value.trim().toLowerCase(); renderRows(); });
    root.querySelectorAll<HTMLElement>('th[data-sort]').forEach((th) =>
      th.addEventListener('click', () => {
        const k = th.dataset['sort'] as SortKey;
        if (k === sortKey) sortAsc = !sortAsc; else { sortKey = k; sortAsc = true; }
        renderRows();
      }));
    root.querySelector('#cot-export-csv')!.addEventListener('click', () => void exportGeneral('csv'));
    root.querySelector('#cot-export-pdf')!.addEventListener('click', () => void exportGeneral('pdf'));

    renderRows();
  }

  async function exportGeneral(format: 'csv' | 'pdf'): Promise<void> {
    const status = root.querySelector<HTMLElement>('#cot-export-status')!;
    const buttons = root.querySelectorAll<HTMLButtonElement>('#cot-export-csv, #cot-export-pdf');
    const dir = await window.api.pickOutputDir();
    if (!dir) return;
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = 'Export…';
    try { status.textContent = `Écrit : ${await window.api.exportCotationsGeneral(dir, format)}`; }
    catch (e) { status.textContent = `Erreur : ${(e as Error).message}`; }
    finally { buttons.forEach((b) => (b.disabled = false)); }
  }

  async function drawProfile(cabinet: string): Promise<void> {
    const p = await window.api.cotationCabinetProfile(cabinet);
    if (!p) { drawGeneral(); return; }
    root.innerHTML = `<section id="cot-view-cabinet">
      <button id="cot-back">← Vue générale</button>
      <h2>Profil de cotation — ${escapeHtml(p.cabinet)}</h2>
      <div style="${TOOLBAR}">
        <button id="cot-export-csv">Exporter les structures (CSV)</button>
        <button id="cot-export-pdf">Exporter le profil (PDF)</button>
        <span id="cot-export-status" class="note"></span>
      </div>
      <p class="note">${p.nStructures} structures · fiabilité ${RELIA[p.reliability]} · grades
        A ${pct(p.gradeShare.A)}% / B ${pct(p.gradeShare.B)}% / C ${pct(p.gradeShare.C)}% / D ${pct(p.gradeShare.D)}%
        · chapitres ${d2(p.chapterMeans[0])} / ${d2(p.chapterMeans[1])} / ${d2(p.chapterMeans[2])}</p>
      <div id="cot-profile">
        <h3>Critères impératifs (18 exposés dans l'open data)</h3>
        <table><thead><tr><th>Critère</th><th>Cotation moyenne (1-4)</th><th>Structures concernées</th></tr></thead>
        <tbody>${p.imperatives.map((im) => `<tr><td>${escapeHtml(im.code)}</td><td>${d2(im.mean)}</td><td>${im.nStructures}</td></tr>`).join('')}</tbody></table>
        <h3>Structures évaluées (${p.establishments.length})</h3>
        <table><thead><tr><th>Structure</th><th>Commune</th><th>Grade</th><th>Ch.1</th><th>Ch.2</th><th>Ch.3</th></tr></thead>
        <tbody>${p.establishments.map((e) => `<tr><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.commune)}</td><td>${e.grade ?? '—'}</td><td>${d2(e.chapters[0])}</td><td>${d2(e.chapters[1])}</td><td>${d2(e.chapters[2])}</td></tr>`).join('')}</tbody></table>
      </div></section>`;
    root.querySelector('#cot-back')!.addEventListener('click', () => drawGeneral());
    root.querySelector('#cot-export-csv')!.addEventListener('click', () => void exportCabinet(p.cabinet, 'csv'));
    root.querySelector('#cot-export-pdf')!.addEventListener('click', () => void exportCabinet(p.cabinet, 'pdf'));
  }

  async function exportCabinet(cabinet: string, format: 'csv' | 'pdf'): Promise<void> {
    const status = root.querySelector<HTMLElement>('#cot-export-status')!;
    const buttons = root.querySelectorAll<HTMLButtonElement>('#cot-export-csv, #cot-export-pdf');
    const dir = await window.api.pickOutputDir();
    if (!dir) return;
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = 'Export…';
    try { status.textContent = `Écrit : ${await window.api.exportCotationCabinet(cabinet, dir, format)}`; }
    catch (e) { status.textContent = `Erreur : ${(e as Error).message}`; }
    finally { buttons.forEach((b) => (b.disabled = false)); }
  }

  drawGeneral();
}
