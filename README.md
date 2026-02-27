# Frais mensuels

Webapp pour saisir, suivre et archiver des charges mensuelles (perso + commun), avec enveloppes et reste à vivre.

## Résumé rapide

- Charges mensuelles avec part %, comptes, auto/manuel, et statut OK.
- Enveloppes (budgets) + dépenses + reste du mois + dette reportée.
- Reliquat d’enveloppe: un dépassement non traité ou un reste positif non consommé est reporté cumulativement sur les mois suivants pour la même enveloppe (même si des mois intermédiaires n'ont pas été ouverts) et réduit le montant à virer.
- Reliquat traité: une case à cocher par enveloppe permet de marquer le reliquat entrant comme géré manuellement (il n'est alors plus appliqué au calcul du mois).
- Dette du mois traitée: une case séparée permet de marquer la dette du mois courant comme couverte hors enveloppe (elle n’est alors plus reportée au mois suivant).
- Résumé orienté virement/provisionnement: total charges (pour moi), enveloppes à virer (reliquat inclus), total à provisionner, reste à vivre.
- Vue par compte orientée action: montant à approvisionner en début de mois, avec contrôle d’intégrité (somme des comptes = total à provisionner).
- Transparence calculs: bloc repliable "Détails du calcul" dans Totaux et info-bulle sur "Reste du mois" des enveloppes.
- UI mobile/lecture: boutons de sections renforcés et pills plus lisibles via utilitaires Tailwind v4 récents (`pointer-coarse`, `text-shadow-*`, `wrap-break-word` / `wrap-anywhere`).
- Archivage d'un mois: gel des charges et budgets, lecture seule.
- Données locales (IndexedDB) + sync best-effort dans Redis (Vercel KV / Upstash).
- Auth simple: login/register, cookie HTTP-only, reset via recovery code.
- Optimisations perfs: calculs mensuels dédupliqués, scans O(n²) évités, sync Redis chunkée/concurrente.

## Stack (2026-02-27)

- React 19 + React DOM 19
- Vite 7 + `@vitejs/plugin-react` 5
- Tailwind CSS 4.2.1 (PostCSS via `@tailwindcss/postcss`)
- TypeScript 5.9

Migration notable appliquée: passage Tailwind v4 CSS-first (`@import "tailwindcss"`, `@source`, `@theme` dans `src/styles.css`, sans `tailwind.config` JS).
Conventions UI: composants utilitaires Tailwind v4 dans `@layer components` (`fm-panel`, `fm-card`, `fm-input`, `fm-btn-*`, `fm-stat-*`) pour harmoniser Résumé, Enveloppes et formulaires.
Pass Tailwind v4 récent: adoption d'utilitaires/variants `pointer-coarse:*`, `text-shadow-*`, `wrap-break-word` et `wrap-anywhere` pour améliorer l'ergonomie tactile et la lisibilité des contenus longs.
Fond dynamique: crossfade en 2 couches piloté par tokens Tailwind v4 CSS-first (`@theme` avec `--duration-bg-crossfade` et `--ease-bg-crossfade`) pour n'afficher l'image suivante qu'après chargement/décodage.

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
<summary>Performance (2026-02-27)</summary>

Optimisations appliquées sans changement fonctionnel:
- `src/state/selectors.ts`: suppression de scans linéaires répétés (`find`/`includes`) via maps/sets, et réutilisation de données pré-calculées pour les totaux.
- `src/ui/AppView.tsx` et `src/ui/SummaryPanel.tsx`: mutualisation des résultats `chargesForMonth` / `budgetsForMonth` pour éviter les recomputations multiples par rendu.
- `api/state.ts`: lecture/écriture/suppression des chunks Redis en batches concurrents (latence de sync réduite, surtout sur gros états).
- `api/_auth.ts`: `touchSession` accepte une session déjà chargée pour éviter un `kvGet` redondant.

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
- Reliquat d’enveloppe: le reste d’un mois (positif ou négatif) est reporté sur le mois suivant de la même enveloppe. Un reliquat positif réduit le virement du mois suivant; un reliquat négatif alimente la dette reportée.
- Reliquat traité (optionnel): si activé sur un mois/enveloppe, le reliquat entrant est conservé comme information mais n’est plus appliqué dans le calcul du montant à virer pour ce mois.
- Dette du mois traitée (optionnel): si activé sur un mois/enveloppe, la dette générée ce mois est conservée comme information mais n’est plus reportée au mois suivant.
- Reliquat entrant net (mois précédent): `reliquat positif - dette`.
- Montant d’enveloppe à virer: `max(0, montant enveloppe - reliquat entrant net)`.
- Reste du mois (enveloppe): `montant cible - dépensé` (la dette reportée n’augmente pas ce reste affiché).
- Consolidation mensuelle du reliquat (entrant vers mois suivant): base disponible `max(montant cible, reliquat entrant net)` puis `reste = base disponible - dépensé`.
- Reliquat positif sortant: `max(0, reste)` (reporté comme reliquat entrant).
- Dette reportée fin de mois: `max(0, -reste)` (reportée uniquement si non traitée).
- Exemple enveloppe récurrente: cible `100`, dépensé `80` sur le mois N -> reliquat positif `20` reporté -> mois N+1: `à virer = 80`.
- Total à provisionner du mois: `charges (pour moi) + enveloppes à virer`.
- Dans le panneau Totaux, l'impact reliquat est détaillé en deux lignes affichées en montant absolu: `dette entrante à ajouter` (rouge) et `reliquat positif à déduire` (vert). En interne, le calcul reste signé: `+dette` et `-reliquat positif`.
- Par compte: `charges à provisionner + enveloppes à virer` (impact reliquat déjà intégré dans "enveloppes à virer", qu'il s'agisse d'une dette ou d'un reliquat positif). Si des lignes référencent un compte non configuré, elles restent visibles et incluses dans les totaux.
- Totaux: commun, ma part, perso, reste à vivre, reste après enveloppes.

</details>
