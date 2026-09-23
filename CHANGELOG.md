# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows semantic-style commit topics.

## [Unreleased]

### Security
- (2026-09-23): Updated `postcss`, `autoprefixer`, `vite`, and `@vitejs/plugin-react` to their latest compatible releases, which transitively resolved 4 npm audit findings (3 high, 1 moderate): `browserslist` unbounded memory growth / prototype-write crash, `nanoid` infinite loop on invalid size, `postcss` source-map path traversal, and `baseline-browser-mapping` denial of service. `npm audit` is now clean.

### Changed
- (2026-09-23): Updated React and React DOM to `19.3.0` (with matching `@types/react`/`@types/react-dom`), Tailwind CSS and `@tailwindcss/postcss` to `4.3.3`, Vite to `8.3.0`, and `@vitejs/plugin-react` to `6.1.1`. No behavior or visual changes intended; verified via `typecheck`, `build`, and a local `preview` smoke check.
