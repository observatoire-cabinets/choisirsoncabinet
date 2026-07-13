import { renderCotations } from './screens/cotations';
import { renderFiches } from './screens/fiches';
import { renderCabinet } from './screens/cabinet';
import { renderFicheCabinet } from './screens/fiche-cabinet';
import { renderRegistre } from './screens/registre';
import { renderReglages } from './screens/reglages';
import { frDate } from './util';

const screens: Record<string, (root: HTMLElement) => void | Promise<void>> = {
  cotations: renderCotations,
  cabinet: renderCabinet,
  fiches: renderFiches,
  'fiche-cabinet': renderFicheCabinet,
  registre: renderRegistre,
  reglages: renderReglages,
};

async function showScreen(id: string): Promise<void> {
  const root = document.getElementById('screen');
  if (!root) return;
  root.innerHTML = '';
  document.querySelectorAll('nav button').forEach((b) =>
    b.classList.toggle('active', (b as HTMLElement).dataset['screen'] === id),
  );
  await screens[id]?.(root);
}

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

// Progression de la mise à jour au lancement (le cas échéant).
window.api.onRefreshProgress((msg) => {
  const rs = document.getElementById('refresh-status');
  if (rs) rs.textContent = msg;
});

void initBanner();
void showScreen('cotations');
