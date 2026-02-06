# Frais mensuels

Webapp pour saisir, suivre et archiver des charges mensuelles (perso + commun), avec enveloppes et reste a vivre.

## Resume rapide

- Charges mensuelles avec part %, comptes, auto/manuel, et statut OK.
- Enveloppes (budgets) + depenses + reste / depassement.
- Archivage d'un mois: gel des charges et budgets, lecture seule.
- Donnees locales (IndexedDB) + sync best-effort dans Redis (Vercel KV / Upstash).
- Auth simple: login/register, cookie HTTP-only, reset via recovery code.

## Demarrer

1) Installer
- `npm install`

2) Dev
- `npm run dev`

3) Build / preview
- `npm run build`
- `npm run preview`

## Installation PWA

Ouvrir l'app dans le navigateur puis utiliser "Installer" si propose.

## Backup

- Menu `...` en haut a droite -> `Exporter (JSON)` pour sauvegarder.
- `Importer (JSON)` pour restaurer.

<details>
<summary>Cloud: configuration Redis (Vercel / Upstash)</summary>

Les donnees sont stockees localement et synchronisees dans Redis via `/api/state`.

L'API accepte (ordre de priorite):
- `SYNC_REDIS_REST_URL` + `SYNC_REDIS_REST_TOKEN` (recommande)
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash)

</details>

<details>
<summary>Auth / securite</summary>

- Cookie de session HTTP-only.
- Hash PBKDF2-SHA256 cote serveur.
- Reset via recovery code (affiche a la creation ou reset).
- Pas d'envoi email dans cette version.

</details>

<details>
<summary>Dev local et routes /api</summary>

En prod, les routes vivent dans `api/` (Vercel Serverless). En local, Vite les sert via un middleware.

Si vous voyez `KV_NOT_CONFIGURED`, creez un `.env.local` non commite:
- `SYNC_REDIS_REST_URL=...`
- `SYNC_REDIS_REST_TOKEN=...`

</details>

<details>
<summary>Modele de donnees (resume)</summary>

- Charges globales (mensuelles) + charges ponctuelles par mois.
- Budgets par enveloppe + depenses par mois.
- Totaux: commun, ma part, perso, reste a vivre, reste apres enveloppes.

</details>
