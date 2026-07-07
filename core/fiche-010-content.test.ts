import { describe, it, expect } from 'vitest';
import { buildFiche010Content } from './fiche-010-content';

describe('buildFiche010Content', () => {
  it('numéro 10, 9 blocs non vides, statut Relue', () => {
    const f = buildFiche010Content();
    expect(f.numero).toBe(10);
    expect(f.statut).toBe('Relue');
    for (const k of ['enClair', 'question', 'methode', 'resultats', 'interpretation', 'limites', 'misePerspective', 'implications', 'annexe'] as const) {
      expect((f.blocs[k] ?? '').length).toBeGreaterThan(0);
    }
  });

  it('expose verdict / pourquoi / ceQueNeDitPas non vides', () => {
    const f = buildFiche010Content();
    for (const k of ['verdict', 'pourquoi', 'ceQueNeDitPas'] as const) {
      expect((f.blocs[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('verdict reflète le constat descriptif (seuil 60 %, un cabinet = un point, non causal)', () => {
    const { verdict } = buildFiche010Content().blocs;
    expect(verdict).toContain('60 %');
    expect(verdict).toMatch(/descriptif/i);
    expect(verdict).toMatch(/sp[ée]cialis/i);
    // Aucune sur-affirmation : la fiche ne prouve pas un effet causal.
    expect(verdict).toMatch(/pas une preuve/i);
  });

  it('ceQueNeDitPas borne la portée (un point, non ajusté, conformité ≠ qualité) sans répéter interpretation mot pour mot', () => {
    const { ceQueNeDitPas, interpretation } = buildFiche010Content().blocs;
    expect(ceQueNeDitPas).toMatch(/UN point/);
    expect(ceQueNeDitPas).toMatch(/non ajust|brute/i);
    expect(ceQueNeDitPas).toMatch(/conformit[ée] m[ée]thodologique/i);
    expect(ceQueNeDitPas).toMatch(/pas la qualit[ée] r[ée]elle des soins/i);
    // Dé-doublonnage : ceQueNeDitPas ne recopie pas une phrase entière d'interpretation.
    expect(ceQueNeDitPas).not.toContain(interpretation ?? '###');
  });

  it('aucun glyphe strippé par WinAnsi (α/β grecs, − U+2212, ≠ U+2260) dans les blocs rendus', () => {
    // « association ≠ causalité » rendait « association causalité » dans le PDF — sens INVERSÉ.
    const f = buildFiche010Content();
    const all = Object.values(f.blocs).filter(Boolean).join(' ');
    expect(all).not.toMatch(/[αβ−≠]/);
    expect(f.blocs.limites).toContain('association sans preuve de causalité');
  });
});
