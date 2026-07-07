/**
 * Orchestrateur de génération HORS-LIGNE d'une fiche de l'Observatoire :
 * Dataset (fichiers locaux) → contenu recalculé → PDF principal + classements
 * par contraste + PJ méta (3/10/12). Aucune I/O réseau/DB/S3/email — le cœur
 * autonome de génération de fiches, réduit à la génération.
 *
 * Réutilisation (12 fiches d'affilée) : passer un proxy pré-construit
 * (`makeStoreProxy(ds)`) en 4e argument — sinon chaque appel reconstruit le
 * proxy et refait l'extraction as-of complète du Dataset.
 */

import { Buffer } from 'node:buffer';
import type { Dataset } from '../store/types';
import { makeStoreProxy } from '../store/proxy';
import { extractRaw } from './mono-multi-extract';
import { getFicheAxisProvider, type FicheAxisPrisma } from './fiche-axis-providers';
import { getFicheBuilder, FICHE_CALENDAR } from './fiche-calendar';
import { renderFichePdf } from './fiche-pdf';
import { renderRankingPdf } from './fiche-ranking-pdf';
import { buildCabinetProfiles, type CabinetProfile } from './cabinet-profile';
import {
  renderCabinetMatrixPdf,
  renderPortfolioPdf,
  renderMetaRankingPdf,
} from './fiche-meta-pdf';
import type { CabinetContrastSummary } from './fiche-001-content';

export interface GeneratedFiche {
  numero: number;
  titre: string;
  /** PDF principal (narratif) de la fiche. */
  mainPdf: Buffer;
  /** Tous les fichiers produits — mainPdf inclus en tête. */
  files: { filename: string; content: Buffer }[];
  /**
   * Dégradations NON bloquantes rendues observables (produit opposable) : les
   * providers d'axe catchent leurs erreurs et replient sur undefined (opts) /
   * null (reports) sans remonter la cause — sans ce champ, l'appelant ne voit
   * pas qu'une fiche est sortie en mode dégradé (chiffres de référence figés,
   * sans classement). Vide = génération saine. Les méta-fiches 3/10/12 sont
   * exclues du warning « classement » : leur cabinetReport est null PAR DESIGN.
   */
  warnings: string[];
}

const pad3 = (n: number) => String(n).padStart(3, '0');

/** PJ méta (3/10/12) : profil par cabinet déjà rendu en PDF (comme les providers méta). */
const META_RENDERERS: Readonly<
  Record<number, { slug: string; render: (profiles: CabinetProfile[], label: string) => Promise<Buffer> }>
> = {
  3: { slug: 'matrice-cabinets', render: renderCabinetMatrixPdf },
  10: { slug: 'portefeuilles', render: renderPortfolioPdf },
  12: { slug: 'meta-classement', render: renderMetaRankingPdf },
};

/**
 * Génère la fiche n°`numero` depuis le Dataset en mémoire.
 *
 * @param periodLabel libellé affiché sur les PDF ; défaut : date HAS du dataset.
 * @param proxy       proxy prisma-compatible pré-construit à RÉUTILISER entre
 *                    appels (cf. en-tête) ; défaut : construit ici.
 */
export async function generateFiche(
  ds: Dataset,
  numero: number,
  periodLabel?: string,
  proxy?: FicheAxisPrisma,
): Promise<GeneratedFiche> {
  const entry = FICHE_CALENDAR.find((e) => e.numero === numero);
  const builder = getFicheBuilder(numero);
  if (!entry || !builder) throw new Error(`Numéro de fiche inconnu: ${numero}`);
  const prisma = proxy ?? makeStoreProxy(ds);
  const label =
    periodLabel ?? `Données du ${new Date(ds.meta.hasSyncedAt).toLocaleDateString('fr-FR')}`;

  // Chiffres recalculés + rapports par cabinet (mêmes providers que le cœur ;
  // en cas d'échec interne ils replient déjà sur undefined/null → fiche dégradée
  // mais valide, sans classement).
  const provider = getFicheAxisProvider(numero);
  const opts = provider ? await provider.buildOpts(prisma) : undefined;
  const reports = provider ? await provider.cabinetReport(prisma) : null;
  const cabinets: CabinetContrastSummary[] | undefined = reports
    ? reports.map((r) => ({ label: r.label, summary: r.summary }))
    : undefined;

  // Dégradation observable (cf. GeneratedFiche.warnings) — fiches d'AXE uniquement.
  const meta = META_RENDERERS[numero];
  const warnings: string[] = [];
  if (!meta) {
    if (reports === null) warnings.push('classement omis — données insuffisantes');
    if (opts === undefined) warnings.push('chiffres de référence utilisés — recalcul indisponible');
  }

  const fiche = builder(opts, cabinets);
  const mainPdf = await renderFichePdf(fiche, label);
  const files: GeneratedFiche['files'] = [
    { filename: `fiche-${pad3(numero)}.pdf`, content: mainPdf },
  ];
  for (const r of reports ?? []) {
    files.push({
      filename: `classement-${r.id}-${pad3(numero)}.pdf`,
      content: await renderRankingPdf(r, label),
    });
  }

  if (meta) {
    const profiles = buildCabinetProfiles(await extractRaw(prisma));
    files.push({
      filename: `${meta.slug}-${pad3(numero)}.pdf`,
      content: await meta.render(profiles, label),
    });
  }

  // `titre` = libellé COURT du calendrier (index/menu) ; le titre complet rendu
  // dans le PDF vient du builder (choix assumé, verrouillé par test).
  return { numero, titre: entry.titre, mainPdf, files, warnings };
}
