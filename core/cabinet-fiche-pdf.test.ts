import { describe, it, expect } from 'vitest';
import type { Dataset, EssmsRow } from '../store/types';
import { buildFicheCabinet } from './cabinet-fiche';
import { cabinetFicheHistory } from './cabinet-fiche-history';
import { renderFicheCabinetPdf } from './cabinet-fiche-pdf';
import { setSignificanceAlpha, alphaLabelFor } from './significance';
import { extractPdfText } from './__fixtures__/pdf-text';

function mkRow(p: Partial<EssmsRow> & { finessGeo: string }): EssmsRow {
  return {
    finessGeo: p.finessGeo,
    score: p.score === undefined ? 80 : p.score,
    cabinet: p.cabinet === undefined ? 'CAB A' : p.cabinet,
    raisonSociale: null, region: 'R1',
    statut: 'Public', categ: '', categCode: '500', departement: '75',
    evalDate: p.evalDate === undefined ? '2023-05-10' : p.evalDate,
    grade: p.grade ?? null, chapters: [null, null, null],
    imperatives: [], ciEvaluated: null, ciMet: null, ciAbove35: null,
  };
}
function mkDataset(essms: EssmsRow[]): Dataset {
  return {
    meta: { builtAt: '', hasSyncedAt: '2026-07-01', finessSnapshotMax: '2026-06-01', sources: [] },
    essms,
    ejSnapshots: essms.map((e) => ({ snapshotDate: '2020-01-01', finessGeo: e.finessGeo, ejSize: 1 })),
    capacitySnapshots: [], baseDoc: [], evalHistory: [],
  };
}
const ds = mkDataset([
  mkRow({ finessGeo: '000000001', score: 80, evalDate: '2023-01-15', grade: 'A' }),
  mkRow({ finessGeo: '000000002', score: 90, evalDate: '2023-03-20', grade: 'C' }),
  mkRow({ finessGeo: '000000003', score: 70, evalDate: null }),
  mkRow({ finessGeo: '000000004', score: 60, evalDate: '2023-02-10', cabinet: 'CAB B' }),
]);

describe('renderFicheCabinetPdf', () => {
  it('fiche courante : toutes les sections + historique + pieds de page neutres', async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A')!;
    const history = cabinetFicheHistory(ds, 'CAB A');
    const text = extractPdfText(
      await renderFicheCabinetPdf(fiche, history, 'Données HAS au 2026-07-01', alphaLabelFor(0.05)),
    );
    expect(text).toMatch(/Fiche cabinet/);
    expect(text).toMatch(/CAB A/);
    expect(text).toMatch(/Niveau global/);
    expect(text).toMatch(/axes de pratique/i);
    expect(text).toMatch(/Portefeuille/);
    expect(text).toMatch(/Cotations/);
    // Libellé exact du résumé cotations (3 chapitres, échelle de cotation 1 à 4)
    expect(text).toMatch(/Cotations ?de ?chapitre/);
    expect(text).toMatch(/Historique mensuel/);
    expect(text).toMatch(/2023-01/); // 1re ligne du tableau d'historique
    // Valeurs de la 1re ligne d'historique (mois, n, niveau global) — les lignes
    // mono sont dessinées sans re-wrap : le padding Courier d'alignement survit
    // dans le texte extrait (\s+ le tolère quelle que soit sa largeur)
    expect(text).toMatch(/2023-01\s+1\s+\+0,00/);
    expect(text).toMatch(/sans date de clôture/); // limite nUndated=1 affichée
    // Rappel transverse (charte) — fragment court, tolérant au wrapping
    expect(text).toMatch(/l'évaluateur/);
    // Pieds de page neutres
    expect(text).toMatch(/Données HAS via data\.gouv\.fr/);
    expect(text).toMatch(/Seuil de significativité/);
    // WinAnsi : aucun glyphe grec ne survit (alpha épelé, cf. alphaLabelFor)
    expect(text).not.toMatch(/[αβ]/);
  });

  it("fiche mensuelle : mention de la borne, PAS de tableau d'historique", async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A', '2023-02')!;
    const text = extractPdfText(
      await renderFicheCabinetPdf(fiche, null, 'Données HAS au 2026-07-01', alphaLabelFor(0.05)),
    );
    expect(text).toMatch(/fin 2023-02/);
    expect(text).toMatch(/reconstituée/);
    expect(text).not.toMatch(/Historique mensuel/);
  });

  it('branche défensive cotations = null : message de repli, pas de résumé de cotations', async () => {
    // Inatteignable via buildFicheCabinet (qui renvoie toujours un résumé quand
    // des structures sont scorées) — on force la branche à la main.
    const fiche = { ...buildFicheCabinet(ds, 'CAB A')!, cotations: null };
    const text = extractPdfText(
      await renderFicheCabinetPdf(fiche, null, 'Données HAS au 2026-07-01', alphaLabelFor(0.05)),
    );
    expect(text).toMatch(/Aucune structure scorée à cette borne/);
    expect(text).not.toMatch(/Cotations ?de ?chapitre/);
  });

  it("régression : le seuil imprimé est le paramètre, pas l'état global (0,05 malgré global muté à 0,01)", async () => {
    const fiche = buildFicheCabinet(ds, 'CAB A')!; // calculée au défaut 0,05
    setSignificanceAlpha(0.01); // mutation concurrente simulée APRÈS le calcul
    try {
      const text = extractPdfText(
        await renderFicheCabinetPdf(fiche, null, 'Données HAS au 2026-07-01', alphaLabelFor(0.05)),
      );
      expect(text).toMatch(/Seuil de significativité alpha = 0,05/);
      expect(text).not.toMatch(/alpha = 0,01/);
    } finally {
      setSignificanceAlpha(0.05); // défaut produit — TOUJOURS restauré
    }
  });
});
