import { escapeHtml } from '../util';

/** Écran Fiches : génère les 12 fiches de l'Observatoire en PDF hors-ligne. */
export async function renderFiches(root: HTMLElement): Promise<void> {
  const [fiches, settings] = await Promise.all([window.api.fiches(), window.api.getSettings()]);
  const alphaLabel = settings.alpha === 0.01 ? '0,01' : '0,05';
  let outDir: string | null = settings.outputDir;

  root.innerHTML = `
    <h2>Générer les fiches de l'Observatoire</h2>
    <p class="note">12 fiches PDF (mono/multi, statut juridique, région, secteur, capacité,
      groupe lucratif, temporel, établissement/service, DROM + synthèses), avec classements
      nominatifs par cabinet et guide de lecture des méthodes inclus.</p>
    <div id="fiche-list"></div>
    <div style="margin-top:16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
      <button id="pick-dir">Choisir le dossier de sortie…</button>
      <span id="out-dir" class="note"></span>
    </div>
    <div style="margin-top:16px;">
      <button id="generate" class="primary" disabled>Générer</button>
      <div id="gen-status" class="note"></div>
    </div>
    <p class="note">Seuil actif : α = ${alphaLabel} (modifiable dans Réglages).
      La valeur p exacte est toujours affichée et imprimée sur chaque PDF.</p>
  `;

  const list = root.querySelector('#fiche-list')!;
  list.innerHTML = fiches
    .map(
      (f) =>
        `<label style="display:block; margin:2px 0;"><input type="checkbox" class="fiche-cb" value="${f.numero}" checked /> ${f.numero}. ${escapeHtml(f.titre)} <span class="note">(${escapeHtml(f.famille)})</span></label>`,
    )
    .join('');

  const genBtn = root.querySelector('#generate') as HTMLButtonElement;
  const outSpan = root.querySelector('#out-dir')!;
  const status = root.querySelector('#gen-status')!;
  outSpan.textContent = outDir ?? 'Aucun dossier choisi';

  const refreshGenState = (): void => {
    genBtn.disabled = !outDir;
  };
  refreshGenState();

  root.querySelector('#pick-dir')!.addEventListener('click', async () => {
    const dir = await window.api.pickOutputDir();
    if (dir) {
      outDir = dir;
      outSpan.textContent = dir;
      refreshGenState();
    }
  });

  genBtn.addEventListener('click', async () => {
    if (!outDir) return;
    const numeros = Array.from(root.querySelectorAll<HTMLInputElement>('.fiche-cb:checked')).map(
      (cb) => Number(cb.value),
    );
    if (numeros.length === 0) {
      status.textContent = 'Sélectionnez au moins une fiche.';
      return;
    }
    genBtn.disabled = true;
    status.textContent = `Génération de ${numeros.length} fiche(s)…`;
    try {
      const s = await window.api.getSettings();
      const res = await window.api.generateFiches({ numeros, outDir, alpha: s.alpha });
      status.textContent =
        `${res.written.length} PDF écrits dans ${outDir}.` +
        (res.warnings.length ? ` (${res.warnings.length} avertissement(s))` : '');
    } catch (e) {
      status.textContent = `Erreur : ${(e as Error).message}`;
    } finally {
      genBtn.disabled = false;
    }
  });
}
