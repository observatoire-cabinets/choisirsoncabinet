import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSettings, writeSettings, DEFAULT_SETTINGS } from './settings';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'obs-set-'));
});

describe('settings', () => {
  it('retourne les défauts si le fichier est absent (alpha 0,05, autoUpdate true, pas de tâche planifiée)', () => {
    const s = readSettings(dir);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.alpha).toBe(0.05);
    expect(s.autoUpdate).toBe(true);
    expect(s.collecteHeure).toBeNull();
    expect(s.tachePlanifiee).toBe(false);
  });

  it('persiste et relit', () => {
    writeSettings(dir, {
      alpha: 0.01,
      autoUpdate: false,
      outputDir: 'C:/out',
      collecteHeure: null,
      tachePlanifiee: false,
      derniereVersionRelue: null,
    });
    expect(readSettings(dir)).toEqual({
      alpha: 0.01,
      autoUpdate: false,
      outputDir: 'C:/out',
      collecteHeure: null,
      tachePlanifiee: false,
      derniereVersionRelue: null,
    });
  });

  it('ignore un fichier corrompu et revient aux défauts', () => {
    writeFileSync(join(dir, 'settings.json'), '{bad json', 'utf8');
    expect(readSettings(dir)).toEqual(DEFAULT_SETTINGS);
  });

  it('refuse un alpha invalide et garde le défaut 0,05', () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ alpha: 0.5, autoUpdate: true }), 'utf8');
    expect(readSettings(dir).alpha).toBe(0.05);
  });

  it('préserve tachePlanifiee et collecteHeure au cycle write → read', () => {
    writeSettings(dir, {
      alpha: 0.05,
      autoUpdate: true,
      outputDir: null,
      tachePlanifiee: true,
      collecteHeure: { heure: 7, minute: 30 },
      derniereVersionRelue: null,
    });
    const s = readSettings(dir);
    expect(s.tachePlanifiee).toBe(true);
    expect(s.collecteHeure).toEqual({ heure: 7, minute: 30 });
  });

  it('retombe sur les défauts (null / false) pour tachePlanifiee/collecteHeure de forme invalide', () => {
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({
        alpha: 0.05,
        autoUpdate: true,
        outputDir: null,
        tachePlanifiee: 'oui',
        collecteHeure: { heure: 24, minute: 30 },
      }),
      'utf8',
    );
    const s = readSettings(dir);
    // Fichier corrompu/ancien format : jamais de throw, retombe sur le défaut requis.
    expect(s.tachePlanifiee).toBe(false);
    expect(s.collecteHeure).toBeNull();
    // Minute hors bornes également rejetée.
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ alpha: 0.05, autoUpdate: true, outputDir: null, collecteHeure: { heure: 7, minute: 60 } }),
      'utf8',
    );
    expect(readSettings(dir).collecteHeure).toBeNull();
  });

  it('préserve derniereVersionRelue au cycle write → read ; forme invalide ou vide → null', () => {
    writeSettings(dir, {
      alpha: 0.05,
      autoUpdate: true,
      outputDir: null,
      collecteHeure: null,
      tachePlanifiee: false,
      derniereVersionRelue: '0.3.0',
    });
    expect(readSettings(dir).derniereVersionRelue).toBe('0.3.0');
    // Chaîne vide ou type inattendu : retombe sur null, jamais de throw.
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ alpha: 0.05, autoUpdate: true, outputDir: null, derniereVersionRelue: '' }),
      'utf8',
    );
    expect(readSettings(dir).derniereVersionRelue).toBeNull();
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ alpha: 0.05, autoUpdate: true, outputDir: null, derniereVersionRelue: 3 }),
      'utf8',
    );
    expect(readSettings(dir).derniereVersionRelue).toBeNull();
  });
});
