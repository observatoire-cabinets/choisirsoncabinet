import { describe, it, expect } from 'vitest';
import { buildFiche003Content } from './fiche-003-content';

describe('buildFiche003Content', () => {
  it('numéro 3, 9 blocs non vides, statut Relue', () => {
    const f = buildFiche003Content();
    expect(f.numero).toBe(3);
    expect(f.statut).toBe('Relue');
    for (const k of ['enClair', 'question', 'methode', 'resultats', 'interpretation', 'limites', 'misePerspective', 'implications', 'annexe'] as const) {
      expect((f.blocs[k] ?? '').length).toBeGreaterThan(0);
    }
  });

  it('expose verdict / pourquoi / ceQueNeDitPas (N1+N2) non vides', () => {
    const b = buildFiche003Content().blocs;
    for (const k of ['verdict', 'pourquoi', 'ceQueNeDitPas'] as const) {
      expect(b[k], `bloc ${k}`).toBeTruthy();
      expect((b[k] ?? '').trim().length, `bloc ${k} non vide`).toBeGreaterThan(0);
    }
  });

  it('verdict : affirme l’« effet cabinet » descriptif et non causal (citable)', () => {
    const v = buildFiche003Content().blocs.verdict!.toLowerCase();
    expect(v).toContain('effet cabinet');
    // exactitude : descriptif, écarts bruts, pas un classement de qualité, pas causal
    expect(v).toMatch(/brut/);
    expect(v).toMatch(/classement de qualité|cause/);
  });

  it('ceQueNeDitPas : limites de portée (descriptif ≠ qualité, brut, conformité ≠ soins)', () => {
    const c = buildFiche003Content().blocs.ceQueNeDitPas!.toLowerCase();
    expect(c).toMatch(/descriptif/);
    expect(c).toMatch(/brut/);
    expect(c).toMatch(/conformité méthodologique/);
    expect(c).toMatch(/pas la qualité réelle des soins/);
  });

  it('dé-doublonnage : interpretation ne répète pas verbatim ceQueNeDitPas', () => {
    const b = buildFiche003Content().blocs;
    expect(b.interpretation).not.toContain(b.ceQueNeDitPas);
    // l’ancienne formulation « Pas de causalité ; les paliers descriptifs … » a migré vers ceQueNeDitPas
    expect(b.interpretation).not.toMatch(/Pas de causalité ; les paliers descriptifs/);
  });

  it('aucun glyphe strippé par WinAnsi (α/β grecs, − U+2212, ≠ U+2260) dans les textes rendus', () => {
    // sanitizeForWinAnsi SUPPRIME (sans translittérer) α, β, − et ≠ : « scores − moyenne »
    // rendait « scores moyenne » dans le PDF (soustraction illisible).
    const f = buildFiche003Content();
    const all =
      Object.values(f.blocs).filter(Boolean).join(' ') +
      (f.verification?.kind === 'meta' ? ` ${f.verification.regle} ${f.verification.renvoi}` : '');
    expect(all).not.toMatch(/[αβ−≠]/);
    expect(f.verification?.kind === 'meta' ? f.verification.regle : '').toContain('scores - moyenne nationale');
    expect(f.blocs.methode).toContain('cabinet - moyenne nationale');
  });
});
