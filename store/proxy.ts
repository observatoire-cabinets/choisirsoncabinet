/**
 * Proxy prisma-compatible sur le Dataset en mémoire : satisfait
 * MonoMultiExtractPrisma + FicheAxisPrisma sans toucher aux providers du moteur.
 *
 * La seule requête que le moteur émet est MONO_MULTI_EXTRACT_SQL — toute autre
 * requête échoue BRUYAMMENT (au lieu de renvoyer silencieusement les lignes as-of
 * pour une sémantique différente, p. ex. l'ancien _LEGACY_MAX).
 */

import type { Dataset } from './types';
import type { FicheAxisPrisma } from '../core/fiche-axis-providers';
import { MONO_MULTI_EXTRACT_SQL } from '../core/mono-multi-extract';
import { extractRows } from './extract';

export function makeStoreProxy(ds: Dataset): FicheAxisPrisma {
  const rows = extractRows(ds); // calculé une seule fois — le Dataset est immuable
  return {
    async $queryRawUnsafe(sql: string) {
      if (sql !== MONO_MULTI_EXTRACT_SQL) {
        throw new Error(
          'makeStoreProxy: requête inconnue — seule MONO_MULTI_EXTRACT_SQL est supportée par l\'application',
        );
      }
      // Copie superficielle par appel (comme un vrai driver qui matérialise un
      // résultat neuf) : un consommateur qui trie en place ne pollue pas les autres.
      return rows.slice();
    },
    finessEjMapping: {
      // Équivalent de aggregate({_max:{snapshotDate}}) sur finess_ej_mapping : le max
      // TABLE ENTIÈRE est figé dans meta au moment de la génération du dataset.
      aggregate: async () => ({ _max: { snapshotDate: new Date(ds.meta.finessSnapshotMax) } }),
    },
    hasEssmsOpen: {
      aggregate: async () => ({ _max: { syncedAt: new Date(ds.meta.hasSyncedAt) } }),
    },
  };
}
