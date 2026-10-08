import { renderCotations } from './screens/cotations';
import { renderFiches } from './screens/fiches';
import { renderCabinet } from './screens/cabinet';
import { renderFicheCabinet } from './screens/fiche-cabinet';
import { renderAccreditations } from './screens/accreditations';
import { renderRegistre } from './screens/registre';
import { renderReglages } from './screens/reglages';
import { frDate } from './util';
import { creerNavigation } from './navigation';

const screens: Record<string, (root: HTMLElement) => void | Promise<void>> = {
  cotations: renderCotations,
  cabinet: renderCabinet,
  fiches: renderFiches,
  'fiche-cabinet': renderFicheCabinet,
  accreditations: renderAccreditations,
  registre: renderRegistre,
  reglages: renderReglages,
};

// Chaque navigation confie à l'écran un conteneur neuf : un rendu périmé
// (appel lent terminé après un changement d'onglet) écrit hors du document.
const hote = document.getElementById('screen');
const showScreen = hote
  ? creerNavigation<HTMLElement>({
      hote,
      creerConteneur: () => document.createElement('div'),
      onglets: () => document.querySelectorAll<HTMLElement>('nav button'),
      ecrans: screens,
    })
  : async (): Promise<void> => undefined;

async function initBanner(): Promise<void> {
  const el = document.getElementById('data-date');
  if (!el) return;
  try {
    const meta = await window.api.getMeta();
    el.textContent = `Données HAS du ${frDate(meta.hasSyncedAt)} · FINESS du ${frDate(meta.finessSnapshotMax)}`;
  } catch {
    el.textContent = 'Données indisponibles';
  }
}

document.querySelectorAll('nav button').forEach((b) =>
  b.addEventListener('click', () => void showScreen((b as HTMLElement).dataset['screen']!)),
);

// Progression des mises à jour des données (au lancement, ou manuelle depuis les Réglages).
window.api.onRefreshProgress((msg) => {
  const rs = document.getElementById('refresh-status');
  if (rs) rs.textContent = msg;
});

// Nouveau jeu en place (rafraîchissement automatique ou manuel) : bandeau des dates relu.
window.api.onDonneesRechargees(() => void initBanner());

void initBanner();
void showScreen('cotations');
