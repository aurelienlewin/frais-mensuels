# Frais mensuels

Webapp pour saisir, suivre et archiver des charges mensuelles (perso + commun), avec enveloppes et reste à vivre.

## Résumé rapide

- Charges mensuelles avec part %, comptes, auto/manuel, et statut OK.
- Enveloppes (budgets) + dépenses + reste du mois + dette reportée.
- Reliquat d’enveloppe: un dépassement non traité ou un reste positif non consommé est reporté cumulativement sur les mois suivants pour la même enveloppe (même si des mois intermédiaires n'ont pas été ouverts) et réduit le montant à virer.
- Reliquat traité: une case à cocher par enveloppe permet de marquer le reliquat entrant comme géré manuellement (il n'est alors plus appliqué au calcul du mois).
- Dette du mois traitée: une case séparée permet de marquer la dette du mois courant comme couverte hors enveloppe (elle n’est alors plus reportée au mois suivant).
- Dépenses d’enveloppe Essence: le libellé est forcé à `Essence` (saisie enveloppe + ajout rapide), sans saisie manuelle requise.
- Résumé orienté virement/provisionnement: total charges (pour moi), enveloppes à virer (reliquat positif inclus), total à provisionner, reste à vivre.
- Épargne auto (option par convention): la charge Épargne est gérée dans un panneau dédié (collapsible) entre `Charges` et `Enveloppes` plutôt que dans la liste de charges standard. On y règle le plancher, on coche l’état du mois, et on choisit compte source/cible. Son montant du mois correspond au reste après charges + enveloppes: il peut monter au-dessus du montant configuré, ou descendre en dessous (jusqu'à `0`) si les enveloppes augmentent. Dans ce second cas, une modale d'alerte explique l'ajustement. Cet ajustement s'applique tant que la charge Épargne du mois n'est pas cochée. Toute modification de montant d'enveloppe recalcule immédiatement cette épargne (avant cochage).
- Vue par compte orientée action: montant à approvisionner en début de mois, avec contrôle d’intégrité (somme des comptes = total à provisionner).
- Règle de calcul "Par compte": pour les lignes `commun`, le montant à approvisionner additionne uniquement `ma part` (et non le montant total de la ligne).
- Cartes "Par compte" optimisées lecture rapide: total mis en avant + lignes métriques alignées (charges, cochées, enveloppes, impact reliquat).
- Transparence calculs: bloc repliable "Détails du calcul" dans Totaux et info-bulle sur "Reste du mois" des enveloppes.
- UI mobile/lecture: boutons de sections renforcés et pills plus lisibles via utilitaires Tailwind v4 récents (`pointer-coarse`, `text-shadow-*`, `wrap-break-word` / `wrap-anywhere`).
- Ajout rapide mobile (iOS Safari): la modale se repositionne au-dessus du clavier (Visual Viewport) pour rester visible pendant la saisie.
- Archivage d'un mois: gel des charges et budgets, lecture seule.
- Données locales (IndexedDB) + sync best-effort dans Redis (Vercel KV / Upstash).
- Auth simple: login/register, cookie HTTP-only, reset via recovery code.
- Optimisations perfs: calculs mensuels dédupliqués, scans O(n²) évités, sync Redis chunkée/concurrente.

## Stack

- React 19 + React DOM 19
- Vite 7 + `@vitejs/plugin-react` 5
- Tailwind CSS 4.2.1 (PostCSS via `@tailwindcss/postcss`)
- TypeScript 5.9

Configuration Tailwind: approche CSS-first (`@import "tailwindcss"`, `@source`, `@theme` dans `src/styles.css`, sans `tailwind.config` JS).
Conventions UI: composants utilitaires Tailwind v4 dans `@layer components` (`fm-panel`, `fm-card`, `fm-input`, `fm-btn-*`, `fm-stat-*`) pour harmoniser Résumé, Enveloppes et formulaires.
Utilitaires UI: usage de `pointer-coarse:*`, `text-shadow-*`, `wrap-break-word` et `wrap-anywhere` pour l'ergonomie tactile et la lisibilité.
Fond dynamique: crossfade en 2 couches piloté par tokens Tailwind v4 CSS-first (`@theme` avec `--duration-bg-crossfade` et `--ease-bg-crossfade`) pour n'afficher l'image suivante qu'après chargement/décodage, avec rotation automatique fréquente (~1m à ~1m15 sur appareils standard).

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
<summary>Performance</summary>

Architecture de performance actuelle:
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
- Édition des charges globales: une modification s'applique au mois courant et aux mois suivants non archivés.
- Exceptions d'édition: une charge ponctuelle reste locale à son mois, et un mois archivé conserve son snapshot (gelé).
- Budgets par enveloppe + dépenses par mois.
- Reliquat d’enveloppe: le reste d’un mois (positif ou négatif) est reporté sur le mois suivant de la même enveloppe. Un reliquat positif réduit le virement du mois suivant; un reliquat négatif alimente la dette reportée.
- Reliquat traité (optionnel): si activé sur un mois/enveloppe, le reliquat entrant est conservé comme information mais n’est plus appliqué dans le calcul du montant à virer pour ce mois.
- Dette du mois traitée (optionnel): si activé sur un mois/enveloppe, la dette générée ce mois est conservée comme information mais n’est plus reportée au mois suivant.
- Montant d’enveloppe à virer: `max(0, montant enveloppe + dette entrante - reliquat positif entrant)`.
- Dette entrante: augmente le virement d’enveloppe du mois courant (si non traitée).
- Reste du mois (enveloppe): `montant cible - dépensé` (la dette reportée n’augmente pas ce reste affiché).
- Enveloppe Essence: chaque dépense est stockée avec le libellé `Essence` (le libellé utilisateur est ignoré pour cette enveloppe).
- Consolidation mensuelle du reliquat (entrant vers mois suivant): base de reste `max(montant cible, reliquat positif entrant - dette entrante)` puis `reste = base de reste - dépensé`.
- Reliquat positif sortant: `max(0, reste)` (reporté comme reliquat entrant).
- Dette reportée fin de mois: `max(0, -reste)` (reportée uniquement si non traitée).
- Exemple enveloppe récurrente: cible `100`, dépensé `80` sur le mois N -> reliquat positif `20` reporté -> mois N+1: `à virer = 80`.
- Total à provisionner du mois: `charges (pour moi) + enveloppes à virer`.
- Dans le panneau Totaux, l’impact reliquat distingue: dette entrante ajoutée au virement d’enveloppe (rouge) et reliquat positif à déduire sur l’enveloppe à virer (vert).
- Par compte: `charges à provisionner + enveloppes à virer` (la dette entrante et le reliquat positif sont intégrés au montant d’enveloppes à virer). Si des lignes référencent un compte non configuré, elles restent visibles et incluses dans les totaux.
- Pour une charge `commun`, la contribution en `Par compte` utilise toujours `ma part` (split%) de la ligne.
- Totaux: commun, ma part, perso, reste à vivre, reste après enveloppes.
- Épargne auto: l'ajustement ne s'applique plus dès que la charge Épargne est cochée pour le mois en cours. Avant cochage, le calcul peut réduire l'épargne sous son plancher configuré (jusqu'à `0`) et l'UI affiche une alerte explicative.
- Épargne dans l'UI: la ligne Épargne n'est plus affichée dans le tableau `Charges`; elle reste pleinement incluse dans les totaux globaux et les calculs `Par compte` (approvisionnement par compte inchangé).

</details>
