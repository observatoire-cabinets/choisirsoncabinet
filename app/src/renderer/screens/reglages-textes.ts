/**
 * Libellés de l'écran Réglages : fonctions pures (aucun accès au DOM),
 * testées sous vitest. Imports `type` uniquement.
 */
import type { AppUpdateState } from '../../main/app-update';
import type { MiseAJourDonneesResultat } from '../../main/autoupdate';
import type { RunCollecteResult } from '../../main/collecte-run';

/** État de la mise à jour du logiciel, tel qu'affiché dans la note d'état. */
export function libelleEtatLogiciel(upd: AppUpdateState, autoUpdate: boolean): string {
  switch (upd.etat) {
    case 'prete':
      return `version ${upd.versionDisponible ?? ''} téléchargée — installée à la prochaine fermeture`;
    case 'telechargement':
      return 'téléchargement d’une nouvelle version…';
    case 'indisponible':
      return 'vérification indisponible (hors ligne ?)';
    case 'portable':
      return `mise à jour automatique non disponible en version portable${autoUpdate ? ' — les données se mettent à jour normalement' : ''}`;
    case 'non-verifie':
      return 'mise à jour du logiciel non vérifiée';
    case 'desactivee':
      return 'mise à jour automatique du logiciel désactivée';
    case 'a-jour':
      return 'application à jour';
  }
}

/**
 * Segment « logiciel » de la note d'état : préfixé « logiciel : », sauf pour les
 * libellés qui nomment déjà le logiciel (non vérifiée, désactivée).
 */
export function segmentEtatLogiciel(upd: AppUpdateState, autoUpdate: boolean): string {
  const libelle = libelleEtatLogiciel(upd, autoUpdate);
  return upd.etat === 'non-verifie' || upd.etat === 'desactivee' ? libelle : `logiciel : ${libelle}`;
}

const LISTE: Record<RunCollecteResult['liste'], string> = {
  archive: 'nouveau relevé archivé',
  inchange: 'inchangée',
  delta_refuse: 'document archivé, lecture non concluante (aucune comparaison faite)',
  echec: 'relevé impossible, l’archive locale reste servie',
  deja_fait: 'déjà relevée aujourd’hui',
};

const COFRAC: Record<RunCollecteResult['cofrac'], string> = {
  archive: 'nouveau relevé archivé',
  inchange: 'inchangé',
  echec: 'relevé impossible, l’archive locale reste servie',
  deja_fait: 'déjà relevé aujourd’hui',
};

/** Résumé en clair de la mise à jour manuelle des données. */
export function libelleMiseAJourDonnees(r: MiseAJourDonneesResultat): string {
  if (r.etat === 'hors-ligne') return 'Hors ligne : rien n’a été tenté.';
  const collecte =
    r.collecte === 'skipped'
      ? 'Liste HAS et COFRAC : collecte déjà en cours, rien n’a été relancé'
      : `Liste HAS : ${LISTE[r.collecte.liste]} · COFRAC : ${COFRAC[r.collecte.cofrac]}`;
  const donnees = r.donnees.ok
    ? `données Synaé/FINESS : à jour${r.donnees.note ? ` (${r.donnees.note})` : ''}`
    : `données Synaé/FINESS : mise à jour impossible (${r.donnees.message}), données actuelles conservées`;
  return `${collecte} · ${donnees}`;
}

/** Échec de l'appel lui-même : message sans enveloppe technique ni pile. */
export function libelleErreurMiseAJour(e: unknown): string {
  const brut = e instanceof Error ? e.message : String(e);
  const ligne = (brut.split(/\r?\n/)[0] ?? '')
    .replace(/^Error invoking remote method '[^']*': /, '')
    .replace(/^(?:[A-Za-z]*Error: )+/, '')
    .trim();
  return `Mise à jour impossible : ${ligne || 'cause non précisée'}`;
}
