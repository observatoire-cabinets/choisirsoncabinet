/**
 * Textes de la Fiche cabinet partagés par l'écran et le processus principal
 * (erreur d'export). Module PUR, sans dépendance d'exécution : il peut être
 * chargé tel quel par le processus de rendu.
 */

/** 'AAAA-MM-JJ' (ou ISO complet) → 'JJ/MM/AAAA', sans dérive de fuseau ; null si illisible. */
const jjmmaaaa = (iso: string | null | undefined): string | null => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/**
 * Texte affiché quand la fiche courante d'un cabinet est indisponible
 * (buildFicheCabinet rend null). `nStructures` : structures scorées du cabinet
 * (cabinetDetail(ds, cabinet).establishments.length, 0 si cabinet inconnu).
 * Avec au moins une structure scorée, une fiche courante nulle signifie qu'aucune
 * n'a de ligne d'entité juridique : l'univers du moteur 7 axes (INNER JOIN EJ)
 * ne contient alors aucune évaluation du cabinet. `finessSnapshotMax` : date du
 * répertoire des entités juridiques (meta), omise si absente ou illisible.
 */
export function ficheIndisponibleTexte(
  nStructures: number,
  finessSnapshotMax: string | null | undefined,
): string {
  if (nStructures <= 0) return 'Aucune donnée pour ce cabinet.';
  const date = jjmmaaaa(finessSnapshotMax);
  const extraction = date ? ` (extraction du ${date})` : '';
  const repertoire = `au répertoire FINESS des entités juridiques${extraction}, sur lequel reposent les analyses de cette fiche.`;
  return nStructures === 1
    ? `Fiche indisponible : la structure évaluée par ce cabinet n'est pas rattachée ${repertoire} ` +
        'Elle reste consultable dans les onglets Cotations et Cabinet choisi.'
    : `Fiche indisponible : les ${nStructures} structures évaluées par ce cabinet ne sont pas rattachées ${repertoire} ` +
        'Elles restent consultables dans les onglets Cotations et Cabinet choisi.';
}
