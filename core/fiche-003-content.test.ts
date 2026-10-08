import { describe, it, expect } from 'vitest';
import { buildFiche003Content } from './fiche-003-content';
import { axeNonConformeDefinition, holmParCabinetLabel } from './cabinet-non-conformite';
import { sanitizeForWinAnsi } from './winansi';

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
    expect(c).toMatch(/satisfaction des exigences du référentiel/);
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

describe('fiche 3 — renvoi et correction de Holm', () => {
  it('le renvoi décrit la matrice jointe (écart, palier) sans annoncer de valeur p', () => {
    const v = buildFiche003Content().verification;
    const renvoi = v?.kind === 'meta' ? v.renvoi : '';
    expect(renvoi).toContain('(écart, palier)');
    expect(renvoi).not.toContain('(écart, palier, p)');
    expect(renvoi).not.toMatch(/\bp\)/);
  });

  it('la correction de Holm est décrite par cabinet, sur ses seuls axes au palier Fiable', () => {
    const { enClair } = buildFiche003Content().blocs;
    expect(enClair).toContain(holmParCabinetLabel());
    expect(enClair).not.toContain('Holm-Bonferroni');
  });
});

describe('fiche 3 — définition d’un axe non conforme et significativité', () => {
  it('« En clair » reprend la définition partagée, hors incise à tirets', () => {
    const { enClair } = buildFiche003Content().blocs;
    expect(enClair).toContain(axeNonConformeDefinition());
    const pdf = sanitizeForWinAnsi(enClair);
    expect(pdf).not.toMatch(/ - ,/);
    expect(enClair).not.toContain('—,');
  });

  it('la règle et la méthode précisent que la significativité n’est pas imprimée dans la matrice', () => {
    const f = buildFiche003Content();
    const regle = f.verification?.kind === 'meta' ? f.verification.regle : '';
    expect(regle).toContain('non imprimée dans la matrice jointe');
    expect(f.blocs.methode).toContain('non imprimée dans la matrice jointe');
  });
});
