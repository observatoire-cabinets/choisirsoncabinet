import { defineConfig } from '@playwright/test';

// Smoke tests Electron (_electron.launch). Un seul worker : l'app détient un
// dataset global + état alpha module — pas d'exécution concurrente.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // Le lancement d'Electron sous Playwright peut planter nativement de façon
  // transitoire (0xC0000409) sur Windows → 1 relance absorbe ce flake environnemental.
  retries: 1,
  reporter: [['list']],
});
