import { escapeHtml } from '../util';
import type { Settings } from '../../main/settings';

/** Écran Réglages : seuil α (0,05 défaut), mise à jour auto, dossier de sortie. */
export async function renderReglages(root: HTMLElement): Promise<void> {
  const s = await window.api.getSettings();
  const cur: Settings = { ...s };

  root.innerHTML = `
    <h2>Réglages</h2>
    <fieldset>
      <legend>Seuil de significativité (α)</legend>
      <label><input type="radio" name="alpha" id="alpha-005" ${cur.alpha === 0.05 ? 'checked' : ''}/> 0,05 &nbsp;(défaut, convention scientifique classique)</label><br/>
      <label><input type="radio" name="alpha" id="alpha-001" ${cur.alpha === 0.01 ? 'checked' : ''}/> 0,01 &nbsp;(plus exigeant)</label>
      <p class="note">La valeur p exacte est toujours affichée et imprimée sur chaque PDF ;
        ce réglage ne change que le seuil de décision.</p>
    </fieldset>
    <fieldset>
      <legend>Mise à jour automatique</legend>
      <label><input type="checkbox" id="autoupdate" ${cur.autoUpdate ? 'checked' : ''}/>
        Télécharger les données publiques fraîches au lancement (data.gouv.fr / HAS) et
        archiver la version précédente.</label>
    </fieldset>
    <fieldset>
      <legend>Dossier de sortie par défaut</legend>
      <button id="pick-out">Choisir…</button>
      <span id="out-default" class="note">${cur.outputDir ? escapeHtml(cur.outputDir) : 'Aucun'}</span>
    </fieldset>
  `;

  const persist = (): void => void window.api.setSettings(cur);

  root.querySelector('#alpha-005')!.addEventListener('change', () => {
    cur.alpha = 0.05;
    persist();
  });
  root.querySelector('#alpha-001')!.addEventListener('change', () => {
    cur.alpha = 0.01;
    persist();
  });
  root.querySelector('#autoupdate')!.addEventListener('change', (e) => {
    cur.autoUpdate = (e.target as HTMLInputElement).checked;
    persist();
  });
  root.querySelector('#pick-out')!.addEventListener('click', async () => {
    const dir = await window.api.pickOutputDir();
    if (dir) {
      cur.outputDir = dir;
      (root.querySelector('#out-default') as HTMLElement).textContent = dir;
      persist();
    }
  });
}
