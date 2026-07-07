/**
 * Orchestrateur de génération hors-ligne. Tests de STRUCTURE sur le
 * mini-dataset (4 lignes extraites) : présence/forme des PDF produits.
 * Le réalisme des chiffres est couvert par les tests golden sur données réelles.
 *
 * Particularité mini-données : la fiche 1 (mono/multi) est la SEULE dont le
 * rapport par cabinet exige l'OLS national complet (dummies région/statut/categ)
 * — singulier sur 4 lignes (« Matrice non définie positive ») → le provider
 * replie sur null et la fiche sort DÉGRADÉE mais valide (chiffres de référence,
 * sans classement). Les classements de la fiche 1 sont donc exercés par la CLI sur
 * le dataset réel ; ici la structure « principal + classements » est testée sur
 * la fiche 2 (statut), dont l'analyse par contraste passe sur 4 lignes.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { loadDataset } from '../store/load';
import { makeStoreProxy } from '../store/proxy';
import { FICHE_CALENDAR } from './fiche-calendar';
import { generateFiche } from './generate';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'store', '__fixtures__', 'mini-dataset');

describe('generateFiche', () => {
  it('produit le PDF principal + classements pour la fiche 2 (statut, 2 contrastes)', async () => {
    const ds = await loadDataset(FIX);
    const res = await generateFiche(ds, 2);
    expect(res.numero).toBe(2);
    expect(res.titre).toMatch(/statut/i);
    expect(res.mainPdf.length).toBeGreaterThan(1000); // Buffer PDF non vide
    expect(res.mainPdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(res.files[0].filename).toMatch(/^fiche-002.*\.pdf$/);
    expect(res.files[0].content).toBe(res.mainPdf); // mainPdf inclus en tête
    const classements = res.files.filter((f) => f.filename.startsWith('classement-'));
    expect(classements.length).toBe(2); // un par contraste (non lucratif / commercial vs public)
    for (const f of classements) {
      expect(f.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
    expect(res.warnings).toEqual([]); // cas sain : recalcul ET classements présents
  });

  it('fiche 1 sur mini-données : dégradée mais VALIDE (OLS national singulier → pas de classement)', async () => {
    const ds = await loadDataset(FIX);
    const res = await generateFiche(ds, 1);
    expect(res.numero).toBe(1);
    expect(res.titre).toBe('Mono vs multi-établissements');
    expect(res.mainPdf.length).toBeGreaterThan(1000);
    expect(res.files[0].filename).toBe('fiche-001.pdf');
    // Repli documenté du provider mono/multi (cf. en-tête) — PAS un choix de l'orchestrateur,
    // mais rendu OBSERVABLE par l'orchestrateur via `warnings` (produit opposable).
    expect(res.files.some((f) => f.filename.startsWith('classement-'))).toBe(false);
    expect(res.warnings).toEqual([
      'classement omis — données insuffisantes',
      'chiffres de référence utilisés — recalcul indisponible',
    ]);
  });

  it('fiche méta 3 : pièces jointes matrices (pas de classement de contraste)', async () => {
    const ds = await loadDataset(FIX);
    const res = await generateFiche(ds, 3);
    // fiche-003.pdf + matrice cabinets × axes (provider méta : cabinetReport null).
    expect(res.files.length).toBeGreaterThanOrEqual(2);
    expect(res.files.some((f) => f.filename.startsWith('classement-'))).toBe(false);
    expect(res.files.some((f) => f.filename.startsWith('matrice-cabinets-'))).toBe(true);
    for (const f of res.files) {
      expect(f.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
    // Méta : cabinetReport null PAR DESIGN → jamais de warning « classement omis ».
    expect(res.warnings).toEqual([]);
  });

  it('les 12 fiches du calendrier se génèrent (structure minimale, proxy partagé)', async () => {
    const ds = await loadDataset(FIX);
    const proxy = makeStoreProxy(ds); // une seule extraction pour les 12
    expect(FICHE_CALENDAR.length).toBe(12); // assertion consciente — une 13e fiche serait balayée aussi
    for (const { numero } of FICHE_CALENDAR) {
      const res = await generateFiche(ds, numero, undefined, proxy);
      expect(res.numero).toBe(numero);
      expect(res.files[0].filename).toBe(`fiche-${String(numero).padStart(3, '0')}.pdf`);
      expect(res.mainPdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
  }, 60_000);

  it('fiches méta 10 et 12 : PJ portefeuilles / méta-classement', async () => {
    const ds = await loadDataset(FIX);
    const proxy = makeStoreProxy(ds);
    const f10 = await generateFiche(ds, 10, undefined, proxy);
    expect(f10.files.some((f) => f.filename === 'portefeuilles-010.pdf')).toBe(true);
    const f12 = await generateFiche(ds, 12, undefined, proxy);
    expect(f12.files.some((f) => f.filename === 'meta-classement-012.pdf')).toBe(true);
  });

  it('numéro sans contenu → erreur claire', async () => {
    const ds = await loadDataset(FIX);
    await expect(generateFiche(ds, 99)).rejects.toThrow(/inconnu/i);
  });

  it('réutilise un proxy fourni (une extraction pour 12 fiches)', async () => {
    const ds = await loadDataset(FIX);
    const proxy = makeStoreProxy(ds);
    let queries = 0;
    const counting: typeof proxy = {
      ...proxy,
      $queryRawUnsafe: (sql: string) => {
        queries += 1;
        return proxy.$queryRawUnsafe(sql);
      },
    };
    const res = await generateFiche(ds, 2, undefined, counting);
    expect(res.mainPdf.length).toBeGreaterThan(1000);
    expect(queries).toBeGreaterThan(0); // preuve que le proxy INJECTÉ a servi
  });

  it('chemin méta : le proxy fourni sert aussi aux profils (extractRaw = seul appelant)', async () => {
    const ds = await loadDataset(FIX);
    const proxy = makeStoreProxy(ds);
    let queries = 0;
    const counting: typeof proxy = {
      ...proxy,
      $queryRawUnsafe: (sql: string) => {
        queries += 1;
        return proxy.$queryRawUnsafe(sql);
      },
    };
    await generateFiche(ds, 3, undefined, counting);
    // metaSourceProvider n'émet AUCUNE requête brute → l'unique appel vient de
    // extractRaw(prisma) dans generate.ts. Une régression extractRaw(makeStoreProxy(ds))
    // (proxy neuf au lieu du fourni) ferait tomber ce compte à 0.
    expect(queries).toBe(1);
  });

  it('periodLabel explicite : propagé au titre du PDF principal', async () => {
    const ds = await loadDataset(FIX);
    const res = await generateFiche(ds, 2, 'Période de test');
    const doc = await PDFDocument.load(res.mainPdf);
    expect(doc.getTitle()).toBe('Fiche n°002 — Période de test');
  });
});
