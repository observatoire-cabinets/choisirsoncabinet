/**
 * Orchestration de la collecte côté application : liste HAS + relevé COFRAC,
 * sous verrou, avec l'heure « déjà fait aujourd'hui » gérée par store/collecte.
 * Jamais bloquant, jamais de throw : le résultat se lit dans l'archive.
 */
import { collecteListeHas, collecteCofrac } from '../../../store/collecte';
import { acquireLock, releaseLock, ensureArchive } from '../../../store/liste-has-archive';

export const REFRESH_MAX_AGE_JOURS = 30;

/** true si l'instantané Synaé/FINESS (meta.builtAt ISO) a dépassé l'âge maximal. */
export function shouldRefreshDataset(builtAt: string, now: Date): boolean {
  const t = Date.parse(builtAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > REFRESH_MAX_AGE_JOURS * 86_400_000;
}

export interface RunCollecteResult {
  liste: string; // résultat de collecteListeHas ('archive' | 'inchange' | …)
  cofrac: string;
}

/** Une collecte complète sous verrou. `skipped` si un autre processus collecte. */
export async function runCollecte(archiveRoot: string): Promise<RunCollecteResult | 'skipped'> {
  let verrouAcquis = false;
  try {
    // Les pannes d'environnement (mkdir EPERM, archive impossible) sont des
    // échecs rendus, jamais des rejets — l'appelant fait `void runCollecte(...)`.
    await ensureArchive(archiveRoot);
    if (!(await acquireLock(archiveRoot))) return 'skipped';
    verrouAcquis = true;
    const liste = await collecteListeHas({ archiveRoot });
    const cofrac = await collecteCofrac({ archiveRoot });
    return { liste: liste.resultat, cofrac: cofrac.resultat };
  } catch (e) {
    // Le journal d'archive n'existe pas sur ce chemin (l'archive elle-même est
    // en panne) : au moins une trace console.
    console.error("collecte : panne d'environnement", e);
    return { liste: 'echec', cofrac: 'echec' };
  } finally {
    // Ne relâcher QUE son propre verrou (le chemin 'skipped' n'en détient pas),
    // et sans rejeter : un rm en panne (EBUSY/EPERM) laisse un verrou orphelin
    // qui expire en 2 h — c'est le filet prévu.
    if (verrouAcquis) {
      try {
        await releaseLock(archiveRoot);
      } catch {
        // verrou orphelin : expiration en 2 h
      }
    }
  }
}
