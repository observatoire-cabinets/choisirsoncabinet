import { describe, it, expect } from 'vitest';
import {
  normalizeCabinetName,
  buildAccreditationsView,
  type AccreditationsInput,
} from './accreditations';
import type { ListeHasEtat } from './liste-has-parse';

const org = (siren: string, nom: string, num = '') => ({ siren, nom, num, dept: '01' });
const etat = (date: string, organismes: ReturnType<typeof org>[]): ListeHasEtat => ({
  date_source: date,
  date_releve: date,
  sha256: 'x' + date,
  organismes,
});

const baseInput = (over: Partial<AccreditationsInput> = {}): AccreditationsInput => ({
  cabinets: [],
  etats: [],
  bilans: [],
  faits: [],
  pistes: [],
  alias: [],
  cofrac: [],
  ...over,
});

describe('normalizeCabinetName', () => {
  it('casse, accents, ponctuation, formes juridiques, espaces', () => {
    expect(normalizeCabinetName('Cabinet Kheops Consulting')).toBe(
      normalizeCabinetName('CABINET KHEOPS  CONSULTING'),
    );
    expect(normalizeCabinetName('SARL Qualité & Co')).toBe(normalizeCabinetName('QUALITE-CO SAS'));
    expect(normalizeCabinetName('ID&ES')).toBe(normalizeCabinetName('id & es'));
  });
});

describe('buildAccreditationsView — statuts (volet ①)', () => {
  const etats = [
    etat('2026-07-16', [org('111111111', 'ALPHA CONSEIL', '3-1000'), org('222222222', 'BETA AUDIT')]),
    etat('2026-08-13', [org('222222222', 'BETA AUDIT')]),
  ];

  it('accrédité / autorisé sans numéro / sorti avec numéro / non rapproché', () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['ALPHA CONSEIL', 'BETA AUDIT', 'INTROUVABLE SARL'],
        etats,
      }),
    );
    const byCab = Object.fromEntries(v.statuts.map((s) => [s.cabinet, s]));
    // BETA : présent au dernier état, sans numéro → autorisé sans accréditation.
    expect(byCab['BETA AUDIT'].statut).toBe('autorise-sans-numero');
    // ALPHA : présent au 16/07 avec numéro, absent au 13/08 → sorti en portant un numéro.
    expect(byCab['ALPHA CONSEIL'].statut).toBe('sorti-avec-numero');
    expect(byCab['ALPHA CONSEIL'].dernierEtatPresent).toBe('2026-07-16');
    expect(byCab['ALPHA CONSEIL'].premierEtatAbsent).toBe('2026-08-13');
    // INTROUVABLE : aucune correspondance → non rapproché (jamais « sorti »).
    expect(byCab['INTROUVABLE SARL'].statut).toBe('non-rapproche');
  });

  it("concordance COFRAC → statut rouge, formulée comme concordance datée", () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['ALPHA CONSEIL'],
        etats,
        cofrac: [
          {
            date_releve: '2026-08-17',
            sha256: 'c',
            rows: [{ num: '3-1000', nom: 'ALPHA CONSEIL', date: '01/08/2026', commentaire: 'Retrait' }],
          },
        ],
      }),
    );
    expect(v.statuts[0].statut).toBe('sorti-concordance-cofrac');
    expect(v.statuts[0].concordance?.num).toBe('3-1000');
    expect(v.statuts[0].concordanceDate).toBe('2026-08-17');
  });

  it("alias curaté : identité établie → statut lu dans les états ; « jamais observé » si absent de tous", () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['ALPHA CONSULTING GROUPE', 'FANTOME EVAL'],
        etats,
        alias: [
          { oeNom: 'ALPHA CONSULTING GROUPE', siren: '111111111' },
          { oeNom: 'FANTOME EVAL', siren: '999999999' },
        ],
      }),
    );
    const byCab = Object.fromEntries(v.statuts.map((s) => [s.cabinet, s]));
    expect(byCab['ALPHA CONSULTING GROUPE'].statut).toBe('sorti-avec-numero');
    // SIREN établi par alias mais présent dans AUCUN état → jamais observé.
    expect(byCab['FANTOME EVAL'].statut).toBe('jamais-observe');
  });

  it("taux de rapprochement et compteur d'entrées de liste sans évaluations", () => {
    const v = buildAccreditationsView(
      baseInput({ cabinets: ['ALPHA CONSEIL', 'INCONNU'], etats }),
    );
    expect(v.tauxRapprochement).toEqual({ rapproches: 1, total: 2 });
    // Dernier état : BETA AUDIT (222222222) seul — SIREN non rapproché d'un
    // cabinet Synaé → compteur 1 (situation normale, pas une anomalie).
    expect(v.entreesListeSansEvaluations).toBe(1);
    // Sans paramètre `collecte` en entrée, le bloc est neutre (moteur pur).
    expect(v.collecte).toEqual({ sourceIntrouvableDepuis: null, prochaineCollecte: null });
  });
});

describe('buildAccreditationsView — chronologie (volet ②)', () => {
  it('états + bilans intercalés par date, mouvements, faits datés et signaux de collecte', () => {
    const v = buildAccreditationsView(
      baseInput({
        etats: [
          etat('2023-09-24', [org('1', 'A', '3-1'), org('2', 'B'), org('3', 'C')]),
          etat('2026-03-06', [org('2', 'B'), org('4', 'D', '3-2')]),
        ],
        bilans: [
          { date: '2024-12-31', autorises: 128, accredites: 87, derogation: 41, source: 'Bilan annuel HAS 2024' },
        ],
        faits: ['8 organismes sortis de la liste en 2024 à la demande des organismes eux-mêmes (source : Bilan annuel HAS 2024).'],
        collecte: { sourceIntrouvableDepuis: '2026-08-15', prochaineCollecte: '07:23' },
      }),
    );
    expect(v.chronologie.map((c) => `${c.kind}:${c.date}`)).toEqual([
      'etat:2023-09-24',
      'bilan:2024-12-31',
      'etat:2026-03-06',
    ]);
    expect(v.chronologie[0].organismes).toBe(3);
    expect(v.chronologie[0].accredites).toBe(1);
    expect(v.mouvements).toHaveLength(1);
    expect(v.mouvements[0]).toMatchObject({ de: '2023-09-24', a: '2026-03-06', entrees: 1, sorties: 2, jours: 894 });
    // Faits datés des bilans : transmis tels quels (encadré du volet ②).
    expect(v.faitsBilans).toEqual([
      '8 organismes sortis de la liste en 2024 à la demande des organismes eux-mêmes (source : Bilan annuel HAS 2024).',
    ]);
    // Signaux de collecte : le moteur transmet le bloc fourni par l'engine.
    expect(v.collecte).toEqual({ sourceIntrouvableDepuis: '2026-08-15', prochaineCollecte: '07:23' });
  });
});

describe('buildAccreditationsView — gardes de rapprochement', () => {
  it('homonymie stricte : deux SIREN portent le même nom normalisé → non rapproché', () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['DUPONT EVALUATION'],
        etats: [
          etat('2026-08-13', [
            org('111111111', 'DUPONT EVALUATION'),
            org('222222222', 'DUPONT ÉVALUATION SARL'),
          ]),
        ],
      }),
    );
    // Ambiguïté : jamais tranchée par le moteur (piste seulement, hors moteur).
    expect(v.statuts[0].statut).toBe('non-rapproche');
    expect(v.statuts[0].siren).toBeNull();
  });

  it("graphie historique d'un SIREN renommé égale au nom final d'un autre → non rapproché", () => {
    // Cas réel : un nom porté en 2023 par un SIREN (renommé depuis) est aussi
    // le nom final d'un autre SIREN — l'ambiguïté couvre TOUTES les graphies.
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['CABINET X'],
        etats: [
          etat('2023-09-24', [org('835149824', 'CABINET X')]),
          etat('2026-08-13', [
            org('835149824', 'AUTRE NOM'),
            org('420272973', 'CABINET X', '3-2052'),
          ]),
        ],
      }),
    );
    expect(v.statuts[0].statut).toBe('non-rapproche');
    expect(v.statuts[0].siren).toBeNull();
  });

  it('cabinet dont le nom se réduit à une forme juridique → non rapproché (clé vide jamais indexée)', () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['SARL'],
        etats: [etat('2026-08-13', [org('111111111', 'SA')])],
      }),
    );
    expect(v.statuts[0].statut).toBe('non-rapproche');
    expect(v.statuts[0].siren).toBeNull();
  });

  it('alias curaté prioritaire sur le rapprochement par nom', () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['GAMMA CONSEIL'],
        etats: [
          etat('2026-08-13', [
            org('111111111', 'GAMMA CONSEIL'),
            org('222222222', 'GAMMA QUALITE', '3-3000'),
          ]),
        ],
        alias: [{ oeNom: 'GAMMA CONSEIL', siren: '222222222' }],
      }),
    );
    expect(v.statuts[0].siren).toBe('222222222');
    expect(v.statuts[0].statut).toBe('accredite');
  });
});

describe('buildAccreditationsView — concordance corrélée à la fenêtre de sortie', () => {
  const etats = [
    etat('2026-07-16', [org('111111111', 'ALPHA CONSEIL', '3-1000')]),
    etat('2026-08-13', []),
  ];

  it('relevé COFRAC antérieur à la dernière présence → aucune concordance', () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['ALPHA CONSEIL'],
        etats,
        cofrac: [
          {
            date_releve: '2024-05-01',
            sha256: 'c1',
            rows: [{ num: '3-1000', nom: 'ALPHA CONSEIL', date: '30/04/2024', commentaire: 'Suspension' }],
          },
        ],
      }),
    );
    expect(v.statuts[0].statut).toBe('sorti-avec-numero');
    expect(v.statuts[0].concordance).toBeNull();
    expect(v.statuts[0].concordanceDate).toBeNull();
  });

  it('relevé COFRAC daté depuis la dernière présence → concordance datée', () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['ALPHA CONSEIL'],
        etats,
        cofrac: [
          {
            date_releve: '2026-08-17',
            sha256: 'c2',
            rows: [{ num: '3-1000', nom: 'ALPHA CONSEIL', date: '01/08/2026', commentaire: 'Retrait' }],
          },
        ],
      }),
    );
    expect(v.statuts[0].statut).toBe('sorti-concordance-cofrac');
    expect(v.statuts[0].concordanceDate).toBe('2026-08-17');
  });

  it('numéro historique retenu pour la concordance quand la dernière présence est sans numéro', () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['OMEGA CONTROLE'],
        etats: [
          etat('2026-05-07', [org('888888888', 'OMEGA CONTROLE', '3-8000')]),
          etat('2026-07-16', [org('888888888', 'OMEGA CONTROLE')]), // numéro disparu de la liste
          etat('2026-08-13', []),
        ],
        cofrac: [
          {
            date_releve: '2026-07-20',
            sha256: 'c3',
            rows: [{ num: '3-8000', nom: 'OMEGA CONTROLE', date: '10/07/2026', commentaire: 'Retrait' }],
          },
        ],
      }),
    );
    expect(v.statuts[0].statut).toBe('sorti-concordance-cofrac');
    expect(v.statuts[0].concordance?.num).toBe('3-8000');
    // Le champ num reste celui de la dernière présence (vide → null).
    expect(v.statuts[0].num).toBeNull();
  });
});

describe('buildAccreditationsView — statuts de présence et retours', () => {
  it('accrédité au dernier état → accredite ; sorti sans numéro → sorti', () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['DELTA CERT', 'EPSILON EVAL'],
        etats: [
          etat('2026-07-16', [
            org('444444444', 'DELTA CERT', '3-4000'),
            org('555555555', 'EPSILON EVAL'),
          ]),
          etat('2026-08-13', [org('444444444', 'DELTA CERT', '3-4000')]),
        ],
      }),
    );
    const byCab = Object.fromEntries(v.statuts.map((s) => [s.cabinet, s]));
    expect(byCab['DELTA CERT'].statut).toBe('accredite');
    expect(byCab['EPSILON EVAL'].statut).toBe('sorti');
  });

  it('sorti puis revenu au dernier état → statut de présence, fenêtre close au journal', () => {
    const v = buildAccreditationsView(
      baseInput({
        cabinets: ['ZETA AUDIT', 'ETA EVAL'],
        etats: [
          etat('2026-05-07', [org('666666666', 'ZETA AUDIT', '3-6000'), org('777777777', 'ETA EVAL')]),
          etat('2026-07-16', []),
          etat('2026-08-13', [org('666666666', 'ZETA AUDIT', '3-6000'), org('777777777', 'ETA EVAL')]),
        ],
      }),
    );
    const byCab = Object.fromEntries(v.statuts.map((s) => [s.cabinet, s]));
    expect(byCab['ZETA AUDIT'].statut).toBe('accredite');
    expect(byCab['ETA EVAL'].statut).toBe('autorise-sans-numero');
    const s6 = v.sorties.find((x) => x.siren === '666666666')!;
    expect(s6.revenu).toBe(true);
    expect(s6.dernierPresent).toBe('2026-05-07');
    expect(s6.premierAbsent).toBe('2026-07-16');
  });
});

describe('buildAccreditationsView — journal (volet ③)', () => {
  it('sorties dérivées des états, retours détectés, pistes attachées', () => {
    const v = buildAccreditationsView(
      baseInput({
        etats: [
          etat('2026-05-07', [org('1', 'STRATELYS'), org('2', 'STABLE'), org('3', 'REVENANT')]),
          etat('2026-07-16', [org('2', 'STABLE')]),
          etat('2026-08-13', [org('2', 'STABLE'), org('3', 'REVENANT')]),
        ],
        pistes: [
          { sortiSiren: '1', sortiNom: 'STRATELYS', revenuSiren: '9', revenuNom: 'STRATELYS 2', lecture: 'même nom, autre SIREN' },
        ],
      }),
    );
    // Deux sorties dans la fenêtre 05-07 → 07-16 ; le SIREN 3 revient au 08-13.
    const s1 = v.sorties.find((s) => s.siren === '1')!;
    expect(s1.motif).toBe('non indiqué par la source');
    expect(s1.piste?.lecture).toBe('même nom, autre SIREN');
    const s3 = v.sorties.find((s) => s.siren === '3')!;
    expect(s3.revenu).toBe(true);
  });
});
