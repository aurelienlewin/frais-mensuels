# Frais mensuels

Webapp offline (PWA) pour saisir et suivre des charges mensuelles (perso + communes), avec totaux et enveloppes (budget, essence, épargne).

## Fonctionnalités (MVP)

- Offline après le 1er chargement (Service Worker + PWA)
- Charges mensuelles: perso / commun (avec part %) + compte + auto/manuel + checkbox “prélevé”
- Totaux: commun (total), commun (ma part), perso, total (charges + enveloppes) + reste à vivre
- Enveloppes: budgets (ex: perso, essence) + saisie des dépenses, reste / dépassement
- Archivage d’un mois: fige charges + budgets, UI en lecture seule

## Démarrer

1. Installer les dépendances
   - `npm install`
2. Lancer en dev
   - `npm run dev`
3. Build / preview
   - `npm run build`
   - `npm run preview`

## Offline / installation

- Ouvrir l’app une première fois en ligne, puis elle fonctionne hors connexion.
- Sur mobile/desktop, utiliser “Installer” (PWA) dans le navigateur.

## Backup (recommandé)

- Menu `⋯` en haut à droite → `Exporter (JSON)` pour sauvegarder.
- `Importer (JSON)` pour restaurer sur un autre navigateur / machine.
