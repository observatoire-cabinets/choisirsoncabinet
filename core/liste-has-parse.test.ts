import { describe, it, expect } from 'vitest';
import { parseListeHasText } from './liste-has-parse';

// Mise en page 2023+ : un champ par ligne, le SIREN clôt l'enregistrement.
const LAYOUT_2023 = `Liste des organismes autorisés à évaluer les établissements et services visés à l'article L.312-1 du
code de l'action sociale et des familles.
Actualisée le 13 août 2026
Auvergne-Rhône-Alpes
26 - Drôme
NOM DES ORGANISMES NUMÉRO
D'ACCRÉDITATION ADRESSE POSTALE NUMÉRO SIREN
CIDEES CERTIFICATION 3-1971
5 AV DE LA GARE
26958 VALENCE CEDEX 9
France
849526678
INGERIS INSPECTION 3-2106
CHEMIN DE LA DÉCELLE
26130 SAINT-PAUL-TROIS-
CHÂTEAUX
France
480506773
38 - Isère
NOM DES ORGANISMES NUMÉRO
D'ACCRÉDITATION ADRESSE POSTALE NUMÉRO SIREN
1
SANS NUMERO CONSEIL
480 CHE DU GRAND ENVELUMP
38730 CHELIEU
France
791210719
`;

// Mise en page 2022 : enregistrement monoligne, SIREN en fin de ligne.
const LAYOUT_2022 = `Liste des organismes autorisés à évaluer les établissements
Actualisée le 11 octobre 2022
Auvergne-Rhône-Alpes
26 - Drôme
NOM DES ORGANISMES NUMÉRO D'ACCRÉDITATION ADRESSE POSTALE NUMÉRO SIREN
CIDEES CERTIFICATION 5 AV DE LA GARE 26958 VALENCE CEDEX 9 France 849526678
`;

describe('parseListeHasText — mise en page 2023+', () => {
  const etat = parseListeHasText(LAYOUT_2023);

  it('lit la date revendiquée par le document', () => {
    expect(etat.date_source).toBe('13 août 2026');
  });

  it('extrait les organismes avec SIREN, nom, numéro, département', () => {
    expect(etat.organismes).toHaveLength(3);
    expect(etat.organismes[0]).toEqual({
      siren: '849526678',
      nom: 'CIDEES CERTIFICATION',
      num: '3-1971',
      dept: '26',
    });
    // Adresse multiligne (SAINT-PAUL-TROIS- / CHÂTEAUX) absorbée sans polluer le nom.
    expect(etat.organismes[1]).toEqual({
      siren: '480506773',
      nom: 'INGERIS INSPECTION',
      num: '3-2106',
      dept: '26',
    });
  });

  it("un organisme sans numéro a num vide, et le numéro de page isolé n'est pas collé au nom", () => {
    expect(etat.organismes[2]).toEqual({
      siren: '791210719',
      nom: 'SANS NUMERO CONSEIL',
      num: '',
      dept: '38',
    });
  });
});

describe('parseListeHasText — mise en page 2022 (monoligne)', () => {
  const etat = parseListeHasText(LAYOUT_2022);

  it('détache le SIREN de fin de ligne et coupe le nom avant l’adresse', () => {
    expect(etat.date_source).toBe('11 octobre 2022');
    expect(etat.organismes).toEqual([
      { siren: '849526678', nom: 'CIDEES CERTIFICATION', num: '', dept: '26' },
    ]);
  });
});

describe('parseListeHasText — garde-fous', () => {
  it('texte méconnaissable → zéro organisme (jamais de faux positifs)', () => {
    const etat = parseListeHasText('page totalement differente sans structure');
    expect(etat.organismes).toEqual([]);
    expect(etat.date_source).toBeNull();
  });
});

describe('parseListeHasText — fusion de blocs (enregistrement sans ligne SIREN)', () => {
  it("le SIREN reçoit le nom du DERNIER enregistrement du bloc, pas du premier", () => {
    // Cas réel (état 2023-09-24) : un enregistrement sans ligne SIREN fusionne
    // avec le suivant — deux adresses complètes (deux codes postaux) séparées
    // par des lignes-noms. Le nom attribué au SIREN doit être celui qui précède
    // le DERNIER segment d'adresse.
    const texte = `64 - Pyrénées-Atlantiques
NOM DES ORGANISMES NUMÉRO
D'ACCRÉDITATION ADRESSE POSTALE NUMÉRO SIREN
CABINET SANS SIREN
15 RUE DES MOUETTES
64200 BIARRITZ
France
MEDICONSEIL FORMATION
77 AV DES LILAS
64000 PAU
France
835149824
`;
    const etat = parseListeHasText(texte);
    expect(etat.organismes).toEqual([
      { siren: '835149824', nom: 'MEDICONSEIL FORMATION', num: '', dept: '64' },
    ]);
  });
});

describe('parseListeHasText — en-tête de département : tiret collé aux chiffres', () => {
  it("une ligne d'adresse « 10-12 RUE DES LILAS » n'est pas prise pour un en-tête de département", () => {
    const texte = `75 - Paris
NOM DES ORGANISMES NUMÉRO
D'ACCRÉDITATION ADRESSE POSTALE NUMÉRO SIREN
ORGANISME TEST
CHEMIN DES ROSES
10-12 RUE DES LILAS
75001 PARIS
France
123456789
`;
    const etat = parseListeHasText(texte);
    expect(etat.organismes).toEqual([
      { siren: '123456789', nom: 'ORGANISME TEST', num: '', dept: '75' },
    ]);
  });

  it("un en-tête « 2B - Haute-Corse » (avec espaces) pose dept: '2B' pour l'organisme qui suit", () => {
    const texte = `2B - Haute-Corse
NOM DES ORGANISMES NUMÉRO
D'ACCRÉDITATION ADRESSE POSTALE NUMÉRO SIREN
CORSE CONTROLE 3-4501
5 RUE NAPOLEON
20200 BASTIA
France
987654321
`;
    const etat = parseListeHasText(texte);
    expect(etat.organismes).toEqual([
      { siren: '987654321', nom: 'CORSE CONTROLE', num: '3-4501', dept: '2B' },
    ]);
  });
});
