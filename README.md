# Gasolineras

Web app that shows the nearest and cheapest petrol stations in Spain on a map,
using the official price data from MITECO. It takes your fuel, your car's tank
and consumption, brand discounts and an optional route into account to tell you
which station is really the most convenient.

Live site: <https://oscarpg.github.io/gasolineras/>

## Requirements

- Node.js 20.19 or newer (22 LTS recommended)

## Getting started

```bash
npm install        # first time only; commit the generated package-lock.json
npm run dev        # http://localhost:5173/gasolineras/
```

## Scripts

| Command            | What it does                                            |
| ------------------ | ------------------------------------------------------- |
| `npm run dev`      | Local dev server with hot reload                        |
| `npm run build`    | Type-check and build the static site into `dist/`       |
| `npm run preview`  | Serve `dist/` locally to check the production build     |
| `npm run check`    | Lint + format check + type-check + tests (what CI runs) |
| `npm test`         | Unit tests (Vitest)                                     |
| `npm run lint`     | ESLint                                                  |
| `npm run format`   | Format all files with Prettier                          |
| `npm run coverage` | Tests with a coverage report (`coverage/index.html`)    |
| `npm run fixtures` | Download small real API samples into `tests/fixtures/`  |

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: lint, format check,
type-check, tests, build, then publish `dist/` to GitHub Pages.
Pull requests run the same checks without deploying.

One-time setup in GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Project structure

The app is being refactored from a single `index.html` into layered modules.
The full plan, target structure and decisions live in the Gasolineras project
(`claude/refactor-plan.md`).

```
index.html          markup shell (legacy inline code still here during migration)
src/                TypeScript source (config, domain, services, storage, state, ui, i18n)
tests/              Vitest tests and API fixtures
scripts/            developer scripts
docs/SMOKE_TEST.md  manual checklist to run after each refactor phase
```

## Android app

A native Android version lives in `android/` (Kotlin, Jetpack Compose, Material 3; Android 8.0+).

- **Install:** download `gasolineras-<version>.apk` from the
  [latest Android release](https://github.com/oscarpg/gasolineras/releases?q=android-v) on the phone
  and open it (allow installing unknown apps if Android asks). Update by installing the new APK over
  the old one; settings are kept.
- **Test builds:** every push publishes a debug build to the
  [android-test-build](https://github.com/oscarpg/gasolineras/releases/tag/android-test-build)
  pre-release (app id `es.gasolineras.debug`, installs alongside the release).
- **Publishing a release:** push a tag `android-vX.Y.Z`, or run the "Android release" workflow from
  the Actions tab with the version `X.Y.Z` (it creates the tag); `.github/workflows/android-release.yml`
  runs the tests, builds and signs the APK and creates the GitHub Release. Signing uses the
  repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`
  and `ANDROID_KEY_PASSWORD`.
- Plan and decisions: `docs/ANDROID_PLAN.md`.

## Data sources

- Fuel prices: [MITECO – Geoportal de hidrocarburos](https://geoportalgasolineras.es/) REST service
- Map tiles and geocoding: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (Nominatim)
- Routing: [OSRM](https://project-osrm.org/) demo server
- Province outlines: [es-atlas](https://github.com/martgnz/es-atlas) (MIT), from © [IGN](https://www.ign.es/) data (CC BY 4.0); the file is shared with the Android app (`android/core/src/main/resources/es/gasolineras/core/provinces.txt`)
