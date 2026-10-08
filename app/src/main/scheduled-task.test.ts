import { describe, it, expect } from 'vitest';
import { buildTaskXml, TASK_NAME, tirerHeureCollecte, doitEnregistrerTache, memeExecutable } from './scheduled-task';
import { DEFAULT_SETTINGS } from './settings';

describe('buildTaskXml', () => {
  const xml = buildTaskXml("C:\\Users\\U\\AppData\\Local\\Programs\\obs\\Observatoire Cabinets Evaluateurs d'ESSMS.exe", 7, 23);

  it("XML valide : exécutable cité, argument --collecte, heure, rattrapage, principal déclaré", () => {
    expect(xml).toContain('<Command>');
    expect(xml).toContain("Observatoire Cabinets Evaluateurs d'ESSMS.exe");
    expect(xml).toContain('<Arguments>--collecte</Arguments>');
    expect(xml).toContain('<StartBoundary>2026-01-01T07:23:00</StartBoundary>');
    // Rattrapage si le poste était éteint : exigence, pas une option.
    expect(xml).toContain('<StartWhenAvailable>true</StartWhenAvailable>');
    expect(xml).toContain('<ScheduleByDay>');
    // Le Context="Author" des Actions référence un principal DÉCLARÉ.
    expect(xml).toContain('<Principal id="Author">');
  });

  it("l'apostrophe du chemin reste brute (contenu d'élément XML : seuls & et < s'échappent)", () => {
    expect(xml).toContain("d'ESSMS.exe");
    expect(xml).not.toContain('&apos;');
  });
});

describe('TASK_NAME', () => {
  it("ne contient aucun caractère qui romprait son interpolation littérale dans la commande PowerShell", () => {
    // Invariant qui rend sûre l'interpolation directe de TASK_NAME (guillemets
    // doubles côté Register, sans échappement) dans les commandes PowerShell.
    expect(TASK_NAME).not.toMatch(/[`"$']/);
  });
});

describe('tirerHeureCollecte', () => {
  it('tire une heure entre 06:00 et 21:59, stable pour une même graine', () => {
    const a = tirerHeureCollecte('poste-graine');
    const b = tirerHeureCollecte('poste-graine');
    expect(a).toEqual(b);
    expect(a.heure).toBeGreaterThanOrEqual(6);
    expect(a.heure).toBeLessThanOrEqual(21);
    expect(a.minute).toBeGreaterThanOrEqual(0);
    expect(a.minute).toBeLessThanOrEqual(59);
  });
});

describe('memeExecutable', () => {
  it('sous Windows : une autre casse du même chemin reste le même exécutable', () => {
    expect(memeExecutable('C:/Users/U/App/Observatoire.exe', 'c:/users/u/app/OBSERVATOIRE.EXE', 'win32')).toBe(true);
  });
  it('sous Windows : un autre chemin reste un autre exécutable', () => {
    expect(memeExecutable('C:/a/app.exe', 'C:/b/app.exe', 'win32')).toBe(false);
  });
  it('hors Windows : comparaison stricte (la casse distingue deux fichiers)', () => {
    expect(memeExecutable('/opt/App', '/opt/app', 'linux')).toBe(false);
    expect(memeExecutable('/opt/app', '/opt/app', 'linux')).toBe(true);
  });
});

describe('doitEnregistrerTache', () => {
  const s = { ...DEFAULT_SETTINGS, autoUpdate: true, tachePlanifiee: true, tacheExe: 'C:/a/app.exe' };
  it('même exécutable déjà enregistré → non', () => expect(doitEnregistrerTache(s, 'C:/a/app.exe')).toBe(false));
  it('exécutable déplacé ou remplacé → oui', () => expect(doitEnregistrerTache(s, 'C:/b/app.exe')).toBe(true));
  it('jamais enregistrée → oui', () => expect(doitEnregistrerTache({ ...s, tachePlanifiee: false }, 'C:/a/app.exe')).toBe(true));
  it('chemin inconnu (réglages d’une version antérieure) → oui', () => expect(doitEnregistrerTache({ ...s, tacheExe: null }, 'C:/a/app.exe')).toBe(true));
  it.runIf(process.platform === 'win32')('même exécutable, autre casse (Windows) → non', () => expect(doitEnregistrerTache(s, 'c:/A/APP.exe')).toBe(false));
  it('mise à jour automatique désactivée → non', () => expect(doitEnregistrerTache({ ...s, autoUpdate: false }, 'C:/b/app.exe')).toBe(false));
});
