import { describe, it, expect, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { EngineService } from './engine';
import {
  shouldAutoUpdate,
  miseAJourDonnees,
  runAutoUpdate,
  noteFraicheur,
  volUnique,
  type MiseAJourDonneesDeps,
} from './autoupdate';

describe('shouldAutoUpdate', () => {
  it('actif seulement si le réglage est ON et internet disponible', () => {
    expect(shouldAutoUpdate({ autoUpdate: true }, true)).toBe(true);
    expect(shouldAutoUpdate({ autoUpdate: true }, false)).toBe(false);
    expect(shouldAutoUpdate({ autoUpdate: false }, true)).toBe(false);
    expect(shouldAutoUpdate({ autoUpdate: false }, false)).toBe(false);
  });
});

describe('miseAJourDonnees (mise à jour manuelle)', () => {
  const aJour = { resolvedDate: '2026-10-01', embeddedMax: '2026-09-03', isNewer: true, warning: null };
  const conserve = {
    resolvedDate: '2026-09-03',
    embeddedMax: '2026-09-03',
    isNewer: false,
    warning: 'FINESS établissements: date résolue 2026-09-03 <= max embarqué 2026-09-03 — snapshot courant conservé',
  };
  const deps = (over: Partial<MiseAJourDonneesDeps> = {}): MiseAJourDonneesDeps & { messages: string[] } => {
    const messages: string[] = [];
    return {
      messages,
      enLigne: () => true,
      collecter: vi.fn(async () => ({ liste: 'archive' as const, cofrac: 'inchange' as const })),
      rafraichir: vi.fn(async () => ({ finessFreshness: aJour, capacityFreshness: aJour })),
      progression: (m: string) => messages.push(m),
      ...over,
    };
  };

  it('hors ligne : rien n’est tenté (ni collecte ni rafraîchissement), résultat « hors-ligne »', async () => {
    const d = deps({ enLigne: () => false });
    await expect(miseAJourDonnees(d)).resolves.toEqual({ etat: 'hors-ligne' });
    expect(d.collecter).not.toHaveBeenCalled();
    expect(d.rafraichir).not.toHaveBeenCalled();
    expect(d.messages).toHaveLength(1);
  });

  it('en ligne : collecte liste HAS + COFRAC, puis rafraîchissement ; résumé typé et progression envoyée', async () => {
    const ordre: string[] = [];
    const d = deps({
      collecter: vi.fn(async () => {
        ordre.push('collecte');
        return { liste: 'archive' as const, cofrac: 'inchange' as const };
      }),
      rafraichir: vi.fn(async () => {
        ordre.push('rafraichissement');
        return { finessFreshness: aJour, capacityFreshness: aJour };
      }),
    });
    await expect(miseAJourDonnees(d)).resolves.toEqual({
      etat: 'termine',
      collecte: { liste: 'archive', cofrac: 'inchange' },
      donnees: { ok: true, note: null },
    });
    expect(ordre).toEqual(['collecte', 'rafraichissement']);
    expect(d.messages.length).toBeGreaterThanOrEqual(2);
    expect(d.messages[d.messages.length - 1]).toBe('Données à jour.');
  });

  it('extrait FINESS non republié : note en clair construite sur les dates, jamais la chaîne technique', async () => {
    const d = deps({
      rafraichir: vi.fn(async () => ({ finessFreshness: conserve, capacityFreshness: aJour })),
    });
    const r = await miseAJourDonnees(d);
    const note =
      'FINESS établissements : aucune publication plus récente que l’extrait du 03/09/2026, extrait actuel conservé';
    expect(r).toMatchObject({ donnees: { ok: true, note } });
    const dernier = d.messages[d.messages.length - 1]!;
    expect(dernier).toBe(`Données à jour (${note}).`);
    for (const t of [JSON.stringify(r), dernier]) {
      expect(t).not.toMatch(/snapshot|<=|embarqué|doublon|2026-09-03/);
    }
  });

  it('collecte déjà en cours ailleurs (« skipped ») : rafraîchissement tout de même tenté', async () => {
    const d = deps({ collecter: vi.fn(async () => 'skipped' as const) });
    await expect(miseAJourDonnees(d)).resolves.toMatchObject({ etat: 'termine', collecte: 'skipped' });
    expect(d.rafraichir).toHaveBeenCalledTimes(1);
  });

  it('collecte qui rejette malgré tout : rendue comme deux échecs, sans propager', async () => {
    const d = deps({ collecter: vi.fn(async () => Promise.reject(new Error('panne'))) });
    await expect(miseAJourDonnees(d)).resolves.toMatchObject({
      etat: 'termine',
      collecte: { liste: 'echec', cofrac: 'echec' },
      donnees: { ok: true },
    });
  });

  it('rafraîchissement en échec : message d’échec sur une ligne, sans pile, données conservées', async () => {
    const err = new Error('résolution data.gouv impossible\nsuite');
    err.stack = 'Error: résolution data.gouv impossible\n    at fetch (refresh.ts:114:9)';
    const d = deps({ rafraichir: vi.fn(async () => Promise.reject(err)) });
    const r = await miseAJourDonnees(d);
    expect(r).toEqual({
      etat: 'termine',
      collecte: { liste: 'archive', cofrac: 'inchange' },
      donnees: { ok: false, message: 'résolution data.gouv impossible' },
    });
    expect(JSON.stringify(r)).not.toContain(' at ');
    expect(d.messages[d.messages.length - 1]).toMatch(/conservées/);
  });

  it('rafraîchissement rejeté par une valeur non-Error multiligne : première ligne seulement', async () => {
    const d = deps({ rafraichir: vi.fn(async () => Promise.reject('ligne 1\nligne 2')) });
    await expect(miseAJourDonnees(d)).resolves.toMatchObject({ donnees: { ok: false, message: 'ligne 1' } });
  });

  it('source injoignable (« fetch failed », code réseau) : dit en français, sans terme technique', async () => {
    const fetchKo = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const d1 = deps({ rafraichir: vi.fn(async () => Promise.reject(fetchKo)) });
    await expect(miseAJourDonnees(d1)).resolves.toMatchObject({ donnees: { ok: false, message: 'source injoignable' } });
    const d2 = deps({ rafraichir: vi.fn(async () => Promise.reject(new Error('connect ETIMEDOUT 1.2.3.4:443'))) });
    await expect(miseAJourDonnees(d2)).resolves.toMatchObject({ donnees: { ok: false, message: 'source injoignable' } });
  });

  it('erreur HTTP de la source : code seul, sans URL ni libellé anglais', async () => {
    const err = new Error(
      'téléchargement FINESS échoué: HTTP 503 Service Unavailable (https://static.data.gouv.fr/x.csv)',
    );
    const d = deps({ rafraichir: vi.fn(async () => Promise.reject(err)) });
    const r = await miseAJourDonnees(d);
    expect(r).toMatchObject({ donnees: { ok: false, message: 'la source a répondu par une erreur (503)' } });
    expect(JSON.stringify(r)).not.toMatch(/https?:|Service Unavailable/);
  });
});

describe('noteFraicheur', () => {
  const f = (resolvedDate: string, embeddedMax: string | null, isNewer: boolean) => ({
    resolvedDate,
    embeddedMax,
    isNewer,
  });

  it('nouveaux extraits FINESS : aucune note', () => {
    expect(
      noteFraicheur({
        finessFreshness: f('2026-10-01', '2026-09-03', true),
        capacityFreshness: f('2026-10-01', null, true),
      }),
    ).toBeNull();
  });

  it('établissements et capacités conservés à la même date : une seule mention FINESS', () => {
    expect(
      noteFraicheur({
        finessFreshness: f('2026-09-03', '2026-09-03', false),
        capacityFreshness: f('2026-08-01', '2026-09-03', false),
      }),
    ).toBe('FINESS : aucune publication plus récente que l’extrait du 03/09/2026, extrait actuel conservé');
  });

  it('capacités seules conservées, ou dates distinctes : chaque fichier nommé', () => {
    expect(
      noteFraicheur({
        finessFreshness: f('2026-10-01', '2026-09-03', true),
        capacityFreshness: f('2026-07-01', '2026-07-01', false),
      }),
    ).toBe('FINESS capacités : aucune publication plus récente que l’extrait du 01/07/2026, extrait actuel conservé');
    expect(
      noteFraicheur({
        finessFreshness: f('2026-09-03', '2026-09-03', false),
        capacityFreshness: f('2026-07-01', '2026-07-01', false),
      }),
    ).toBe(
      'FINESS établissements : aucune publication plus récente que l’extrait du 03/09/2026, extrait actuel conservé ; ' +
        'FINESS capacités : aucune publication plus récente que l’extrait du 01/07/2026, extrait actuel conservé',
    );
  });
});

describe('runAutoUpdate (rafraîchissement automatique)', () => {
  const fenetre = () => {
    const send = vi.fn();
    return { send, win: { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow };
  };
  const dirs = { dataDir: 'd', archiveRoot: 'a' };

  it('échec : « données actuelles conservées » (le jeu servi peut déjà venir d’un rafraîchissement)', async () => {
    const { send, win } = fenetre();
    const engine = { refresh: vi.fn(async () => Promise.reject(new Error('fetch failed'))) } as unknown as EngineService;
    await runAutoUpdate(engine, win, dirs);
    expect(send).toHaveBeenLastCalledWith('refresh:progress', 'Mise à jour indisponible — données actuelles conservées.');
  });

  it('extrait FINESS conservé : progression en clair, sans la chaîne technique', async () => {
    const { send, win } = fenetre();
    const fr = { resolvedDate: '2026-09-03', embeddedMax: '2026-09-03', isNewer: false, warning: 'x <= y snapshot' };
    const engine = {
      refresh: vi.fn(async () => ({ finessFreshness: fr, capacityFreshness: fr })),
    } as unknown as EngineService;
    await runAutoUpdate(engine, win, dirs);
    expect(send).toHaveBeenLastCalledWith(
      'refresh:progress',
      'Données à jour (FINESS : aucune publication plus récente que l’extrait du 03/09/2026, extrait actuel conservé).',
    );
  });
});

describe('volUnique', () => {
  it('une seconde demande pendant le vol rejoint la même promesse ; libéré à l’issue, succès ou échec', async () => {
    let fin!: (v: number) => void;
    const f = vi.fn(() => new Promise<number>((res) => (fin = res)));
    const v = volUnique(f);
    expect(v.enCours()).toBe(false);
    expect(v.rejoindre()).toBeNull();
    const p1 = v.demarrer();
    const p2 = v.demarrer();
    expect(p2).toBe(p1);
    expect(v.rejoindre()).toBe(p1);
    expect(v.enCours()).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    fin(7);
    await expect(p1).resolves.toBe(7);
    expect(v.enCours()).toBe(false);
    expect(v.rejoindre()).toBeNull();

    const g = volUnique(async () => Promise.reject(new Error('x')));
    await expect(g.demarrer()).rejects.toThrow('x');
    expect(g.enCours()).toBe(false);
  });
});
