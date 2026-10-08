import { describe, it, expect } from 'vitest';
import {
  libelleEtatLogiciel,
  segmentEtatLogiciel,
  libelleMiseAJourDonnees,
  libelleErreurMiseAJour,
} from './reglages-textes';

describe('libelleEtatLogiciel', () => {
  it('non vérifiée et désactivée : libellés distincts de « application à jour »', () => {
    expect(libelleEtatLogiciel({ etat: 'non-verifie', versionDisponible: null }, true)).toBe(
      'mise à jour du logiciel non vérifiée',
    );
    expect(libelleEtatLogiciel({ etat: 'desactivee', versionDisponible: null }, false)).toBe(
      'mise à jour automatique du logiciel désactivée',
    );
  });

  it('autres états : libellés inchangés', () => {
    expect(libelleEtatLogiciel({ etat: 'a-jour', versionDisponible: null }, true)).toBe('application à jour');
    expect(libelleEtatLogiciel({ etat: 'prete', versionDisponible: '0.6.0' }, true)).toBe(
      'version 0.6.0 téléchargée — installée à la prochaine fermeture',
    );
    expect(libelleEtatLogiciel({ etat: 'telechargement', versionDisponible: '0.6.0' }, true)).toBe(
      'téléchargement d’une nouvelle version…',
    );
    expect(libelleEtatLogiciel({ etat: 'indisponible', versionDisponible: null }, true)).toBe(
      'vérification indisponible (hors ligne ?)',
    );
    expect(libelleEtatLogiciel({ etat: 'portable', versionDisponible: null }, true)).toBe(
      'mise à jour automatique non disponible en version portable — les données se mettent à jour normalement',
    );
    expect(libelleEtatLogiciel({ etat: 'portable', versionDisponible: null }, false)).toBe(
      'mise à jour automatique non disponible en version portable',
    );
  });
});

describe('segmentEtatLogiciel', () => {
  it('libellés qui nomment déjà le logiciel : sans préfixe « logiciel : »', () => {
    expect(segmentEtatLogiciel({ etat: 'non-verifie', versionDisponible: null }, true)).toBe(
      'mise à jour du logiciel non vérifiée',
    );
    expect(segmentEtatLogiciel({ etat: 'desactivee', versionDisponible: null }, false)).toBe(
      'mise à jour automatique du logiciel désactivée',
    );
  });

  it('autres états : préfixés « logiciel : »', () => {
    expect(segmentEtatLogiciel({ etat: 'a-jour', versionDisponible: null }, true)).toBe('logiciel : application à jour');
    expect(segmentEtatLogiciel({ etat: 'indisponible', versionDisponible: null }, true)).toBe(
      'logiciel : vérification indisponible (hors ligne ?)',
    );
    expect(segmentEtatLogiciel({ etat: 'prete', versionDisponible: '0.6.0' }, true)).toBe(
      'logiciel : version 0.6.0 téléchargée — installée à la prochaine fermeture',
    );
  });
});

describe('libelleMiseAJourDonnees', () => {
  it('hors ligne : rien n’a été tenté', () => {
    expect(libelleMiseAJourDonnees({ etat: 'hors-ligne' })).toBe('Hors ligne : rien n’a été tenté.');
  });

  it('cas nominal : liste archivée, COFRAC inchangé, données à jour', () => {
    expect(
      libelleMiseAJourDonnees({
        etat: 'termine',
        collecte: { liste: 'archive', cofrac: 'inchange' },
        donnees: { ok: true, note: null },
      }),
    ).toBe('Liste HAS : nouveau relevé archivé · COFRAC : inchangé · données Synaé/FINESS : à jour');
  });

  it('chaque résultat de la liste HAS a un libellé', () => {
    const liste = (l: 'archive' | 'inchange' | 'delta_refuse' | 'echec' | 'deja_fait'): string =>
      libelleMiseAJourDonnees({
        etat: 'termine',
        collecte: { liste: l, cofrac: 'archive' },
        donnees: { ok: true, note: null },
      });
    expect(liste('archive')).toContain('Liste HAS : nouveau relevé archivé');
    expect(liste('inchange')).toContain('Liste HAS : inchangée');
    expect(liste('delta_refuse')).toContain('Liste HAS : document archivé, lecture non concluante');
    expect(liste('echec')).toContain('Liste HAS : relevé impossible');
    expect(liste('deja_fait')).toContain('Liste HAS : déjà relevée aujourd’hui');
  });

  it('chaque résultat du COFRAC a un libellé', () => {
    const cofrac = (c: 'archive' | 'inchange' | 'echec' | 'deja_fait'): string =>
      libelleMiseAJourDonnees({
        etat: 'termine',
        collecte: { liste: 'inchange', cofrac: c },
        donnees: { ok: true, note: null },
      });
    expect(cofrac('archive')).toContain('COFRAC : nouveau relevé archivé');
    expect(cofrac('inchange')).toContain('COFRAC : inchangé');
    expect(cofrac('echec')).toContain('COFRAC : relevé impossible');
    expect(cofrac('deja_fait')).toContain('COFRAC : déjà relevé aujourd’hui');
  });

  it('collecte déjà en cours : dit, sans prétendre à un résultat', () => {
    const t = libelleMiseAJourDonnees({
      etat: 'termine',
      collecte: 'skipped',
      donnees: { ok: true, note: null },
    });
    expect(t).toMatch(/^Liste HAS et COFRAC : collecte déjà en cours/);
    expect(t).toContain('données Synaé/FINESS : à jour');
  });

  it('note de fraîcheur et échec du rafraîchissement : dits en clair, sans « avertissement »', () => {
    const note = 'FINESS : aucune publication plus récente que l’extrait du 03/09/2026, extrait actuel conservé';
    const t = libelleMiseAJourDonnees({
      etat: 'termine',
      collecte: { liste: 'inchange', cofrac: 'inchange' },
      donnees: { ok: true, note },
    });
    expect(t).toContain(`données Synaé/FINESS : à jour (${note})`);
    expect(t).not.toContain('avertissement');
    expect(
      libelleMiseAJourDonnees({
        etat: 'termine',
        collecte: { liste: 'inchange', cofrac: 'inchange' },
        donnees: { ok: false, message: 'HTTP 503' },
      }),
    ).toContain('données Synaé/FINESS : mise à jour impossible (HTTP 503), données actuelles conservées');
  });
});

describe('libelleErreurMiseAJour', () => {
  it('retire l’enveloppe technique de l’IPC et ne garde que la première ligne', () => {
    const e = new Error("Error invoking remote method 'miseAJourDonnees': Error: panne locale\n    at x (y.ts:1:1)");
    expect(libelleErreurMiseAJour(e)).toBe('Mise à jour impossible : panne locale');
  });
});
