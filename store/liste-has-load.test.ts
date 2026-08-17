import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadListeHasSeed } from './liste-has-load';

describe('loadListeHasSeed', () => {
  it("lit l'amorce (5 fichiers) depuis un dossier", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'obs-seed-'));
    await writeFile(join(dir, 'etats.json'), JSON.stringify([{ date_source: 'x', date_releve: '2022-10-11', sha256: 'a', organismes: [] }]), 'utf8');
    await writeFile(join(dir, 'bilans.json'), '[]', 'utf8');
    await writeFile(join(dir, 'faits.json'), JSON.stringify(['Fait daté sourcé (Bilan annuel HAS 2024).']), 'utf8');
    await writeFile(join(dir, 'pistes.json'), '[]', 'utf8');
    await writeFile(join(dir, 'alias.json'), '[]', 'utf8');
    const seed = await loadListeHasSeed(dir);
    expect(seed.etats).toHaveLength(1);
    expect(seed.bilans).toEqual([]);
    expect(seed.faits).toEqual(['Fait daté sourcé (Bilan annuel HAS 2024).']);
  });

  it('dossier absent → amorce vide (l’app reste fonctionnelle)', async () => {
    const seed = await loadListeHasSeed(join(tmpdir(), 'obs-inexistant-xyz'));
    expect(seed.etats).toEqual([]);
    expect(seed.alias).toEqual([]);
    expect(seed.faits).toEqual([]);
  });
});
