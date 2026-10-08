import { describe, it, expect } from 'vitest';
import { creerNavigation, type OngletNavigation } from './navigation';

/** Conteneur factice : l'écran y écrit son contenu, comme root.innerHTML. */
interface FauxConteneur {
  numero: number;
  innerHTML: string;
}

/** Hôte factice (#screen) : ne garde que ses enfants courants. */
class FauxHote {
  enfants: FauxConteneur[] = [];
  replaceChildren(...noeuds: FauxConteneur[]): void {
    this.enfants = noeuds;
  }
}

class FauxOnglet implements OngletNavigation {
  readonly dataset: { screen?: string };
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (classe: string, actif: boolean): boolean => {
      if (actif) this.classes.add(classe);
      else this.classes.delete(classe);
      return actif;
    },
  };
  constructor(screen: string) {
    this.dataset = { screen };
  }
}

/** Promesse résolue à la demande, pour ordonner les fins de rendu. */
function differe(): { promesse: Promise<void>; resoudre: () => void } {
  let resoudre!: () => void;
  const promesse = new Promise<void>((r) => (resoudre = r));
  return { promesse, resoudre };
}

function monter(ecrans: Record<string, (root: FauxConteneur) => void | Promise<void>>) {
  const hote = new FauxHote();
  const onglets = Object.keys(ecrans).map((id) => new FauxOnglet(id));
  let compteur = 0;
  const naviguer = creerNavigation<FauxConteneur>({
    hote,
    creerConteneur: () => ({ numero: ++compteur, innerHTML: '' }),
    onglets: () => onglets,
    ecrans,
  });
  const actifs = (): string[] =>
    onglets.filter((o) => o.classes.has('active')).map((o) => o.dataset.screen!);
  const visible = (): string => hote.enfants.map((c) => c.innerHTML).join('');
  return { hote, naviguer, actifs, visible };
}

describe('navigation entre écrans', () => {
  it('un écran lent qui se termine après un écran rapide ne remplace pas le contenu visible', async () => {
    const lent = differe();
    const { naviguer, actifs, visible } = monter({
      accreditations: async (root) => {
        root.innerHTML = 'chargement accréditations';
        await lent.promesse;
        root.innerHTML = '<h2>Accréditations</h2>';
      },
      registre: (root) => {
        root.innerHTML = '<h2>Registre des cabinets</h2>';
      },
    });

    const rendu1 = naviguer('accreditations');
    const rendu2 = naviguer('registre');
    await rendu2;
    expect(visible()).toBe('<h2>Registre des cabinets</h2>');

    lent.resoudre();
    await rendu1;
    expect(visible()).toBe('<h2>Registre des cabinets</h2>');
    expect(actifs()).toEqual(['registre']);
  });

  it('chaque navigation monte un conteneur neuf, seul enfant de l’hôte', async () => {
    const { hote, naviguer } = monter({
      cotations: (root) => {
        root.innerHTML = 'cotations';
      },
      registre: (root) => {
        root.innerHTML = 'registre';
      },
    });
    await naviguer('cotations');
    const premier = hote.enfants[0];
    await naviguer('registre');
    expect(hote.enfants).toHaveLength(1);
    expect(hote.enfants[0]).not.toBe(premier);
    expect(hote.enfants[0]!.innerHTML).toBe('registre');
  });

  it('revenir sur un écran lent après un autre affiche bien le second rendu de cet écran', async () => {
    const attentes = [differe(), differe()];
    let appel = 0;
    const { naviguer, actifs, visible } = monter({
      accreditations: async (root) => {
        const n = appel++;
        await attentes[n]!.promesse;
        root.innerHTML = `accréditations ${n}`;
      },
      registre: (root) => {
        root.innerHTML = 'registre';
      },
    });
    const r1 = naviguer('accreditations');
    await naviguer('registre');
    const r3 = naviguer('accreditations');
    attentes[1]!.resoudre();
    await r3;
    attentes[0]!.resoudre();
    await r1;
    expect(visible()).toBe('accréditations 1');
    expect(actifs()).toEqual(['accreditations']);
  });

  it('le surlignage suit le dernier onglet demandé, dès le clic', () => {
    const { naviguer, actifs } = monter({
      cotations: () => new Promise<void>(() => undefined),
      fiches: () => new Promise<void>(() => undefined),
    });
    void naviguer('cotations');
    expect(actifs()).toEqual(['cotations']);
    void naviguer('fiches');
    expect(actifs()).toEqual(['fiches']);
  });

  it('un identifiant inconnu vide l’affichage sans erreur', async () => {
    const { hote, naviguer, actifs } = monter({
      cotations: (root) => {
        root.innerHTML = 'cotations';
      },
    });
    await naviguer('cotations');
    await naviguer('inexistant');
    expect(hote.enfants).toHaveLength(1);
    expect(hote.enfants[0]!.innerHTML).toBe('');
    expect(actifs()).toEqual([]);
  });
});
