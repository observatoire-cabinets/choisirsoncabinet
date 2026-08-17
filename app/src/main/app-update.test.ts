import { describe, it, expect } from 'vitest';
import { reduceUpdateEvent, type AppUpdateState } from './app-update';

const initial: AppUpdateState = { etat: 'a-jour', versionDisponible: null };

describe('reduceUpdateEvent', () => {
  it('update-available → téléchargement, version exposée', () => {
    expect(reduceUpdateEvent(initial, { type: 'update-available', version: '0.5.0' })).toEqual({
      etat: 'telechargement',
      versionDisponible: '0.5.0',
    });
  });

  it('update-downloaded → prête à installer', () => {
    expect(
      reduceUpdateEvent({ etat: 'telechargement', versionDisponible: '0.5.0' }, { type: 'update-downloaded', version: '0.5.0' }),
    ).toEqual({ etat: 'prete', versionDisponible: '0.5.0' });
  });

  it('update-not-available → à jour, version effacée', () => {
    expect(
      reduceUpdateEvent({ etat: 'telechargement', versionDisponible: '0.5.0' }, { type: 'update-not-available' }),
    ).toEqual({ etat: 'a-jour', versionDisponible: null });
  });

  it("error → indisponible, la version connue n'est pas perdue", () => {
    expect(
      reduceUpdateEvent({ etat: 'telechargement', versionDisponible: '0.5.0' }, { type: 'error' }),
    ).toEqual({ etat: 'indisponible', versionDisponible: '0.5.0' });
  });
});
