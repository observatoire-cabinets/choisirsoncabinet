/** Onglet Accréditations : statut des cabinets sur la liste HAS, chronologie, journal des sorties. */
import { escapeHtml, frDate } from '../util';
import type { AccreditationsView, CabinetStatut, StatutCabinet } from '../../../../core/accreditations';

const TOOLBAR = 'margin:8px 0; display:flex; gap:12px; align-items:center; flex-wrap:wrap;';

const STATUTS: Record<StatutCabinet, string> = {
  accredite: 'Accrédité',
  'autorise-sans-numero': 'Autorisé sans accréditation',
  sorti: 'Sorti de liste',
  'sorti-avec-numero': 'Sorti en portant un numéro',
  'sorti-concordance-cofrac': 'Sorti — concordance COFRAC',
  'jamais-observe': 'Jamais observé sur la liste',
  'non-rapproche': 'Non rapproché',
};

const BADGE: Record<StatutCabinet, string> = {
  accredite: '#2e7d32',
  'autorise-sans-numero': '#ef6c00',
  sorti: '#616161',
  'sorti-avec-numero': '#616161',
  'sorti-concordance-cofrac': '#c62828',
  'jamais-observe': '#9e9e9e',
  'non-rapproche': '#9e9e9e',
};

const dateFr = (iso: string | null): string => (iso ? frDate(iso) : '—');

export async function renderAccreditations(root: HTMLElement): Promise<void> {
  root.innerHTML = '<p class="note">Chargement de la liste HAS…</p>';
  let view: AccreditationsView;
  try {
    view = await window.api.accreditations();
  } catch (e) {
    root.innerHTML = `<p class="note">Erreur : ${escapeHtml((e as Error).message)}</p>`;
    return;
  }

  let volet: 'statuts' | 'chronologie' | 'sorties' = 'statuts';
  let filter = '';
  let statutFilter: StatutCabinet | '' = '';

  function shell(): void {
    root.innerHTML = `<section id="acc">
      <h2>Accréditations — liste HAS des organismes autorisés</h2>
      <p class="note">Dernier relevé de liste : ${dateFr(view.dernierEtat)} ·
        dernier relevé COFRAC : ${dateFr(view.dernierReleveCofrac)} ·
        ${view.tauxRapprochement.rapproches}/${view.tauxRapprochement.total} cabinets rapprochés de la liste (par nom).${
          view.collecte.prochaineCollecte
            ? ` · Prochaine collecte vers ${view.collecte.prochaineCollecte}.`
            : ''
        }</p>
      ${
        view.collecte.sourceIntrouvableDepuis
          ? `<p class="note" style="color:#c62828"><strong>Source introuvable depuis le ${dateFr(view.collecte.sourceIntrouvableDepuis)}</strong> —
        les dernières collectes n'ont pas trouvé la liste ; l'archive locale reste servie telle quelle.</p>`
          : ''
      }
      <div style="${TOOLBAR}">
        <button id="acc-v-statuts">① Statut des cabinets</button>
        <button id="acc-v-chronologie">② Chronologie de la liste</button>
        <button id="acc-v-sorties">③ Journal des sorties</button>
        <span style="flex:1"></span>
        <button id="acc-export-csv">Exporter le volet (CSV)</button>
        <button id="acc-export-pdf">Exporter le volet (PDF)</button>
        <button id="acc-export-synthese">Synthèse (PDF)</button>
        <span id="acc-export-status" class="note"></span>
      </div>
      <div id="acc-content"></div>
      <details class="note"><summary>Réserves de méthode — clé de lecture</summary><ul>
        <li>Une sortie de liste est un fait constaté entre deux relevés ; la source n'en indique jamais le motif. Ne jamais lire « retiré », « suspendu » ni « radié » : lire « sorti de liste, motif non indiqué ».</li>
        <li>Une absence d'observation n'est pas une observation d'absence : entre deux relevés, un mouvement n'est datable que par sa fenêtre. La période du 24/09/2023 au 06/03/2026 (894 jours) n'est pas observée.</li>
        <li>Un rapprochement par nom est une piste à confirmer, jamais une continuité juridique. Une concordance COFRAC est une concordance documentaire datée, pas un jugement.</li>
        <li>Figurer sur la liste n'implique pas d'exercer ; en sortir n'implique ni cessation ni faute.</li>
      </ul></details>
    </section>`;

    root.querySelector('#acc-v-statuts')!.addEventListener('click', () => { volet = 'statuts'; draw(); });
    root.querySelector('#acc-v-chronologie')!.addEventListener('click', () => { volet = 'chronologie'; draw(); });
    root.querySelector('#acc-v-sorties')!.addEventListener('click', () => { volet = 'sorties'; draw(); });
    root.querySelector('#acc-export-csv')!.addEventListener('click', () => void doExport('csv'));
    root.querySelector('#acc-export-pdf')!.addEventListener('click', () => void doExport('pdf'));
    root.querySelector('#acc-export-synthese')!.addEventListener('click', () => void doExport('pdf', true));
    draw();
  }

  async function doExport(format: 'csv' | 'pdf', synthese = false): Promise<void> {
    const status = root.querySelector<HTMLElement>('#acc-export-status')!;
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      '#acc-export-csv, #acc-export-pdf, #acc-export-synthese',
    );
    const dir = await window.api.pickOutputDir();
    if (!dir) return;
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = 'Export…';
    try {
      // CSV et PDF exportent le volet COURANT ; le bouton Synthèse exporte les trois.
      const v = synthese ? 'synthese' : volet;
      status.textContent = `Écrit : ${await window.api.exportAccreditations(v, dir, format)}`;
    } catch (e) {
      status.textContent = `Erreur : ${(e as Error).message}`;
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  const badge = (s: StatutCabinet): string =>
    `<span style="color:#fff;background:${BADGE[s]};border-radius:4px;padding:1px 6px;font-size:11px;white-space:nowrap">${STATUTS[s]}</span>`;

  function draw(): void {
    const content = root.querySelector<HTMLElement>('#acc-content')!;
    if (volet === 'statuts') drawStatuts(content);
    else if (volet === 'chronologie') drawChronologie(content);
    else drawSorties(content);
  }

  function drawStatuts(content: HTMLElement): void {
    // Cas signal en tête : sortis en portant un numéro (rouge inclus).
    const signal = view.statuts.filter(
      (s) => s.statut === 'sorti-avec-numero' || s.statut === 'sorti-concordance-cofrac',
    );
    content.innerHTML = `
      ${signal.length ? `<p class="note"><strong>${signal.length} organisme(s) sortis de la liste en portant un numéro d'accréditation</strong> — motif non indiqué par la source ; concordance COFRAC affichée quand constatée.</p>` : ''}
      ${view.entreesListeSansEvaluations ? `<p class="note">${view.entreesListeSansEvaluations} entrée(s) de la liste sans évaluations publiées dans Synaé — situation normale d'un organisme autorisé n'ayant pas encore publié.</p>` : ''}
      <div style="${TOOLBAR}">
        <input id="acc-filter" type="search" placeholder="Rechercher un cabinet…" value="${escapeHtml(filter)}">
        <select id="acc-statut-filter">
          <option value="">Tous les statuts</option>
          ${(Object.keys(STATUTS) as StatutCabinet[]).map((k) => `<option value="${k}" ${k === statutFilter ? 'selected' : ''}>${STATUTS[k]}</option>`).join('')}
        </select>
        <span class="note"><span id="acc-count">0</span> cabinets</span>
      </div>
      <table id="acc-statuts"><thead><tr>
        <th>Cabinet</th><th>Statut</th><th>N°</th><th>SIREN</th><th>Présent au</th><th>Absent au</th><th>Concordance COFRAC</th>
      </tr></thead><tbody></tbody></table>`;

    const tbody = content.querySelector<HTMLElement>('#acc-statuts tbody')!;
    const countEl = content.querySelector<HTMLElement>('#acc-count')!;
    const renderRows = (): void => {
      const shown = view.statuts
        .filter((s) => s.cabinet.toLowerCase().includes(filter))
        .filter((s) => !statutFilter || s.statut === statutFilter);
      tbody.innerHTML = shown
        .map(
          (s: CabinetStatut) => `<tr>
        <td>${escapeHtml(s.cabinet)}</td>
        <td>${badge(s.statut)}</td>
        <td>${escapeHtml(s.num ?? '—')}</td>
        <td>${escapeHtml(s.siren ?? '—')}</td>
        <td>${dateFr(s.dernierEtatPresent)}</td>
        <td>${dateFr(s.premierEtatAbsent)}</td>
        <td>${s.concordanceDate ? `constatée le ${dateFr(s.concordanceDate)}${s.concordance?.commentaire ? ' — ' + escapeHtml(s.concordance.commentaire) : ''}` : '—'}</td>
      </tr>`,
        )
        .join('');
      countEl.textContent = String(shown.length);
    };
    const filterEl = content.querySelector<HTMLInputElement>('#acc-filter')!;
    filterEl.addEventListener('input', () => { filter = filterEl.value.trim().toLowerCase(); renderRows(); });
    const statutEl = content.querySelector<HTMLSelectElement>('#acc-statut-filter')!;
    statutEl.addEventListener('change', () => { statutFilter = statutEl.value as StatutCabinet | ''; renderRows(); });
    renderRows();
  }

  function drawChronologie(content: HTMLElement): void {
    content.innerHTML = `
      <p class="note">Effectifs de la liste par relevé, avec les points des bilans annuels HAS (au 31/12 —
        arrêtés à une autre date que les relevés : non comparables au jour près). La période du
        24/09/2023 au 06/03/2026 (894 jours) est <strong>non observée</strong> : aucun mouvement n'y est datable.</p>
      <table id="acc-chrono"><thead><tr>
        <th>Date</th><th>Type</th><th>Organismes</th><th>Accrédités</th><th>Sans numéro</th><th>Part sans numéro</th><th>Source</th>
      </tr></thead><tbody>
      ${view.chronologie
        .map((c) => {
          const part =
            c.organismes && c.sansNumero !== null
              ? `${Math.round((c.sansNumero / c.organismes) * 100)} %`
              : '—';
          return `<tr>
            <td>${dateFr(c.date)}</td>
            <td>${c.kind === 'etat' ? 'relevé' : 'bilan annuel'}</td>
            <td>${c.organismes ?? '—'}</td><td>${c.accredites ?? '—'}</td>
            <td>${c.sansNumero ?? '—'}</td><td>${part}</td>
            <td class="note">${escapeHtml(c.source)}</td>
          </tr>`;
        })
        .join('')}
      </tbody></table>
      <h3 style="margin-top:18px">Mouvements entre relevés consécutifs</h3>
      <table id="acc-mouvements"><thead><tr>
        <th>Fenêtre</th><th>Durée (jours)</th><th>Effectif</th><th>Entrées</th><th>Sorties</th>
      </tr></thead><tbody>
      ${view.mouvements
        .map(
          (m) => `<tr${m.jours > 400 ? ' style="color:var(--muted)"' : ''}>
          <td>${dateFr(m.de)} → ${dateFr(m.a)}${m.jours > 400 ? ' (période non observée)' : ''}</td>
          <td>${m.jours}</td><td>${m.avant} → ${m.apres}</td><td>${m.entrees}</td><td>${m.sorties}</td>
        </tr>`,
        )
        .join('')}
      </tbody></table>
      ${
        view.faitsBilans.length
          ? `<details class="note" open><summary>Faits datés publiés par les bilans annuels HAS</summary><ul>
        ${view.faitsBilans.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
      </ul></details>`
          : ''
      }`;
  }

  function drawSorties(content: HTMLElement): void {
    content.innerHTML = `
      <p class="note">Une sortie est un fait constaté entre deux relevés — <strong>motif non indiqué par la source</strong>.
        Les rapprochements par nom sont des pistes à confirmer, jamais des continuités juridiques.</p>
      <table id="acc-sorties"><thead><tr>
        <th>Nom (dernier connu)</th><th>SIREN</th><th>N°</th><th>Dép.</th><th>Présent au</th><th>Absent au</th><th>Revenu</th><th>Concordance COFRAC</th><th>Piste ⚠️</th>
      </tr></thead><tbody>
      ${view.sorties
        .map(
          (s) => `<tr>
          <td>${escapeHtml(s.nom)}</td><td>${escapeHtml(s.siren)}</td>
          <td>${s.num ? `<strong>${escapeHtml(s.num)}</strong>` : '—'}</td>
          <td>${escapeHtml(s.dept)}</td>
          <td>${dateFr(s.dernierPresent)}</td><td>${dateFr(s.premierAbsent)}</td>
          <td>${s.revenu ? 'revenu en liste' : ''}</td>
          <td>${s.concordanceDate ? `constatée le ${dateFr(s.concordanceDate)}` : '—'}</td>
          <td class="note">${s.piste ? `${escapeHtml(s.piste.revenuNom)} (${escapeHtml(s.piste.lecture)}) — à confirmer` : ''}</td>
        </tr>`,
        )
        .join('')}
      </tbody></table>`;
  }

  shell();
}
