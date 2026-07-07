import { describe, it, expect } from 'vitest';
import { PHARE_CONTRASTS, buildCabinetProfiles, SPECIALIZED_DOMINANT_SHARE } from './cabinet-profile';
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

  it('axes : un headline par contraste phare + comptage des axes significatifs', () => {
    const raw = [
      row({ cabinet: 'A', is_multi: false, score: 70 }), row({ cabinet: 'A', is_multi: false, score: 72 }),
      row({ cabinet: 'A', is_multi: true, score: 90 }), row({ cabinet: 'A', is_multi: true, score: 92 }),
    ];
    const a = buildCabinetProfiles(raw).find((p) => p.cabinet === 'A')!;
    const mm = a.axes.find((ax) => ax.axisId === 'mono_multi')!;
    expect(mm.gap).toBeCloseTo(20, 6);
    expect(mm.reliability).toBe('descriptif');
    expect(typeof a.nSignificantAxes).toBe('number');
  });

  it('seuil de spécialisation exposé', () => {
    expect(SPECIALIZED_DOMINANT_SHARE).toBe(0.6);
  });
});
