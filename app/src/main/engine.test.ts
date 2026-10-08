import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineService } from './engine';
import { setSignificanceAlpha } from '../../../core/significance';
import { periodeLabel, MENTION_HISTORIQUE_NON_DISPONIBLE } from '../../../core/positioning-text';
import { extractPdfText, souple } from '../../../core/__fixtures__/pdf-text';
import { loadDataset } from '../../../store/load';
import { refreshDataset, type RefreshFreshness, type RefreshResult } from '../../../store/refresh';
import type { Dataset, EssmsRow } from '../../../store/types';
import type { CabinetPositioningHistory } from '../../../core/cabinet-positioning-history';

// Rafraîchissement simulé (aucun accès réseau) : chaque test fixe son déroulé.
vi.mock('../../../store/refresh', () => ({ refreshDataset: vi.fn() }));

const DATA = join(__dirname, '../../../data/generated');
const has = existsSync(join(DATA, 'meta.json'));

/** Résultat d'un rafraîchissement simulé livrant `dataset`. */
function resultatRafraichissement(dataset: Dataset): RefreshResult {
  const fraicheur = (snapshotType: RefreshFreshness['snapshotType']): RefreshFreshness => ({
    snapshotType,
    resolvedDate: '2026-10-06',
    embeddedMax: null,
    isNewer: false,
    warning: null,
  });
  return {
    dataset,
    archivedPrevious: null,
    finessFreshness: fraicheur('finess-ej'),
    capacityFreshness: fraicheur('finess-capacity'),
  };
}

describe.skipIf(!has)('EngineService (données réelles)', () => {
  let eng: EngineService;
  beforeAll(async () => {
    eng = new EngineService();
    await eng.load(DATA);
  }, 60_000);

  // Hygiène de suite : le seuil global revient TOUJOURS au défaut produit (0,05).
  afterEach(() => setSignificanceAlpha(0.05));

  it('meta expose les dates du jeu de données', () => {
    const m = eng.getMeta();
    expect(m.hasSyncedAt).toBeTruthy();
    expect(m.finessSnapshotMax).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.sources.length).toBeGreaterThan(0);
  });

  it('listCabinets renvoie >100 cabinets triés (FR)', () => {
    const c = eng.listCabinets();
    expect(c.length).toBeGreaterThan(100);
    expect([...c]).toEqual([...c].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('cabinetDetail : comparaison nationale + liste COMPLÈTE triée alphabétiquement par nom', () => {
    const d = eng.cabinetDetail(eng.listCabinets()[0]);
    expect(d).not.toBeNull();
    // Toutes les structures évaluées (plus de coupe à 5).
    expect(d!.establishments.length).toBe(d!.nEvaluations);
    // Ordre alphabétique par nom (aucun classement par score exposé).
    const names = d!.establishments.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
    expect(typeof d!.gapVsNational).toBe('number');
  });

  it('exportCabinetRanking écrit un PDF des structures hors ligne', async () => {
    const out = mkdtempSync(join(tmpdir(), 'obs-cab-'));
    const p = await eng.exportCabinetRanking(eng.listCabinets()[0], out);
    expect(p.endsWith('.pdf')).toBe(true);
    expect(existsSync(p)).toBe(true);
  }, 60_000);

  it('registry : lignes de vie', () => {
    expect(eng.registry().length).toBeGreaterThan(100);
  });

  it('generateFiches écrit des PDF (fiche 3, alpha=0,05)', async () => {
    const out = mkdtempSync(join(tmpdir(), 'obs-fiche-'));
    const r = await eng.generateFiches({ numeros: [3], outDir: out, alpha: 0.05 });
    expect(r.written.length).toBeGreaterThan(0);
    expect(readdirSync(out).some((f) => f.endsWith('.pdf'))).toBe(true);
  }, 60_000);

  it('ficheCabinet : portrait mono-cabinet (7 axes, cotations, période)', () => {
    const f = eng.ficheCabinet(eng.listCabinets()[0], 0.05);
    expect(f).not.toBeNull();
    expect(f!.axes).toHaveLength(7);
    expect(f!.n).toBeGreaterThan(0);
    expect(f!.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }, 180_000);

  it('ficheCabinetHistory : série mensuelle cumulative (n croissant)', () => {
    const h = eng.ficheCabinetHistory(eng.listCabinets()[0]);
    expect(h).not.toBeNull();
    expect(h!.rows.length).toBeGreaterThan(0);
    const ns = h!.rows.map((r) => r.n);
    expect([...ns]).toEqual([...ns].sort((a, b) => a - b));
    // Fiabilité de la date de clôture : la quasi-totalité des évals est datée.
    expect(h!.nUndated).toBeLessThanOrEqual(ns[ns.length - 1] * 0.05);
  }, 120_000);

  it('exportFicheCabinet écrit la fiche courante et une fiche mensuelle', async () => {
    const out = mkdtempSync(join(tmpdir(), 'obs-fc-'));
    const cab = eng.listCabinets()[0];
    const p1 = await eng.exportFicheCabinet(cab, out, 0.05, null);
    const h = eng.ficheCabinetHistory(cab)!;
    const p2 = await eng.exportFicheCabinet(cab, out, 0.05, h.rows[h.rows.length - 1].month);
    expect(p1.endsWith('.pdf') && p2.endsWith('.pdf')).toBe(true);
    expect(existsSync(p1) && existsSync(p2)).toBe(true);
    expect(p1).not.toBe(p2); // suffixe -YYYY-MM sur la fiche mensuelle
  }, 300_000);

  it('export PDF : attend l’historique et le tronque pour une fiche passée', async () => {
    const out = mkdtempSync(join(tmpdir(), 'obs-pos-'));
    const c = eng.listCabinets()[0];
    const p = await eng.exportFicheCabinet(c, out, 0.05, null);
    const t1 = extractPdfText(readFileSync(p));
    expect(t1).toMatch(/Historique du positionnement/);
    const h = await eng.positioningHistoryAwait(c, 0.05);
    const mois = h!.months[Math.floor(h!.months.length / 2)];
    expect(h!.firstMonth! <= mois && mois < h!.lastMonth!).toBe(true); // mois à l'intérieur de la période du cabinet
    const p2 = await eng.exportFicheCabinet(c, out, 0.05, mois);
    const t2 = extractPdfText(readFileSync(p2));
    expect(t2).toMatch(/Historique du positionnement/);
    // Fiche passée : la section 6 garde son titre (sans tableau), avant la section 7.
    expect(t2).toMatch(/6\. Historique mensuel/);
    expect(t2.indexOf('6. Historique mensuel')).toBeLessThan(t2.indexOf('7. Historique du positionnement'));
    // Période imprimée : complète sur la fiche courante, arrêtée au mois demandé sur la fiche passée.
    const periode = (fin: string): RegExp => souple(`historique ${periodeLabel(h!.firstMonth!, fin)}`);
    expect(t1).toMatch(periode(h!.lastMonth!));
    expect(t2).toMatch(periode(mois));
    expect(t2).not.toMatch(periode(h!.lastMonth!));
  }, 180_000);

  it('export PDF : historique indisponible (calcul en échec) → section 7 réduite à la mention, jamais omise', async () => {
    const out = mkdtempSync(join(tmpdir(), 'obs-pos-'));
    const c = eng.listCabinets()[0];
    const attente = vi.spyOn(eng, 'positioningHistoryAwait').mockResolvedValueOnce(null);
    try {
      const t = extractPdfText(readFileSync(await eng.exportFicheCabinet(c, out, 0.05, null)));
      expect(t).toMatch(souple('7. Historique du positionnement'));
      expect(t).toMatch(souple(MENTION_HISTORIQUE_NON_DISPONIBLE));
      expect(t).not.toMatch(/Couleurs choisies/);
    } finally {
      attente.mockRestore();
    }
  }, 180_000);

  it('historique du positionnement : en-cours puis prêt, cache par alpha', async () => {
    const c = eng.listCabinets()[0];
    eng.warmPositioningHistory(0.05);
    const h = await eng.positioningHistoryAwait(c, 0.05);
    expect(h?.cabinet).toBe(c);
    expect(h!.series.length).toBeGreaterThanOrEqual(11);
    const etat = eng.positioningHistory(c, 0.05);
    expect(etat.etat).toBe('pret');
    // L'autre seuil est un autre calcul (le rang de la fiche 12 en dépend).
    expect(eng.positioningHistory(c, 0.01).etat).toBe('en-cours');
    const h01 = await eng.positioningHistoryAwait(c, 0.01);
    expect(h01?.cabinet).toBe(c);
  }, 120_000);

  it('annulation au rechargement : un calcul en vol ne repeuple pas le cache', async () => {
    const autre = new EngineService();
    await autre.load(DATA);
    const c = autre.listCabinets()[0];
    autre.warmPositioningHistory(0.05);
    const enVol = autre.positioningHistoryAwait(c, 0.05);
    await autre.load(DATA); // jeu remplacé pendant le calcul
    expect(await enVol).toBeNull();
    expect(autre.positioningHistory(c, 0.05).etat).toBe('en-cours'); // nouveau calcul relancé
    expect((await autre.positioningHistoryAwait(c, 0.05))?.cabinet).toBe(c);
  }, 180_000);

  it('demande pendant le rechargement : l’historique calculé sur l’ancien jeu est écarté', async () => {
    const autre = new EngineService();
    await autre.load(DATA);
    const c = autre.listCabinets()[0];
    const rechargement = autre.load(DATA); // jeton incrémenté, jeu pas encore remplacé
    const pendant = autre.positioningHistoryAwait(c, 0.05); // calcul lancé sur l'ancien jeu
    await rechargement;
    const apres = await autre.positioningHistoryAwait(c, 0.05);
    expect(apres?.cabinet).toBe(c);
    expect(apres).not.toBe(await pendant); // recalculé sur le nouveau jeu
  }, 180_000);

  it('rafraîchissement : historique de l’ancien jeu servi pendant le téléchargement, écarté ensuite', async () => {
    const autre = new EngineService();
    await autre.load(DATA);
    const c = autre.listCabinets()[0];
    const avant = await autre.positioningHistoryAwait(c, 0.05);
    expect(avant?.cabinet).toBe(c);

    // Échec du téléchargement : l'ancien jeu et son historique restent en place.
    vi.mocked(refreshDataset).mockRejectedValueOnce(new Error('source injoignable'));
    await expect(autre.refresh('courant', 'archives')).rejects.toThrow('source injoignable');
    expect(autre.positioningHistory(c, 0.05)).toEqual({ etat: 'pret', data: avant });

    // Téléchargement réussi, livré à la main.
    const resultat = resultatRafraichissement(await loadDataset(DATA));
    let livrer!: () => void;
    vi.mocked(refreshDataset).mockImplementationOnce(
      () => new Promise<RefreshResult>((res) => (livrer = () => res(resultat))),
    );
    const rafraichissement = autre.refresh('courant', 'archives');
    expect(autre.positioningHistory(c, 0.05)).toEqual({ etat: 'pret', data: avant }); // ancien jeu encore servi
    livrer();
    await rafraichissement;
    expect(autre.positioningHistory(c, 0.05).etat).toBe('en-cours'); // recalcul relancé sur le nouveau jeu
    const apres = await autre.positioningHistoryAwait(c, 0.05);
    expect(apres?.cabinet).toBe(c);
    expect(apres).not.toBe(avant);
  }, 180_000);

  it('rafraîchissement à vol unique : un second appel pendant le premier rend la même promesse, un appel ultérieur relance', async () => {
    const autre = new EngineService();
    await autre.load(DATA);
    const resultat = resultatRafraichissement(await loadDataset(DATA));
    vi.mocked(refreshDataset).mockClear();
    let livrer!: () => void;
    vi.mocked(refreshDataset).mockImplementationOnce(
      () => new Promise<RefreshResult>((res) => (livrer = () => res(resultat))),
    );
    const premier = autre.refresh('courant', 'archives');
    const second = autre.refresh('courant', 'archives');
    expect(second).toBe(premier);
    expect(refreshDataset).toHaveBeenCalledTimes(1);
    livrer();
    await premier;

    vi.mocked(refreshDataset).mockResolvedValueOnce(resultat);
    const suivant = autre.refresh('courant', 'archives');
    expect(suivant).not.toBe(premier);
    await suivant;
    expect(refreshDataset).toHaveBeenCalledTimes(2);
  }, 180_000);

  it('rafraîchissement à vol unique : un échec libère le vol, l’appel suivant relance', async () => {
    const autre = new EngineService();
    await autre.load(DATA);
    vi.mocked(refreshDataset).mockClear();
    vi.mocked(refreshDataset).mockRejectedValueOnce(new Error('source injoignable'));
    const echec = autre.refresh('courant', 'archives');
    expect(autre.refresh('courant', 'archives')).toBe(echec);
    await expect(echec).rejects.toThrow('source injoignable');
    vi.mocked(refreshDataset).mockResolvedValueOnce(resultatRafraichissement(await loadDataset(DATA)));
    await autre.refresh('courant', 'archives');
    expect(refreshDataset).toHaveBeenCalledTimes(2);
  }, 180_000);

  it('données rechargées : signal émis une fois par rafraîchissement réussi, jamais après un échec', async () => {
    const autre = new EngineService();
    await autre.load(DATA);
    const ecouteur = vi.fn();
    autre.onDonneesRechargees(ecouteur);

    vi.mocked(refreshDataset).mockRejectedValueOnce(new Error('source injoignable'));
    await expect(autre.refresh('courant', 'archives')).rejects.toThrow('source injoignable');
    expect(ecouteur).not.toHaveBeenCalled();

    let livrer!: () => void;
    const resultat = resultatRafraichissement(await loadDataset(DATA));
    vi.mocked(refreshDataset).mockImplementationOnce(
      () => new Promise<RefreshResult>((res) => (livrer = () => res(resultat))),
    );
    const a = autre.refresh('courant', 'archives');
    const b = autre.refresh('courant', 'archives'); // même vol
    expect(ecouteur).not.toHaveBeenCalled(); // pas avant que le nouveau jeu soit en place
    livrer();
    await Promise.all([a, b]);
    expect(ecouteur).toHaveBeenCalledTimes(1);
    expect(autre.getMeta()).toBe(resultat.dataset.meta);
  }, 180_000);

  it('données rechargées : un écouteur en échec ne fait pas échouer le rafraîchissement', async () => {
    const autre = new EngineService();
    await autre.load(DATA);
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      autre.onDonneesRechargees(() => {
        throw new Error('fenêtre fermée');
      });
      const suivant = vi.fn();
      autre.onDonneesRechargees(suivant);
      vi.mocked(refreshDataset).mockResolvedValueOnce(resultatRafraichissement(await loadDataset(DATA)));
      await expect(autre.refresh('courant', 'archives')).resolves.toHaveProperty('meta');
      expect(suivant).toHaveBeenCalledTimes(1);
      expect(erreur).toHaveBeenCalled();
    } finally {
      erreur.mockRestore();
    }
  }, 180_000);

  const RECHARGE = "jeu de données rechargé pendant l'export — réessayer";

  it('export Fiche cabinet : nouveau jeu livré pendant l’attente de l’historique → refusé, aucun PDF ; nouvel essai daté du nouveau jeu', async () => {
    const autre = new EngineService();
    await autre.load(DATA);
    const c = autre.listCabinets()[0];
    const out = mkdtempSync(join(tmpdir(), 'obs-course-'));
    const nouveau = await loadDataset(DATA);
    const livre: Dataset = { ...nouveau, meta: { ...nouveau.meta, hasSyncedAt: '2031-01-15T08:00:00.000Z' } };
    let livrer!: () => void;
    vi.mocked(refreshDataset).mockImplementationOnce(
      () => new Promise<RefreshResult>((res) => (livrer = () => res(resultatRafraichissement(livre)))),
    );
    const rafraichissement = autre.refresh('courant', 'archives'); // téléchargement en cours
    // Fiche calculée sur le jeu courant ; l'export attend l'historique, en cours de calcul.
    const exportEnCours = autre.exportFicheCabinet(c, out, 0.05, null);
    livrer();
    await rafraichissement; // nouveau jeu en place : le calcul en vol est annulé
    await expect(exportEnCours).rejects.toThrow(RECHARGE);
    expect(readdirSync(out)).toHaveLength(0);

    // Nouvel essai : fiche, date et historique du nouveau jeu.
    const p = await autre.exportFicheCabinet(c, out, 0.05, null);
    const t = extractPdfText(readFileSync(p));
    expect(t).toMatch(/Données HAS au 2031-01-15/);
    expect(t).toMatch(/Historique du positionnement/);
  }, 180_000);

  it('export Fiche cabinet : rechargement commencé ou achevé pendant l’attente de l’historique → refusé, aucun PDF', async () => {
    const autre = new EngineService();
    await autre.load(DATA);
    const c = autre.listCabinets()[0];
    const out = mkdtempSync(join(tmpdir(), 'obs-course-'));
    const h = await eng.positioningHistoryAwait(c, 0.05); // historique complet du jeu courant
    expect(h?.cabinet).toBe(c);
    // L'historique est livré à la main, au moment choisi.
    let livrer!: (r: CabinetPositioningHistory | null) => void;
    const attente = vi.spyOn(autre, 'positioningHistoryAwait');
    const differer = () =>
      attente.mockImplementationOnce(() => new Promise<CabinetPositioningHistory | null>((res) => (livrer = res)));

    // Rechargement commencé, ancien jeu encore en place : calcul annulé (null).
    differer();
    const pendant = autre.exportFicheCabinet(c, out, 0.05, null);
    const rechargement = autre.load(DATA);
    livrer(null);
    await expect(pendant).rejects.toThrow(RECHARGE);
    await rechargement;

    // Rechargement achevé, historique complet de l'ancien jeu livré ensuite.
    differer();
    const apres = autre.exportFicheCabinet(c, out, 0.05, null);
    await autre.load(DATA);
    livrer(h);
    await expect(apres).rejects.toThrow(RECHARGE);
    expect(readdirSync(out)).toHaveLength(0);
  }, 180_000);
});

/** Structure scorée minimale du cabinet `cabinet`, évaluée le `evalDate`. */
function structureScoree(finessGeo: string, cabinet: string, evalDate: string): EssmsRow {
  return {
    finessGeo, score: 80, cabinet, raisonSociale: null, region: 'R1', statut: 'Public', categ: '',
    categCode: '500', departement: '75', evalDate, grade: 'A', chapters: [null, null, null],
    imperatives: [], ciEvaluated: null, ciMet: null, ciAbove35: null,
  };
}

describe('EngineService : fiche cabinet sans structure rattachée au répertoire des entités juridiques', () => {
  // CAB SANS EJ : 3 structures scorées, aucune ligne d'entité juridique ; CAB AVEC EJ : 1 structure rattachée.
  const jeu: Dataset = {
    meta: { builtAt: '', hasSyncedAt: '2026-10-01', finessSnapshotMax: '2026-09-15', sources: [] },
    essms: [
      structureScoree('000000001', 'CAB SANS EJ', '2026-03-10'),
      structureScoree('000000002', 'CAB SANS EJ', '2026-04-10'),
      structureScoree('000000003', 'CAB SANS EJ', '2026-05-10'),
      structureScoree('000000004', 'CAB AVEC EJ', '2026-03-10'),
    ],
    ejSnapshots: [{ snapshotDate: '2026-01-01', finessGeo: '000000004', ejSize: 1 }],
    capacitySnapshots: [],
    baseDoc: [],
    evalHistory: [],
  };

  async function moteurSur(ds: Dataset): Promise<EngineService> {
    const eng = new EngineService();
    vi.mocked(refreshDataset).mockResolvedValueOnce(resultatRafraichissement(ds));
    await eng.refresh('courant', 'archives');
    return eng;
  }

  afterEach(() => setSignificanceAlpha(0.05));

  it('export de la fiche courante : erreur indiquant les structures non rattachées et la date du répertoire, aucun PDF', async () => {
    const eng = await moteurSur(jeu);
    const out = mkdtempSync(join(tmpdir(), 'obs-sans-ej-'));
    expect(eng.cabinetDetail('CAB SANS EJ')!.establishments).toHaveLength(3);
    expect(eng.ficheCabinet('CAB SANS EJ', 0.05)).toBeNull();
    await expect(eng.exportFicheCabinet('CAB SANS EJ', out, 0.05, null)).rejects.toThrow(
      "Fiche indisponible : les 3 structures évaluées par ce cabinet ne sont pas rattachées au répertoire FINESS " +
        "des entités juridiques (extraction du 15/09/2026), sur lequel reposent les analyses de cette fiche. " +
        "Elles restent consultables dans les onglets Cotations et Cabinet choisi.",
    );
    expect(readdirSync(out)).toHaveLength(0);
    await eng.positioningHistoryAwait('CAB SANS EJ', 0.05);
  });

  it('export de la fiche courante d’un cabinet inconnu : « Aucune donnée pour ce cabinet. »', async () => {
    const eng = await moteurSur(jeu);
    const out = mkdtempSync(join(tmpdir(), 'obs-sans-ej-'));
    await expect(eng.exportFicheCabinet('INCONNU', out, 0.05, null)).rejects.toThrow(/^Aucune donnée pour ce cabinet\.$/);
    await eng.positioningHistoryAwait('INCONNU', 0.05);
  });

  it('export d’un mois passé sans donnée à ce mois : message à fin AAAA-MM inchangé', async () => {
    const eng = await moteurSur(jeu);
    const out = mkdtempSync(join(tmpdir(), 'obs-sans-ej-'));
    await expect(eng.exportFicheCabinet('CAB SANS EJ', out, 0.05, '2026-04')).rejects.toThrow(
      'Aucune donnée pour le cabinet « CAB SANS EJ » à fin 2026-04.',
    );
    await eng.positioningHistoryAwait('CAB SANS EJ', 0.05);
  });
});
