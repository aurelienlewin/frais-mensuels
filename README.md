# Frais mensuels

Webapp pour saisir, suivre et archiver des charges mensuelles (perso + commun), avec enveloppes et reste à vivre.

## Résumé rapide

- Charges mensuelles avec part %, comptes, auto/manuel, et statut OK.
- Enveloppes (budgets) + dépenses + reste / dépassement.
- Reliquat d’enveloppe: un dépassement d’un mois est reporté sur le mois suivant pour la même enveloppe et réduit le montant à virer.
- Archivage d'un mois: gel des charges et budgets, lecture seule.
- Données locales (IndexedDB) + sync best-effort dans Redis (Vercel KV / Upstash).
- Auth simple: login/register, cookie HTTP-only, reset via recovery code.

## Stack (2026-02-27)

- React 19 + React DOM 19
- Vite 7 + `@vitejs/plugin-react` 5
- Tailwind CSS 4 (PostCSS via `@tailwindcss/postcss`)
- TypeScript 5.9

Migration notable appliquée: passage Tailwind v4 (`@import "tailwindcss"` dans `src/styles.css` et plugin PostCSS dédié).

## Démarrer

1) Installer
- `npm install`

2) Dev
- `npm run dev`

3) Build / preview
- `npm run build`
- `npm run preview`

## Installation PWA

Ouvrir l'app dans le navigateur puis utiliser "Installer" si proposé.

## Backup

- Menu `...` en haut à droite -> `Exporter (JSON)` pour sauvegarder.
- `Importer (JSON)` pour restaurer.
- `Exporter (rapport CSV)` pour obtenir un état mensuel détaillé (enveloppes cibles, reliquat reporté, enveloppes à virer, détail par compte).

<details>
<summary>Cloud: configuration Redis (Vercel / Upstash)</summary>

Les données sont stockées localement et synchronisées dans Redis via `/api/state`.

L'API accepte (ordre de priorite):
- `SYNC_REDIS_REST_URL` + `SYNC_REDIS_REST_TOKEN` (recommandé)
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash)

</details>

<details>
<summary>Auth / sécurité</summary>

- Cookie de session HTTP-only.
- Hash PBKDF2-SHA256 côté serveur.
- Reset via recovery code (affiché à la création ou reset).
- Pas d'envoi email dans cette version.

</details>

<details>
<summary>Dev local et routes /api</summary>

En prod, les routes vivent dans `api/` (Vercel Serverless). En local, Vite les sert via un middleware.

Si vous voyez `KV_NOT_CONFIGURED`, créez un `.env.local` non commité:
- `SYNC_REDIS_REST_URL=...`
- `SYNC_REDIS_REST_TOKEN=...`

</details>

<details>
<summary>Modèle de données (résumé)</summary>

- Charges globales (mensuelles) + charges ponctuelles par mois.
- Budgets par enveloppe + dépenses par mois.
- Reliquat d’enveloppe: si le reste d’un mois est négatif, la dette est reportée sur le mois suivant de la même enveloppe.
- Montant d’enveloppe à virer: `max(0, montant enveloppe - reliquat du mois précédent)`.
- Totaux: commun, ma part, perso, reste à vivre, reste après enveloppes.

</details>
