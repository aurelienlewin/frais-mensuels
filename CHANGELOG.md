# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows semantic-style commit topics.

## [Unreleased]

### Fixed
- (2026-09-23): Fixed a production build failure (`TS2688: Cannot find type definition file for 'vite/client'`) introduced by the TypeScript 7 upgrade. `tsconfig.json` declared `"types": ["vite/client"]` globally in `compilerOptions`, which is redundant (`src/vite-env.d.ts` already scopes the same ambient types to `src/` via a triple-slash reference) and leaked into Vercel's isolated per-function build of `api/*.ts`, which never imports `vite` (a devDependency) and therefore couldn't resolve it. Removed the redundant global `types` entry; `api/` functions no longer have any reason to resolve `vite/client`. Verified locally that `npm run typecheck` and `npm run build` are unaffected, and that an isolated compile scoped to `api/` alone no longer references `vite/client`.

### Performance
- (2026-09-23): `AppView` already computed the month's resolved charges/budgets once via `useMemo`, but its four child panels (`SummaryPanel`, `BudgetsPanel`, `ChargesTable`, `SavingsPanel`) each independently re-ran the same `chargesForMonth`/`budgetsForMonth` selectors from scratch on every state change instead of receiving the already-computed result. `budgetsForMonth` in particular walks every month's budget history to resolve carry-over chains, so this meant that single computation ran up to 5 times on every edit. The parent now passes the resolved rows down as props; no visual or behavioral change (verified via `typecheck`, `build`, and a `preview` smoke check).

### Security
- (2026-09-23): Updated `postcss`, `autoprefixer`, `vite`, and `@vitejs/plugin-react` to their latest compatible releases, which transitively resolved 4 npm audit findings (3 high, 1 moderate): `browserslist` unbounded memory growth / prototype-write crash, `nanoid` infinite loop on invalid size, `postcss` source-map path traversal, and `baseline-browser-mapping` denial of service. `npm audit` is now clean.

### Changed
- (2026-09-23): Updated React and React DOM to `19.3.0` (with matching `@types/react`/`@types/react-dom`), Tailwind CSS and `@tailwindcss/postcss` to `4.3.3`, Vite to `8.3.0`, and `@vitejs/plugin-react` to `6.1.1`. No behavior or visual changes intended; verified via `typecheck`, `build`, and a local `preview` smoke check.
- (2026-09-23): Upgraded TypeScript from `6.0.3` to `7.0.2` (the native Go-based compiler line). This project's `tsconfig.json` already avoided every option removed in 7.0 (`target: es5`, `downlevelIteration`, `moduleResolution: node10`/`classic`, `baseUrl`), so no config changes were needed; `typecheck` and `build` pass unchanged.

### Known deferred updates
- None at this time. `npm outdated` and `npm audit` are both clean after this batch.

### Known gaps (pre-existing, not introduced by this update)
- `tsconfig.json` only covers `src/`; the Vercel serverless functions under `api/` are not typechecked by `npm run typecheck` (they're transpiled independently by Vercel at deploy time, and this repo has no `@types/node` to typecheck them locally). This is what allowed the `vite/client` leak above to go unnoticed until a production deploy. Still out of scope to fully close (would need a dedicated `api/tsconfig.json` and `@types/node`), but worth revisiting.
