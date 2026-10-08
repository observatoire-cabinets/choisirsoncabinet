import { describe, it, expect } from 'vitest';
import { ficheIndisponibleTexte } from './cabinet-fiche-text';

describe('ficheIndisponibleTexte', () => {
  it('aucune structure évaluée (cabinet inconnu) → « Aucune donnée pour ce cabinet. »', () => {
    expect(ficheIndisponibleTexte(0, '2026-05-12')).toBe('Aucune donnée pour ce cabinet.');
    expect(ficheIndisponibleTexte(0, null)).toBe('Aucune donnée pour ce cabinet.');
  });

  it('une structure évaluée → texte au singulier, date du répertoire FINESS au format JJ/MM/AAAA', () => {
    expect(ficheIndisponibleTexte(1, '2026-05-12')).toBe(
      "Fiche indisponible : la structure évaluée par ce cabinet n'est pas rattachée au répertoire FINESS " +
        "des entités juridiques (extraction du 12/05/2026), sur lequel reposent les analyses de cette fiche. " +
        "Elle reste consultable dans les onglets Cotations et Cabinet choisi.",
    );
  });

  it('plusieurs structures évaluées → texte au pluriel avec leur nombre', () => {
    expect(ficheIndisponibleTexte(4, '2026-05-12T00:00:00.000Z')).toBe(
      "Fiche indisponible : les 4 structures évaluées par ce cabinet ne sont pas rattachées au répertoire FINESS " +
        "des entités juridiques (extraction du 12/05/2026), sur lequel reposent les analyses de cette fiche. " +
        "Elles restent consultables dans les onglets Cotations et Cabinet choisi.",
    );
  });

  it('date du répertoire absente ou illisible → mention de la date omise', () => {
    const attendu =
      "Fiche indisponible : les 2 structures évaluées par ce cabinet ne sont pas rattachées au répertoire FINESS " +
      "des entités juridiques, sur lequel reposent les analyses de cette fiche. " +
      "Elles restent consultables dans les onglets Cotations et Cabinet choisi.";
    expect(ficheIndisponibleTexte(2, '')).toBe(attendu);
    expect(ficheIndisponibleTexte(2, null)).toBe(attendu);
    expect(ficheIndisponibleTexte(2, undefined)).toBe(attendu);
    expect(ficheIndisponibleTexte(2, 'inconnue')).toBe(attendu);
  });
});
