import { test, expect } from '@playwright/test';
import { launchApp } from './_app';

test('registre : >100 lignes de vie', async () => {
  const app = await launchApp();
  const win = await app.firstWindow();
  await win.locator('nav [data-screen="registre"]').click();
  await expect.poll(() => win.locator('#registre tbody tr').count()).toBeGreaterThan(100);
  await app.close();
});
