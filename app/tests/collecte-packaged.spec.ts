import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGED = join(
  __dirname,
  "../release/win-unpacked/Observatoire Cabinets Evaluateurs d'ESSMS.exe",
);

// Précondition : poste EN LIGNE — le chemin --collecte teste net.isOnline() ; hors ligne, la collecte est sautée et ce spec échouerait pour une raison étrangère à son objet.
test('mode --collecte sans réseau : trou d’observation journalisé, sortie code 0', async () => {
  test.skip(!existsSync(PACKAGED), 'app packagée absente (lancer pnpm dist)');
  test.setTimeout(180_000);
  const ud = mkdtempSync(join(tmpdir(), 'obs-col-'));

  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(PACKAGED, ['--collecte', `--user-data-dir=${ud}`], {
      env: {
        ...process.env,
        // Ports fermés : échec réseau immédiat et déterministe.
        OBS_LISTE_HAS_URL: 'http://127.0.0.1:9/liste.pdf',
        OBS_COFRAC_URL: 'http://127.0.0.1:9/rrs.php',
      },
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('exit', (c) => resolve(c ?? -1));
    setTimeout(() => {
      child.kill();
      reject(new Error('le mode --collecte ne s’est pas terminé en 150 s'));
    }, 150_000);
  });

  expect(code).toBe(0);
  // L'archive locale du userData isolé porte l'amorce + le trou d'observation.
  const archiveRoot = join(ud, 'liste-has');
  const etats = readdirSync(join(archiveRoot, 'etats'));
  expect(etats.length).toBe(8); // l'amorce embarquée a été versée
  const index = readFileSync(join(archiveRoot, 'index.jsonl'), 'utf8');
  expect(index).toContain('"resultat":"echec"');
  expect(index).toContain('observation');
});
