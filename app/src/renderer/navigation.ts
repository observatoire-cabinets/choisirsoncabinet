/**
 * Navigation entre écrans.
 *
 * Chaque navigation crée un conteneur neuf, monté comme seul enfant de l'hôte
 * (#screen), et le confie à l'écran. Un rendu encore en attente d'un appel
 * lent au moment où l'utilisateur change d'onglet continue d'écrire dans son
 * propre conteneur, désormais détaché du document : il ne peut plus remplacer
 * l'écran affiché. Les écrans n'interrogent que leur conteneur
 * (root.querySelector), jamais le document.
 */

/** Bouton d'onglet : sous-ensemble de HTMLElement utilisé pour le surlignage. */
export interface OngletNavigation {
  readonly dataset: { screen?: string };
  readonly classList: { toggle(classe: string, actif: boolean): unknown };
}

/** Hôte des écrans : sous-ensemble de HTMLElement. */
export interface HoteEcran<C> {
  replaceChildren(...noeuds: C[]): void;
}

export interface OptionsNavigation<C> {
  hote: HoteEcran<C>;
  creerConteneur: () => C;
  onglets: () => Iterable<OngletNavigation>;
  ecrans: Record<string, (root: C) => void | Promise<void>>;
}

/** Renvoie la fonction d'affichage d'un écran par son identifiant. */
export function creerNavigation<C>(opts: OptionsNavigation<C>): (id: string) => Promise<void> {
  return async (id) => {
    const conteneur = opts.creerConteneur();
    opts.hote.replaceChildren(conteneur);
    for (const onglet of opts.onglets()) {
      onglet.classList.toggle('active', onglet.dataset.screen === id);
    }
    await opts.ecrans[id]?.(conteneur);
  };
}
