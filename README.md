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

## Sync multi-appareils (chiffrée)

Par défaut, les données sont stockées **sur l’appareil** (IndexedDB). Pour synchroniser iPhone ↔ desktop, l’app peut envoyer/recevoir un blob **chiffré côté client**.

### Pré-requis Vercel

1. Option 1 (recommandée): Vercel → `Storage` → créer un `KV` store (Upstash Redis), puis l’attacher au projet.
2. Option 2: Upstash Redis (Marketplace) ou compte Upstash externe, en configurant les env vars dans Vercel.
3. L’API utilise soit `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV), soit `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash).

### Utilisation

- Menu `⋯` → `Sync (chiffré)…` puis saisir la même passphrase sur chaque appareil.
- Stratégie: **last-write-wins** basée sur `AppState.modifiedAt` (si le cloud est plus récent → pull, sinon → push).
- Le serveur ne stocke que des données chiffrées + des métadonnées (`modifiedAt`, `updatedAt`). La passphrase n’est pas récupérable: choisis-la suffisamment robuste.
