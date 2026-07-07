import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import {
  capacityBin,
  secteurFromCode,
  etabServiceFromCode,
  dromFromDepartement,
  semestreFromDate,
  groupeLucratifFromStatutEj,
  GROUPE_LUCRATIF_EJ_MIN,
  GROUPE_LUCRATIF_CONTRASTS,
  CAPACITY_CONTRASTS,
  SECTEUR_CONTRASTS,
  ETAB_SERVICE_CONTRASTS,
  DROM_CONTRASTS,
  SEMESTRE_CONTRASTS,
  analyzeCapacityByCabinetFromProd,
  analyzeSecteurByCabinetFromProd,
  analyzeEtabServiceByCabinetFromProd,
  analyzeDromByCabinetFromProd,
  analyzeSemestreByCabinetFromProd,
  analyzeRegionByCabinetFromProd,
  regionContrasts,
  nationalGapsForAxis,
  adjustedNationalGapsForAxis,
  adjustedRegionNationalGaps,
  adjustedStatutNationalGaps,
} from './fiche-categorical-axes';
import type { RawMonoMultiExtractRow, MonoMultiExtractPrisma } from './mono-multi-extract';

function mockPrisma(rows: RawMonoMultiExtractRow[]) {
  const queryRawUnsafe = vi.fn(async () => rows);
  return { $queryRawUnsafe: queryRawUnsafe as never } as MonoMultiExtractPrisma;
}

describe('capacityBin (fiche 6 — seuils petit<30 / moyen 30–99 / grand≥100)', () => {
  it.each([
    [null, null],
    [0, 'petit'],
    [29, 'petit'],
    [30, 'moyen'],
    [99, 'moyen'],
    [100, 'grand'],
    [250, 'grand'],
  ])('capacité %s → %s', (cap, expected) => {
    expect(capacityBin(cap as number | null)).toBe(expected);
  });
});

describe('secteurFromCode (fiche 5 — PA / PH adultes / PH enfants / Autres)', () => {
  it.each([
    ['500', 'PA'], // EHPAD
    ['202', 'PA'], // Résidences autonomie
    ['207', 'PA'], // Accueil de jour PA
    ['246', 'PH adultes'], // ESAT
    ['255', 'PH adultes'], // MAS
    ['437', 'PH adultes'], // FAM
    ['446', 'PH adultes'], // SAVS
    ['183', 'PH enfants'], // IME
    ['182', 'PH enfants'], // SESSAD
    ['190', 'PH enfants'], // CAMSP
    ['177', 'Autres'], // MECS (protection enfance)
    ['214', 'Autres'], // CHRS (inclusion sociale)
    ['460', 'Autres'], // SAA — domicile → Autres
    ['354', 'Autres'], // SSIAD — domicile → Autres
    ['', 'Autres'], // code absent
  ])('code %s → %s', (code, expected) => {
    expect(secteurFromCode(code)).toBe(expected);
  });
});

describe('etabServiceFromCode (fiche 9 — établissement vs service)', () => {
  it.each([
    ['246', 'établissement'], // ESAT → établissement (malgré "et Service")
    ['500', 'établissement'], // EHPAD
    ['183', 'établissement'], // IME
    ['255', 'établissement'], // MAS
    ['460', 'service'], // SAA
    ['354', 'service'], // SSIAD
    ['182', 'service'], // SESSAD
    ['446', 'service'], // SAVS
    ['445', 'service'], // SAMSAH
    ['340', 'service'], // MJPM
  ])('code %s → %s', (code, expected) => {
    expect(etabServiceFromCode(code)).toBe(expected);
  });
});

describe('etabServiceFromCode — allowlist (fix (a) : la référence n’est plus un fourre-tout)', () => {
  it.each([
    ['214', 'établissement'], // CHRS — hébergement
    ['437', 'établissement'], // FAM — hébergement
    ['249', 'établissement'], // Étab. ET Service Réadaptation Pro → étab (cohérent ESAT)
    ['198', 'établissement'], // Étab. ET Service Préorientation → étab
  ])('code établissement %s → %s', (code, expected) => {
    expect(etabServiceFromCode(code)).toBe(expected);
  });

  it.each([
    ['', 'code vide'],
    ['999', 'code inconnu (hors taxonomie)'],
    ['189', 'CMPP — ambulatoire'],
    ['190', 'CAMSP — ambulatoire'],
    ['463', 'CLIC — coordination'],
    ['355', 'Centre Hospitalier — hors ESSMS'],
    ['197', 'CSAPA — addictologie majoritairement ambulatoire'],
    ['207', 'Accueil de jour PA — pas d’hébergement'],
  ])('code exclu %s (%s) → null', (code) => {
    expect(etabServiceFromCode(code)).toBeNull();
  });
});

describe('dromFromDepartement (fiche 11 — DROM vs métropole)', () => {
  it.each([
    // Encodage HAS open data (lettre) — la forme réellement présente
    ['9A', 'DROM'], // Guadeloupe
    ['9B', 'DROM'], // Martinique
    ['9C', 'DROM'], // Guyane
    ['9D', 'DROM'], // La Réunion
    ['9F', 'DROM'], // Mayotte
    // Encodage INSEE classique (robustesse autres sources)
    ['971', 'DROM'],
    ['976', 'DROM'],
    ['987', 'DROM'], // collectivité (Polynésie)
    // Métropole — y compris les départements en 9x numérique
    ['75', 'métropole'],
    ['93', 'métropole'],
    ['95', 'métropole'], // Val-d'Oise — ne doit PAS être pris pour un DROM
    ['2A', 'métropole'], // Corse
    ['', null],
    [null, null],
  ])('département %s → %s', (dep, expected) => {
    expect(dromFromDepartement(dep as string | null)).toBe(expected);
  });
});

describe('semestreFromDate (fiche 8 — S1 jan–juin / S2 juil–déc)', () => {
  it('janvier → S1', () => {
    expect(semestreFromDate(new Date('2026-01-15T00:00:00Z'))).toBe('S1');
  });
  it('juin → S1', () => {
    expect(semestreFromDate(new Date('2026-06-30T00:00:00Z'))).toBe('S1');
  });
  it('juillet → S2', () => {
    expect(semestreFromDate(new Date('2026-07-01T00:00:00Z'))).toBe('S2');
  });
  it('décembre → S2', () => {
    expect(semestreFromDate(new Date('2026-12-31T00:00:00Z'))).toBe('S2');
  });
  it('accepte une chaîne ISO', () => {
    expect(semestreFromDate('2026-03-10')).toBe('S1');
  });
  it('null → null', () => {
    expect(semestreFromDate(null)).toBe(null);
  });
});

describe('groupeLucratifFromStatutEj (fiche 7 — proxy commercial × grand EJ)', () => {
  it.each([
    ['Privé commercial', 50, 'groupe'], // seuil
    ['Privé commercial', 428, 'groupe'],
    ['Privé commercial', 1, 'independant'], // mono
    ['Privé commercial', 10, null], // milieu exclu
    ['Privé commercial', 49, null], // sous le seuil mais pas mono → exclu
    ['Public', 100, null], // pas commercial
    ['Privé à but non lucratif', 1, null], // pas commercial
    ['', 50, null],
  ])('statut=%s ej=%s → %s', (statut, ej, expected) => {
    expect(groupeLucratifFromStatutEj(statut as string, ej as number)).toBe(expected);
  });

  it('EJ absent → null', () => {
    expect(groupeLucratifFromStatutEj('Privé commercial', null)).toBe(null);
  });

  it('seuil exposé', () => {
    expect(GROUPE_LUCRATIF_EJ_MIN).toBe(50);
  });
});

describe('contrastes par axe (référence → cibles)', () => {
  it('capacité : réf petit → moyen, grand', () => {
    expect(CAPACITY_CONTRASTS.map((c) => c.reference)).toEqual(['petit', 'petit']);
    expect(CAPACITY_CONTRASTS.map((c) => c.target)).toEqual(['moyen', 'grand']);
  });
  it('secteur : réf PA → 3 contrastes', () => {
    expect(SECTEUR_CONTRASTS).toHaveLength(3);
    expect(SECTEUR_CONTRASTS.every((c) => c.reference === 'PA')).toBe(true);
    expect(SECTEUR_CONTRASTS.map((c) => c.target)).toEqual(['PH adultes', 'PH enfants', 'Autres']);
  });
  it('étab/service : réf établissement → service', () => {
    expect(ETAB_SERVICE_CONTRASTS).toHaveLength(1);
    expect(ETAB_SERVICE_CONTRASTS[0]).toMatchObject({ reference: 'établissement', target: 'service' });
  });
  it('DROM : réf métropole → DROM', () => {
    expect(DROM_CONTRASTS).toHaveLength(1);
    expect(DROM_CONTRASTS[0]).toMatchObject({ reference: 'métropole', target: 'DROM' });
  });
  it('semestre : réf S1 → S2', () => {
    expect(SEMESTRE_CONTRASTS).toHaveLength(1);
    expect(SEMESTRE_CONTRASTS[0]).toMatchObject({ reference: 'S1', target: 'S2' });
  });
  it('groupe lucratif : réf indépendant → groupe', () => {
    expect(GROUPE_LUCRATIF_CONTRASTS).toHaveLength(1);
    expect(GROUPE_LUCRATIF_CONTRASTS[0]).toMatchObject({ reference: 'independant', target: 'groupe' });
  });
});

describe('analyzeCapacityByCabinetFromProd (axe capacité par cabinet)', () => {
  it('produit un rapport par contraste avec écart par cabinet', async () => {
    const prisma = mockPrisma([
      { score: 10, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', capacity: 20 },
      { score: 12, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', capacity: 25 },
      { score: 20, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', capacity: 150 },
      { score: 22, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', capacity: 160 },
    ]);
    const reports = await analyzeCapacityByCabinetFromProd(prisma);
    expect(reports.map((r) => r.id)).toEqual(['moyen_vs_petit', 'grand_vs_petit']);
    const grand = reports.find((r) => r.id === 'grand_vs_petit')!;
    const a = grand.summary; // 1 cabinet : médiane = son écart = 21 - 11 = 10
    expect(a.totalCabinets).toBe(1);
    expect(grand.results.length).toBeGreaterThan(0);
    expect(grand.results[0].rank).toBe(1);
  });

  it('ignore les lignes sans capacité (LEFT JOIN non résolu)', async () => {
    const prisma = mockPrisma([
      { score: 11, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', capacity: 20 }, // petit
      { score: 99, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', capacity: null }, // ignorée
      { score: 21, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', capacity: 150 }, // grand
    ]);
    const reports = await analyzeCapacityByCabinetFromProd(prisma);
    const grand = reports.find((r) => r.id === 'grand_vs_petit')!;
    // écart = grand(21) − petit(11) = 10 ; la ligne capacité null n'a pas pollué
    expect(grand.summary.totalCabinets).toBe(1);
    expect(grand.summary.medianGap).toBeCloseTo(10, 6);
  });
});

describe('analyzeSecteurByCabinetFromProd', () => {
  it('classe par code FINESS et produit 3 contrastes vs PA', async () => {
    const prisma = mockPrisma([
      { score: 80, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', code: '500' }, // PA
      { score: 70, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', code: '255' }, // PH adultes
    ]);
    const reports = await analyzeSecteurByCabinetFromProd(prisma);
    expect(reports.map((r) => r.id)).toEqual(['ph_adultes_vs_pa', 'ph_enfants_vs_pa', 'autres_vs_pa']);
    const phA = reports.find((r) => r.id === 'ph_adultes_vs_pa')!;
    expect(phA.summary.totalCabinets).toBe(1); // A a du PA et du PH adultes
  });
});

describe('analyzeEtabServiceByCabinetFromProd', () => {
  it('un seul contraste service vs établissement', async () => {
    const prisma = mockPrisma([
      { score: 80, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', code: '500' }, // étab
      { score: 90, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', code: '460' }, // service
    ]);
    const reports = await analyzeEtabServiceByCabinetFromProd(prisma);
    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe('service_vs_etablissement');
  });
});

describe('analyzeDromByCabinetFromProd', () => {
  it('un seul contraste DROM vs métropole', async () => {
    const prisma = mockPrisma([
      { score: 80, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', departement: '75' },
      { score: 70, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', departement: '971' },
    ]);
    const reports = await analyzeDromByCabinetFromProd(prisma);
    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe('drom_vs_metropole');
  });
});

describe('analyzeSemestreByCabinetFromProd', () => {
  it('un seul contraste S2 vs S1', async () => {
    const prisma = mockPrisma([
      { score: 80, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', eval_date: '2026-02-01' },
      { score: 70, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', eval_date: '2026-09-01' },
    ]);
    const reports = await analyzeSemestreByCabinetFromProd(prisma);
    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe('s2_vs_s1');
  });
});

describe('regionContrasts (dynamique : réf = région au plus gros volume, top-K cibles)', () => {
  const rows = [
    { cabinet: 'A', score: 1, category: 'IDF' },
    { cabinet: 'A', score: 1, category: 'IDF' },
    { cabinet: 'A', score: 1, category: 'IDF' },
    { cabinet: 'A', score: 1, category: 'IDF' },
    { cabinet: 'A', score: 1, category: 'PACA' },
    { cabinet: 'A', score: 1, category: 'PACA' },
    { cabinet: 'A', score: 1, category: 'BRET' },
  ];
  it('référence = IDF (plus gros N), cibles ordonnées par volume', () => {
    const contrasts = regionContrasts(rows, 5);
    expect(contrasts.every((c) => c.reference === 'IDF')).toBe(true);
    expect(contrasts.map((c) => c.target)).toEqual(['PACA', 'BRET']);
  });
  it('plafonne le nombre de cibles à K', () => {
    expect(regionContrasts(rows, 1)).toHaveLength(1);
    expect(regionContrasts(rows, 1)[0].target).toBe('PACA');
  });
});

describe('analyzeRegionByCabinetFromProd', () => {
  it('produit un rapport par région cible vs la région de référence', async () => {
    const prisma = mockPrisma([
      { score: 80, is_multi: false, region: 'IDF', statut: 'S', categ: 'C', cabinet: 'A' },
      { score: 82, is_multi: false, region: 'IDF', statut: 'S', categ: 'C', cabinet: 'A' },
      { score: 70, is_multi: false, region: 'PACA', statut: 'S', categ: 'C', cabinet: 'A' },
    ]);
    const reports = await analyzeRegionByCabinetFromProd(prisma, 5);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect(reports[0].label).toMatch(/PACA/);
  });
});

describe('adjustedRegionNationalGaps (fiche 4 — région ajustée secteur+statut)', () => {
  it('renvoie gapRaw ET gapAdj par région cible vs la référence (dynamique)', async () => {
    const mk = (region: string, code: string, score: number): RawMonoMultiExtractRow => ({
      score, is_multi: false, region, statut: 'Public', categ: 'C', cabinet: 'A', code,
    });
    const prisma = mockPrisma([
      mk('IDF', '500', 80), mk('IDF', '500', 82), mk('IDF', '460', 70),
      mk('PACA', '500', 75), mk('PACA', '460', 73), mk('PACA', '500', 78),
    ]);
    const gaps = await adjustedRegionNationalGaps(prisma, 5);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].label).toMatch(/PACA/);
    expect(gaps[0].gapRaw).toBeCloseTo(-2, 6); // PACA 75,33 − IDF 77,33
    expect(gaps[0].gapAdj).not.toBeNull();
  });
});

describe('adjustedStatutNationalGaps (fiche 2 — statut ajusté secteur+région)', () => {
  it('renvoie gapRaw + gapAdj pour les deux contrastes vs Public', async () => {
    const mk = (statut: string, code: string, score: number): RawMonoMultiExtractRow => ({
      score, is_multi: false, region: 'IDF', statut, categ: 'C', cabinet: 'A', code,
    });
    const prisma = mockPrisma([
      mk('Public', '500', 80), mk('Public', '500', 82),
      mk('Privé à but non lucratif', '500', 85), mk('Privé à but non lucratif', '460', 83),
      mk('Privé commercial', '500', 88), mk('Privé commercial', '460', 90),
    ]);
    const gaps = await adjustedStatutNationalGaps(prisma);
    expect(gaps).toHaveLength(2);
    expect(gaps[0].label).toMatch(/non lucratif/i);
    expect(gaps[1].label).toMatch(/commercial/i);
    expect(gaps[0].gapRaw).not.toBeNull();
    expect(gaps[0].gapAdj).not.toBeNull();
  });
});

describe('nationalGapsForAxis', () => {
  it('calcule l’écart national brut par contraste', () => {
    const raw: RawMonoMultiExtractRow[] = [
      { score: 80, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', code: '500' },
      { score: 90, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', code: '460' },
    ];
    const gaps = nationalGapsForAxis(raw, (r) => etabServiceFromCode(r.code), ETAB_SERVICE_CONTRASTS);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gap).toBeCloseTo(10, 6); // service 90 − étab 80
  });
});

describe('adjustedNationalGapsForAxis (option 1 — gap ajusté OLS)', () => {
  // Cas confondu par le secteur : effet propre intra-secteur = +2 (service > étab)
  // dans PH adultes ET Autres, mais l'étab est concentré dans PH adultes (haut) et
  // le service dans Autres (bas) → le BRUT s'inverse à −3. Contrôler le secteur
  // doit récupérer +2.
  const mk = (score: number, code: string): RawMonoMultiExtractRow => ({
    score, is_multi: false, region: 'R', statut: 'S', categ: 'C', cabinet: 'A', code,
  });
  const raw: RawMonoMultiExtractRow[] = [
    mk(88, '255'), mk(88, '255'), mk(88, '255'), // étab PH adultes (MAS)
    mk(90, '446'),                                // service PH adultes (SAVS)
    mk(78, '177'),                                // étab Autres (MECS)
    mk(80, '460'), mk(80, '460'), mk(80, '460'), // service Autres (SAA)
  ];

  it('renvoie gapRaw ET gapAdj ; le brut s’inverse, l’ajusté récupère l’effet intra-secteur', () => {
    const gaps = adjustedNationalGapsForAxis(
      raw, (r) => etabServiceFromCode(r.code), ETAB_SERVICE_CONTRASTS, ['secteur'],
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapRaw).toBeCloseTo(-3, 6);  // service 82,5 − étab 85,5
    expect(gaps[0].gapAdj).toBeCloseTo(2, 6);   // ajusté secteur → +2 (inversion)
    expect(gaps[0].n).toBe(8);
    expect(gaps[0].ciLow).not.toBeNull();
  });

  it('expose `verif` : n / moyenne / écart-type par groupe + réconciliation de l’écart brut', () => {
    const [g] = adjustedNationalGapsForAxis(
      raw, (r) => etabServiceFromCode(r.code), ETAB_SERVICE_CONTRASTS, ['secteur'],
    );
    const v = g.verif!;
    expect(v.nReference).toBe(4); // étab : 88,88,88,78
    expect(v.nTarget).toBe(4); // service : 90,80,80,80
    expect(v.meanReference).toBeCloseTo(85.5, 6);
    expect(v.meanTarget).toBeCloseTo(82.5, 6);
    expect(v.sdReference).toBeCloseTo(5, 6); // sd([88,88,88,78])
    expect(v.sdTarget).toBeCloseTo(5, 6); // sd([90,80,80,80])
    // INVARIANT : moyenne(cible) − moyenne(référence) == gapRaw (la table réconcilie la tête)
    expect(v.meanTarget - v.meanReference).toBeCloseTo(g.gapRaw!, 6);
    expect(v.se).not.toBeNull();
    expect(v.t).not.toBeNull();
    expect(v.k).toBeGreaterThan(0);
  });

  it('verif.sd null si un groupe a moins de 2 observations', () => {
    const sparse = [mk(88, '255'), mk(88, '255'), mk(90, '446')]; // étab×2 + service×1
    const [g] = adjustedNationalGapsForAxis(
      sparse, (r) => etabServiceFromCode(r.code), ETAB_SERVICE_CONTRASTS, ['secteur'],
    );
    expect(g.verif!.nTarget).toBe(1);
    expect(g.verif!.sdTarget).toBeNull();
  });

  it('contraste dégénéré (un seul groupe) → gapAdj null, pas de crash', () => {
    const onlyEtab = [mk(88, '255'), mk(90, '177')];
    const gaps = adjustedNationalGapsForAxis(
      onlyEtab, (r) => etabServiceFromCode(r.code), ETAB_SERVICE_CONTRASTS, ['secteur'],
    );
    expect(gaps[0].gapAdj).toBeNull();
  });

  it('stratifyBy=statut → byStratum révèle l’interaction (effet inversé selon le statut)', () => {
    const row = (statut: string, code: string, score: number): RawMonoMultiExtractRow => ({
      score, is_multi: false, region: 'R', statut, categ: 'C', cabinet: 'A', code,
    });
    const raw: RawMonoMultiExtractRow[] = [
      row('Public', '500', 75), row('Public', '500', 75), // PA public
      row('Public', '255', 83), row('Public', '255', 83), // PH adultes public → +8
      row('Privé commercial', '500', 88), row('Privé commercial', '500', 88), // PA commercial
      row('Privé commercial', '255', 78), row('Privé commercial', '255', 78), // PH adultes commercial → −10
    ];
    const [g] = adjustedNationalGapsForAxis(
      raw, (r) => secteurFromCode(r.code), [SECTEUR_CONTRASTS[0]], ['statut', 'region'], 'statut',
    );
    expect(g.byStratum).toBeDefined();
    const pub = g.byStratum!.find((s) => s.stratum === 'Public');
    const com = g.byStratum!.find((s) => /commercial/i.test(s.stratum));
    expect(pub!.gap).toBeCloseTo(8, 6);
    expect(com!.gap).toBeCloseTo(-10, 6);
  });
});
