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
  it('retourne les défauts si le fichier est absent (alpha 0,05, autoUpdate true)', () => {
    const s = readSettings(dir);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.alpha).toBe(0.05);
    expect(s.autoUpdate).toBe(true);
  });

  it('persiste et relit', () => {
    writeSettings(dir, { alpha: 0.01, autoUpdate: false, outputDir: 'C:/out' });
    expect(readSettings(dir)).toEqual({ alpha: 0.01, autoUpdate: false, outputDir: 'C:/out' });
  });

  it('ignore un fichier corrompu et revient aux défauts', () => {
    writeFileSync(join(dir, 'settings.json'), '{bad json', 'utf8');
    expect(readSettings(dir)).toEqual(DEFAULT_SETTINGS);
  });

  it('refuse un alpha invalide et garde le défaut 0,05', () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ alpha: 0.5, autoUpdate: true }), 'utf8');
    expect(readSettings(dir).alpha).toBe(0.05);
  });
});
