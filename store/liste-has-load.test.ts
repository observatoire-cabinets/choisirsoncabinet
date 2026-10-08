import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadListeHasSeed } from './liste-has-load';
import { buildAccreditationsView } from '../core/accreditations';

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

describe('amorce embarquée — pistes de rapprochement', () => {
  const seedDir = join(__dirname, '..', 'data', 'generated', 'liste-has');

  it('la sortie d’A-AMCOS (518991294) porte la piste vers 101854743', async () => {
    const seed = await loadListeHasSeed(seedDir);
    const v = buildAccreditationsView({
      cabinets: [], etats: seed.etats, bilans: seed.bilans, faits: seed.faits,
      pistes: seed.pistes, alias: seed.alias, cofrac: [],
    });
    const sortie = v.sorties.find((s) => s.siren === '518991294');
    expect(sortie?.dernierPresent).toBe('2026-08-13');
    expect(sortie?.premierAbsent).toBe('2026-10-06');
    expect(sortie?.piste).toEqual({
      sortiSiren: '518991294',
      sortiNom: 'A-AMCOS',
      revenuSiren: '101854743',
      revenuNom: 'A-AMCOS QUALITE EVALUATION ET CERTIFICATION',
      lecture: 'nom repris avec variation, autre SIREN',
    });
  });

  it('chaque piste désigne une sortie dérivée des états et un SIREN présent ensuite, sous les noms des états', async () => {
    const seed = await loadListeHasSeed(seedDir);
    const v = buildAccreditationsView({
      cabinets: [], etats: seed.etats, bilans: seed.bilans, faits: seed.faits,
      pistes: seed.pistes, alias: seed.alias, cofrac: [],
    });
    expect(seed.pistes.length).toBeGreaterThan(0);
    for (const p of seed.pistes) {
      const sortie = v.sorties.find((s) => s.siren === p.sortiSiren);
      expect(sortie, p.sortiSiren).toBeDefined();
      expect(sortie!.nom).toBe(p.sortiNom);
      expect(sortie!.piste).toEqual(p);
      const revenu = seed.etats
        .filter((e) => e.date_releve >= sortie!.premierAbsent)
        .flatMap((e) => e.organismes)
        .filter((o) => o.siren === p.revenuSiren);
      expect(revenu.length, p.revenuSiren).toBeGreaterThan(0);
      expect(revenu.map((o) => o.nom)).toContain(p.revenuNom);
    }
  });
});
