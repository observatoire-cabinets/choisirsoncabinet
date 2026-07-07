# Observatoire Cabinets Evaluateurs d'ESSMS

Application de bureau **hors-ligne** qui analyse les données **publiques** d'évaluation
des établissements et services sociaux et médico-sociaux (ESSMS) et met en regard les
**cabinets évaluateurs** habilités par la HAS.

Aucun compte, aucune connexion obligatoire, aucune IA, aucune télémétrie. Les données
sont embarquées : l'application fonctionne entièrement sur votre machine.

## Ce qu'elle fait

- **Fiches** — 12 fiches statistiques (mono / multi-établissements, statut juridique,
  secteur, capacité, territoire…) générées en PDF, hors-ligne.
- **Cabinet choisi** — écart d'un cabinet au niveau national + établissements les moins
  bien notés (nom + adresse, données publiques), présentation factuelle.
- **Registre** — lignes de vie des cabinets (première apparition, dernière évaluation
  publiée), reconstituées à partir des évaluations publiées.
- **Réglages** — seuil de significativité **α = 0,05 par défaut** (bascule 0,01),
  p-value toujours affichée, mise à jour depuis les sources publiques, dossier de sortie.

## Méthode & seuil

Les écarts sont estimés par régression linéaire (moindres carrés ordinaires) avec
erreurs-types robustes, puis qualifiés par un palier de fiabilité (effectifs), une taille
d'effet (Cohen's d) et une p-value. Le seuil par défaut est **α = 0,05 (IC 95 %)** ; une
bascule **0,01 (IC 99 %)** est disponible dans les Réglages. Le seuil retenu est imprimé
sur chaque PDF.

> Une association statistique n'est pas une causalité : un écart systématique et
> significatif décrit une régularité dans les données publiques, il ne préjuge pas d'une
> intention.

## Données & licences

L'application embarque un instantané des sources publiques suivantes — voir
`data/generated/meta.json` pour les dates et URLs exactes de récupération :

- **HAS — Synaé, open data des évaluations d'ESSMS** — Licence **ODbL**.
- **FINESS — fichier national des établissements** (répertoire, capacité installée) —
  **Licence Ouverte 2.0**.
- **HAS — base documentaire ESSMS** (nom officiel + adresse) — **Licence Ouverte 2.0**.

La mise à jour (Réglages → *Mettre à jour*) retélécharge ces sources depuis data.gouv.fr
et HAS puis reconstruit l'instantané ; les versions précédentes sont archivées localement.

## Prérequis

- [Node.js](https://nodejs.org) ≥ 20 et [pnpm](https://pnpm.io) ≥ 9.

## Développement

```sh
pnpm install          # dépendances du moteur + tests
pnpm test             # suite de tests (Vitest)

pnpm -C app install   # dépendances de l'application de bureau
pnpm -C app dev       # fenêtre + rechargement à chaud
```

## Construire l'application Windows

```sh
pnpm -C app dist
```

Produit une application **portable** (`win-unpacked`, aucune installation) et un
**installeur NSIS**. L'installeur requiert le **Mode développeur Windows** activé
(création de liens symboliques lors de l'empaquetage) ; l'application portable n'en a
pas besoin.

> **SmartScreen** — le binaire n'est pas signé par un certificat d'éditeur : Windows peut
> afficher « Éditeur inconnu » au premier lancement. C'est attendu.

## Structure

| Dossier | Rôle |
|---|---|
| `app/` | Application Electron : processus principal, préchargement isolé (sandbox), interface. |
| `core/` | Moteur d'analyse — extraction, MCO, contrastes, rendu PDF. TypeScript pur, sans I/O. |
| `store/` | Chargement et rafraîchissement du jeu de données embarqué. |
| `scripts/` | Génération de fiches en ligne de commande + rafraîchissement des données. |
| `data/generated/` | Instantané embarqué des sources publiques (voir `meta.json`). |

Le moteur est indépendant de l'interface : `core/` et `store/` n'importent rien de `app/`.
