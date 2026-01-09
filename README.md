# Frais mensuels

Webapp pour saisir et suivre des charges mensuelles (perso + communes), avec totaux et enveloppes (budgets).

## Fonctionnalités (MVP)

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

## Installation (optionnel)

- Sur mobile/desktop, utiliser “Installer” (PWA) dans le navigateur si disponible.

## Backup (recommandé)

- Menu `⋯` en haut à droite → `Exporter (JSON)` pour sauvegarder.
- `Importer (JSON)` pour restaurer sur un autre navigateur / machine.

## Comptes utilisateurs + cloud (Redis)

Les données sont stockées **sur l’appareil** (IndexedDB) et synchronisées (best-effort) dans Redis via Vercel Serverless (`/api/state`). Chaque utilisateur a son propre dataset.

### Pré-requis Vercel

1. Option 1: Vercel → `Storage` → créer un `KV` store (Upstash Redis), puis l’attacher au projet.
2. Option 2: Upstash Redis (Marketplace) ou compte Upstash externe, en configurant les env vars dans Vercel.
3. L’API accepte (par ordre de priorité):
   - `SYNC_REDIS_REST_URL` + `SYNC_REDIS_REST_TOKEN` (recommandé)
   - `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV)
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash)

### Auth / sécurité

- Écran login/register au démarrage (session cookie HTTP-only).
- Mot de passe hashé côté serveur (PBKDF2-SHA256).
- “Mot de passe oublié”: reset via **recovery code** (affiché à la création et à chaque reset). Pas d’envoi email dans cette version.

## Dev local et routes `/api`

En prod, les routes sont servies par Vercel (Serverless Functions dans `api/`). En local, `vite` ne les sert pas par défaut.

- `npm run dev` sert aussi `/api/*` via un middleware Vite (chargement des handlers `api/**/*.ts`).
- Si tu vois `KV_NOT_CONFIGURED`, crée un `.env.local` (non commité) avec tes creds Redis REST:
  - `SYNC_REDIS_REST_URL=...`
  - `SYNC_REDIS_REST_TOKEN=...`
