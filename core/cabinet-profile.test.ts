import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  PHARE_CONTRASTS,
  buildCabinetProfiles,
  SPECIALIZED_DOMINANT_SHARE,
  sortMetaRanking,
  toCategorical,
  type CabinetProfile,
} from './cabinet-profile';
import { setSignificanceAlpha, significanceAlpha } from './significance';
import { deriveStatut } from './fiche-categorical-axes';
import { loadDataset } from '../store/load';
import { extractRows } from '../store/extract';
import type { RawMonoMultiExtractRow } from './mono-multi-extract';

function row(p: Partial<RawMonoMultiExtractRow>): RawMonoMultiExtractRow {
  return { score: 80, is_multi: false, region: 'R', statut: 'Public', categ: 'C', cabinet: 'A', code: '500', ...p };
}

describe('PHARE_CONTRASTS', () => {
  it('couvre les 7 axes phares avec un contraste binaire chacun', () => {
    expect(PHARE_CONTRASTS.map((p) => p.axisId)).toEqual([
      'mono_multi', 'statut', 'secteur', 'capacite', 'groupe_lucratif', 'temporel', 'etab_service',
    ]);
    for (const p of PHARE_CONTRASTS) {
      expect(typeof p.derive).toBe('function');
      expect(p.contrast.reference).toBeTruthy();
      expect(p.contrast.target).toBeTruthy();
    }
  });
});

describe('buildCabinetProfiles', () => {
  it('niveau global = moyenne cabinet − moyenne nationale', () => {
    const raw = [
      row({ cabinet: 'A', score: 90 }), row({ cabinet: 'A', score: 90 }),
      row({ cabinet: 'B', score: 70 }), row({ cabinet: 'B', score: 70 }),
    ];
    const profs = buildCabinetProfiles(raw);
    expect(profs.find((p) => p.cabinet === 'A')!.niveauGlobal).toBeCloseTo(10, 6);
    expect(profs.find((p) => p.cabinet === 'B')!.niveauGlobal).toBeCloseTo(-10, 6);
  });

  it('portefeuille : secteur dominant, part, HHI, étiquette spécialisé', () => {
    const raw = [
      row({ cabinet: 'A', code: '500' }), row({ cabinet: 'A', code: '500' }),
      row({ cabinet: 'A', code: '500' }), row({ cabinet: 'A', code: '183' }),
    ];
    const a = buildCabinetProfiles(raw).find((p) => p.cabinet === 'A')!;
    expect(a.portfolio.dominantSecteur).toBe('PA');
    expect(a.portfolio.dominantShare).toBeCloseTo(0.75, 6);
    expect(a.portfolio.specialized).toBe(true);
    expect(a.portfolio.hhi).toBeCloseTo(0.75 * 0.75 + 0.25 * 0.25, 6);
  });

  it('axes : un headline par contraste phare, effectifs par groupe + comptage des axes significatifs', () => {
    const raw = [
      row({ cabinet: 'A', is_multi: false, score: 70 }),
      row({ cabinet: 'A', is_multi: true, score: 90 }), row({ cabinet: 'A', is_multi: true, score: 92 }),
      row({ cabinet: 'A', is_multi: true, score: 94 }),
    ];
    const a = buildCabinetProfiles(raw).find((p) => p.cabinet === 'A')!;
    const mm = a.axes.find((ax) => ax.axisId === 'mono_multi')!;
    expect(mm.gap).toBeCloseTo(22, 6);
    expect(mm.reliability).toBe('descriptif');
    // Groupe de référence = mono, groupe cible = multi (asymétrique : détecte une inversion).
    expect(mm.nUnexposed).toBe(1);
    expect(mm.nExposed).toBe(3);
    // Axe temporel : aucune ligne datée → aucun effectif, ni écart.
    const temporel = a.axes.find((ax) => ax.axisId === 'temporel')!;
    expect(temporel.gap).toBeNull();
    expect(temporel.nUnexposed).toBe(0);
    expect(temporel.nExposed).toBe(0);
    // Axe statut : seulement des lignes « Public » (référence) → effectif nul côté cible.
    const statut = a.axes.find((ax) => ax.axisId === 'statut')!;
    expect(statut.gap).toBeNull();
    expect(statut.nUnexposed).toBe(4);
    expect(statut.nExposed).toBe(0);
    expect(typeof a.nSignificantAxes).toBe('number');
  });

  it('seuil de spécialisation exposé', () => {
    expect(SPECIALIZED_DOMINANT_SHARE).toBe(0.6);
  });
});

const DATA_REEL = join(__dirname, '..', 'data', 'generated');

describe.skipIf(!existsSync(join(DATA_REEL, 'meta.json')))('jeu réel', () => {
  let raw: RawMonoMultiExtractRow[];
  beforeAll(async () => {
    raw = extractRows(await loadDataset(DATA_REEL));
  }, 60_000);

  const signales = (ps: CabinetProfile[]) => ps.map((p) => [p.cabinet, p.nSignificantAxes]);

  it('buildCabinetProfiles(raw, 0.01) = calcul sous alpha global 0,01, sans toucher au global', () => {
    const avant = significanceAlpha();
    try {
      setSignificanceAlpha(0.01);
      const sousGlobal = buildCabinetProfiles(raw);
      setSignificanceAlpha(0.05);
      const explicite = buildCabinetProfiles(raw, 0.01);
      expect(significanceAlpha()).toBe(0.05);
      // Précondition : le jeu distingue les deux seuils (sinon le test ne discrimine rien).
      expect(signales(buildCabinetProfiles(raw, 0.05))).not.toEqual(signales(explicite));
      expect(signales(explicite)).toEqual(signales(sousGlobal));
    } finally {
      setSignificanceAlpha(avant);
    }
  }, 60_000);

  it('AxisHeadline expose les effectifs des deux groupes', () => {
    const profils = buildCabinetProfiles(raw);
    let avecEcart = 0;
    for (const p of profils) {
      for (const a of p.axes) {
        expect(Number.isInteger(a.nUnexposed)).toBe(true);
        expect(Number.isInteger(a.nExposed)).toBe(true);
        if (a.gap !== null) {
          avecEcart++;
          expect(a.nUnexposed).toBeGreaterThan(0);
          expect(a.nExposed).toBeGreaterThan(0);
        } else {
          expect(Math.min(a.nUnexposed, a.nExposed)).toBe(0);
        }
      }
    }
    expect(avecEcart).toBeGreaterThan(0);
  }, 60_000);
});

describe('sortMetaRanking', () => {
  const mk = (cabinet: string, n: number) => ({ cabinet, nSignificantAxes: n }) as unknown as CabinetProfile;
  const noms = (ps: CabinetProfile[]) => ps.map((p) => p.cabinet);

  it('trie par axes signalés décroissants, ex æquo dans l’ordre d’entrée', () => {
    const r = sortMetaRanking([mk('A', 0), mk('B', 2), mk('C', 0), mk('D', 2)]);
    expect(noms(r)).toEqual(['B', 'D', 'A', 'C']);
  });

  it('ne modifie pas le tableau d’entrée', () => {
    const entree = [mk('A', 0), mk('B', 2), mk('C', 0), mk('D', 2)];
    const r = sortMetaRanking(entree);
    expect(r).not.toBe(entree);
    expect(noms(entree)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('toCategorical', () => {
  it('ignore les lignes sans cabinet ou sans catégorie', () => {
    const rows = [
      row({ cabinet: 'A', statut: 'Public', score: 80 }), // conservée
      row({ cabinet: null, statut: 'Public', score: 70 }), // sans cabinet (null)
      row({ cabinet: '', statut: 'Public', score: 60 }), // sans cabinet (vide)
      row({ cabinet: 'A', statut: '', score: 50 }), // sans catégorie : deriveStatut renvoie null
    ];
    const out = toCategorical(rows, deriveStatut);
    expect(out).toEqual([{ cabinet: 'A', score: 80, category: 'Public' }]);
  });
});
