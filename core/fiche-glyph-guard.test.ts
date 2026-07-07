// Garde CENTRALE anti-glyphes WinAnsi — toutes les fiches du calendrier.
//
// sanitizeForWinAnsi (winansi.ts) SUPPRIME en silence les caractères hors plage
// 0x20-0x7E / 0xA0-0xFF qu'elle ne translittère pas : α, β, − (U+2212) et
// ≠ (U+2260) notamment. Conséquence dans le PDF rendu : « Association ≠
// causalité » devenait « Association causalité » (sens INVERSÉ), « 85,00 −
// 70,00 » devenait « 85,00 70,00 » (arithmétique illisible). Les gardes
// unitaires (guide, fiches 3/10/12) verrouillent les cas déjà corrigés ; ce
// garde-ci couvre LES 12 FICHES du calendrier — et toute fiche future ajoutée
// à FICHE_CALENDAR — construites avec les opts par défaut.
//
// Δ/≥/≤/→/← restent permis : ils sont TRANSLITTÉRÉS (pas strippés).
import { describe, it, expect } from 'vitest';
import { FICHE_CALENDAR, getFicheBuilder } from './fiche-calendar';
import { collectVerificationText } from './fiche-verification';

const STRIPPED_GLYPHS = /[αβ−≠]/;

describe('garde centrale anti-glyphes strippés (α, β, −, ≠) — 12 fiches', () => {
  for (const entry of FICHE_CALENDAR) {
    it(`fiche n°${entry.numero} — ${entry.titre}`, () => {
      const build = getFicheBuilder(entry.numero);
      // Toute fiche du calendrier doit avoir un builder.
      expect(build, `builder manquant pour la fiche n°${entry.numero}`).not.toBeNull();
      const f = build!();
      const texts = [
        f.titre,
        f.famille,
        f.statut,
        ...Object.values(f.blocs).filter((s): s is string => typeof s === 'string'),
        ...(f.verification ? collectVerificationText(f.verification) : []),
      ];
      for (const t of texts) {
        const m = t.match(STRIPPED_GLYPHS);
        expect(m, `glyphe strippable « ${m?.[0]} » dans : « ${t.slice(0, 80)}… »`).toBeNull();
      }
    });
  }
});
