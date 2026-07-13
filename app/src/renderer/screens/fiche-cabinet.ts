import { frDate, escapeHtml } from '../util';
import type { FicheCabinetData } from '../../../../core/cabinet-fiche';
import type { FicheCabinetHistory } from '../../../../core/cabinet-fiche-history';

const RELIA: Record<string, string> = { fiable: 'suffisante', tendance: 'à confirmer', descriptif: 'limitée' };
const d2 = (x: number | null): string => (x === null ? '—' : x.toFixed(2).replace('.', ','));
const signed = (x: number | null): string =>
  x === null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', ',');
const pct = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)} %`);

/**
 * Écran Fiche cabinet : portrait de synthèse mono-cabinet (niveau global, 7 axes,
 * portefeuille, résumés cotations/structures avec renvois) + historique mensuel
 * as-of avec PDF par mois à la demande. Formulation neutre (charte).
 */
export async function renderFicheCabinet(root: HTMLElement): Promise<void> {
  const cabinets = await window.api.listCabinets();
  root.innerHTML = `
    <h2>Fiche cabinet</h2>
    <label>Cabinet :
      <select id="fc-select">
        <option value="">— choisir —</option>
        ${cabinets.map((c) => `<option>${escapeHtml(c)}</option>`).join('')}
      </select>
    </label>
    <div id="fc-content"></div>
  `;
  const sel = root.querySelector('#fc-select') as HTMLSelectElement;
  const content = root.querySelector('#fc-content') as HTMLElement;

  sel.addEventListener('change', async () => {
    if (!sel.value) { content.innerHTML = ''; return; }
    content.innerHTML = '<p class="note">Calcul du portrait…</p>';
    try {
      const [fiche, history] = await Promise.all([
        window.api.ficheCabinet(sel.value),
        window.api.ficheCabinetHistory(sel.value),
      ]);
      if (!fiche) { content.innerHTML = '<p class="note">Aucune donnée pour ce cabinet.</p>'; return; }
      drawFiche(content, fiche, history);
    } catch (e) {
      content.innerHTML = `<p class="note">Erreur : ${escapeHtml((e as Error).message)}</p>`;
    }
  });
}

function drawFiche(content: HTMLElement, f: FicheCabinetData, h: FicheCabinetHistory | null): void {
  const c = f.cotations;
  const secteurs = (['PA', 'PH adultes', 'PH enfants', 'Autres'] as const)
    .map((s) => `${s} : ${f.portfolio.secteurCounts[s] ?? 0}`).join(' · ');

  content.innerHTML = `
    <p>Évaluations analysées : <strong>${f.n}</strong>
       · Fiabilité : <strong>${RELIA[f.reliability]}</strong>
       · Période couverte : <strong>${f.periodStart ? frDate(f.periodStart) : '—'}</strong>
         au <strong>${f.periodEnd ? frDate(f.periodEnd) : '—'}</strong></p>
    <div style="margin:8px 0; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
      <button id="fc-export">Exporter la fiche (PDF)</button>
      <span id="fc-export-status" class="note"></span>
    </div>

    <h3>1. Niveau global de notation</h3>
    <p>Écart moyen au national : <strong id="fc-niveau">${signed(f.niveauGlobal)}</strong> point(s)
       sur 100 (écart brut, non ajusté).</p>
    <p class="note">Moyenne des scores des structures évaluées par ce cabinet moins la moyenne nationale.
       Écart brut : il peut refléter la composition du portefeuille (secteur, statut, taille, région)
       plutôt qu'une tendance propre au cabinet — il ne se lit pas comme un jugement.</p>

    <h3>2. Profil sur les 7 axes de pratique</h3>
    <table id="fc-axes">
      <thead><tr><th>Axe</th><th>Écart (points)</th><th>Fiabilité</th><th>Signalé</th></tr></thead>
      <tbody>${f.axes.map((a) => `<tr>
        <td>${escapeHtml(a.label)}</td><td>${signed(a.gap)}</td>
        <td>${a.reliability ? RELIA[a.reliability] : '—'}</td>
        <td>${a.significant ? 'oui' : '—'}</td></tr>`).join('')}</tbody>
    </table>
    <p class="note">Écart de notation entre les deux groupes de chaque axe, au sein des évaluations de ce
       cabinet. Un axe n'est « signalé » que si l'effectif est suffisant (30/30), l'ampleur au moins
       petite (d ≥ 0,2), le sens cohérent avec l'écart national ajusté, et le test survivant à la
       correction de Holm. Axes signalés : <strong>${f.nSignificantAxes}</strong> sur ${f.axes.length}.</p>

    <h3>3. Portefeuille sectoriel</h3>
    <p>${secteurs}</p>
    <p>Secteur dominant : <strong>${f.portfolio.dominantSecteur ?? '—'}</strong>
       (${pct(f.portfolio.dominantShare)}) · Profil :
       <strong>${f.portfolio.specialized ? 'spécialisé' : 'généraliste'}</strong>
       · HHI : ${d2(f.portfolio.hhi)}</p>
    <p class="note">HHI proche de 1 = portefeuille concentré sur un secteur ; proche de 0,25 = réparti.
       « Spécialisé » si le secteur dominant représente au moins 60 % des évaluations.</p>

    <h3>4. Cotations publiées (résumé)</h3>
    ${c ? `<p>Grades : A ${pct(c.gradeShare.A)} / B ${pct(c.gradeShare.B)} / C ${pct(c.gradeShare.C)} / D ${pct(c.gradeShare.D)}
       · Cotations de chapitre (échelle 1 à 4) : ${d2(c.chapterMeans[0])} / ${d2(c.chapterMeans[1])} / ${d2(c.chapterMeans[2])}
       · Critères impératifs atteints : ${pct(c.imperativeSummary.metRate)}</p>`
      : '<p>Aucune structure scorée.</p>'}
    <p class="note">Telles que publiées dans l'open data. Détail complet → onglet <strong>Cotations</strong>.</p>

    <h3>5. Structures évaluées (résumé)</h3>
    <p><strong>${f.nStructures}</strong> structure(s) évaluée(s) avec score.
       Liste complète (noms, adresses, dates) → onglet <strong>Cabinet choisi</strong>.</p>

    <h3>6. Historique mensuel</h3>
    ${h && h.rows.length > 0 ? `
    <table id="fc-history">
      <thead><tr><th>Mois</th><th>n</th><th>Niveau global</th><th>% grade A</th><th>PDF</th></tr></thead>
      <tbody>${h.rows.map((r) => `<tr>
        <td>${r.month}</td><td>${r.n}</td><td>${signed(r.niveauGlobal)}</td><td>${pct(r.gradeAShare)}</td>
        <td><button class="fc-month-pdf" data-month="${r.month}">PDF</button></td></tr>`).join('')}</tbody>
    </table>
    <p class="note">Fiche reconstituée à la fin de chaque mois (évaluations closes à cette date). Le jeu
       public ne conservant que la dernière évaluation par structure, la reconstitution est approchée pour
       les rares structures réévaluées.${h.nUndated > 0
         ? ` ${h.nUndated} évaluation(s) sans date de clôture, exclue(s) de l'historique.` : ''}</p>`
      : '<p class="note">Aucune évaluation datée : historique indisponible.</p>'}

    <p class="note">Le score mesure le niveau de satisfaction des exigences du référentiel par la structure,
       tel que coté par l'évaluateur ; l'open data ne publie pas le contenu des rapports, la justesse de la
       cotation n'y est donc pas vérifiable. Un écart n'est un jugement ni sur les structures ni sur le
       travail du cabinet ; une association observée n'établit pas un lien de cause à effet.</p>
  `;

  const status = content.querySelector('#fc-export-status') as HTMLElement;
  const runExport = async (asOfMonth?: string): Promise<void> => {
    // Statut d'export partagé : on désactive TOUT le groupe (fiche courante +
    // mois) pendant la génération, comme dans l'onglet Cotations.
    const buttons = content.querySelectorAll<HTMLButtonElement>('#fc-export, .fc-month-pdf');
    const dir = await window.api.pickOutputDir();
    if (!dir) return;
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = 'Génération du PDF…';
    try {
      status.textContent = `PDF écrit : ${await window.api.exportFicheCabinet(f.cabinet, dir, asOfMonth)}`;
    } catch (e) {
      status.textContent = `Erreur : ${(e as Error).message}`;
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  };
  const exportBtn = content.querySelector('#fc-export') as HTMLButtonElement;
  exportBtn.addEventListener('click', () => void runExport());
  content.querySelectorAll<HTMLButtonElement>('.fc-month-pdf').forEach((b) =>
    b.addEventListener('click', () => void runExport(b.dataset['month']!)),
  );
}
