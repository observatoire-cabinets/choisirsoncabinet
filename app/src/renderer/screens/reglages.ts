import { escapeHtml, frDate } from '../util';
import type { Settings } from '../../main/settings';
import type { MiseAJourDonneesResultat } from '../../main/autoupdate';
import { segmentEtatLogiciel, libelleMiseAJourDonnees, libelleErreurMiseAJour } from './reglages-textes';

/** Écran Réglages : seuil α (0,05 défaut), mise à jour auto, mise à jour manuelle des données, dossier de sortie. */
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
        Activée (données publiques, liste HAS, relevé COFRAC et logiciel)</label>
      <p class="note">Désactiver supprime la tâche planifiée quotidienne et coupe toute connexion automatique.
        La mise à jour manuelle des données ci-dessous reste disponible.</p>
      <p class="note" id="set-etat-collecte">Chargement…</p>
    </fieldset>
    <fieldset>
      <legend>Mise à jour manuelle des données</legend>
      <button id="maj-donnees">Mettre à jour les données maintenant</button>
      <p class="note">Relève la liste HAS et la page COFRAC (si ce n’est pas déjà fait aujourd’hui),
        puis retélécharge les données Synaé/FINESS. Connexion requise ; le logiciel n’est pas concerné.</p>
      <p class="note" id="maj-donnees-statut" role="status" aria-live="polite"></p>
    </fieldset>
    <fieldset>
      <legend>Dossier de sortie par défaut</legend>
      <button id="pick-out">Choisir…</button>
      <span id="out-default" class="note">${cur.outputDir ? escapeHtml(cur.outputDir) : 'Aucun'}</span>
    </fieldset>
  `;

  const persist = (): void => void window.api.setSettings(cur);

  const etatCollecteEl = root.querySelector('#set-etat-collecte') as HTMLElement;

  /** Recharge et réaffiche l'état des collectes (instantané, liste HAS, COFRAC, logiciel). */
  async function refreshEtatCollecte(): Promise<void> {
    try {
      const [meta, acc, upd] = await Promise.all([
        window.api.getMeta(),
        window.api.accreditations(),
        window.api.appUpdateState(),
      ]);
      const updLabel = segmentEtatLogiciel(upd, cur.autoUpdate);
      const collecteLabel = acc.collecte.sourceIntrouvableDepuis
        ? ` · SOURCE DE LA LISTE INTROUVABLE depuis le ${frDate(acc.collecte.sourceIntrouvableDepuis)} — l'archive locale reste servie`
        : '';
      const prochaineLabel = acc.collecte.prochaineCollecte
        ? ` · prochaine collecte vers ${acc.collecte.prochaineCollecte}`
        : '';
      etatCollecteEl.textContent =
        `Instantané Synaé/FINESS du ${frDate(meta.builtAt.slice(0, 10))} · ` +
        `dernier relevé de liste HAS : ${acc.dernierEtat ? frDate(acc.dernierEtat) : '—'} · ` +
        `dernier relevé COFRAC : ${acc.dernierReleveCofrac ? frDate(acc.dernierReleveCofrac) : '—'} · ` +
        `${updLabel}${collecteLabel}${prochaineLabel}`;
    } catch (e) {
      // La note d'état ne casse jamais l'écran : l'erreur est dite, sobrement.
      etatCollecteEl.textContent = `Erreur : ${(e as Error).message}`;
    }
  }
  void refreshEtatCollecte();

  root.querySelector('#alpha-005')!.addEventListener('change', () => {
    cur.alpha = 0.05;
    persist();
  });
  root.querySelector('#alpha-001')!.addEventListener('change', () => {
    cur.alpha = 0.01;
    persist();
  });
  const autoupdateCb = root.querySelector('#autoupdate') as HTMLInputElement;
  autoupdateCb.addEventListener('change', async (e) => {
    cur.autoUpdate = (e.target as HTMLInputElement).checked;
    // Bascule de la tâche planifiée = appel PowerShell côté main (sérialisé, mais
    // pouvant prendre quelques secondes) : la case est désactivée le temps de l'attente,
    // avec un retour discret dans la note d'état, pour éviter les doubles clics.
    autoupdateCb.disabled = true;
    etatCollecteEl.textContent = 'Mise à jour du réglage en cours…';
    try {
      await window.api.setSettings(cur);
    } finally {
      autoupdateCb.disabled = false;
      await refreshEtatCollecte();
    }
  });
  const majBtn = root.querySelector('#maj-donnees') as HTMLButtonElement;
  const majStatut = root.querySelector('#maj-donnees-statut') as HTMLElement;
  /**
   * Opération réseau de durée variable : bouton désactivé jusqu'à son issue ;
   * la progression détaillée s'affiche aussi sous le bandeau des dates.
   * `operation` rend le résumé, ou null si la mise à jour rejointe s'est
   * terminée entre-temps (son issue n'est alors plus disponible ici).
   */
  async function suivreMiseAJour(
    operation: () => Promise<MiseAJourDonneesResultat | null>,
  ): Promise<void> {
    majBtn.disabled = true;
    majStatut.textContent = 'Mise à jour en cours…';
    try {
      const r = await operation();
      majStatut.textContent = r ? libelleMiseAJourDonnees(r) : '';
    } catch (e) {
      majStatut.textContent = libelleErreurMiseAJour(e);
    } finally {
      majBtn.disabled = false;
      await refreshEtatCollecte();
    }
  }
  majBtn.addEventListener('click', () => void suivreMiseAJour(() => window.api.miseAJourDonnees()));
  // Écran rouvert pendant une mise à jour lancée plus tôt : l'état en cours est
  // réaffiché et l'issue attendue, sans lancer de nouvelle opération.
  void window.api
    .miseAJourDonneesEnCours()
    .then((enCours) => {
      if (enCours) void suivreMiseAJour(() => window.api.rejoindreMiseAJourDonnees());
    })
    .catch(() => {});
  root.querySelector('#pick-out')!.addEventListener('click', async () => {
    const dir = await window.api.pickOutputDir();
    if (dir) {
      cur.outputDir = dir;
      (root.querySelector('#out-default') as HTMLElement).textContent = dir;
      persist();
    }
  });
}
