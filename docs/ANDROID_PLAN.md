# Gasolineras for Android — implementation plan

Goal: a native Android app with the same features as the web app (nearest and
cheapest stations from MITECO data, real cost with car + discounts, route mode,
price-age filter, 7-day price chart, ES/EN), looking and behaving like a
first-class Android app.

**Decisions taken:** map = OpenFreeMap (behind a swappable map layer, see §3.1) ·
distribution = signed APK on GitHub Releases · package = `es.gasolineras` ·
home-screen widget included in the first release.

## 1. Key decisions

| Topic             | Decision                                                                                                                                                                           | Why                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Approach          | **Native Kotlin + Jetpack Compose** (not a WebView/Capacitor wrapper)                                                                                                              | "Clean and native" look, real Material components, back gestures, smooth map, widgets later. The web app's logic is small (~1.5k lines of pure domain code) and well tested, so a port is cheap. |
| Design system     | **Material 3** with Material You dynamic colour (Android 12+), brand palette fallback, light/dark, edge-to-edge                                                                    | Looks native on every device.                                                                                                                                                                    |
| minSdk            | **26 (Android 8.0)**                                                                                                                                                               | Covers ~97% of active devices, native `java.time`, adaptive icons, no desugaring hacks.                                                                                                          |
| target/compileSdk | **36** (current Play requirement)                                                                                                                                                  | Required for Play Store.                                                                                                                                                                         |
| Language / build  | Kotlin 2.x, Gradle Kotlin DSL, version catalog (`libs.versions.toml`)                                                                                                              | Current standard.                                                                                                                                                                                |
| Architecture      | Single activity, MVVM + unidirectional state (`StateFlow`), mirroring the web `store / transitions / selectors / effects` split                                                    | Same mental model as the web code; domain stays pure and testable.                                                                                                                               |
| DI                | Hilt                                                                                                                                                                               | Standard, integrates with ViewModels and WorkManager.                                                                                                                                            |
| Networking        | OkHttp + Retrofit (or Ktor) + kotlinx.serialization                                                                                                                                | No CORS on Android: call MITECO directly, **drop the CORS relays**.                                                                                                                              |
| Map               | **MapLibre Native (Android) + OpenFreeMap vector tiles**, behind a provider-agnostic map interface (§3.1)                                                                          | No API key, no billing account, OSM data like the web. Tiles or the whole map SDK can be swapped later without touching screens.                                                                 |
| Location          | Fused Location Provider (Play Services), coarse + fine permission, "approximate" supported                                                                                         | Fast fixes, battery friendly.                                                                                                                                                                    |
| Geocoding         | Platform `android.location.Geocoder` first, Nominatim fallback (keep 1 req/s limiter + identifying User-Agent)                                                                     | Fewer calls to Nominatim; postcode → province logic is reused.                                                                                                                                   |
| Routing           | OSRM (same as web)                                                                                                                                                                 | Reuse; flag as risk (demo server is not for production).                                                                                                                                         |
| Persistence       | Preferences: **DataStore** (JSON-serialised `Preferences` v3, same schema). Cache: JSON files in `cacheDir` with TTL (same keys: `stations:<prov>:<day>`, `history:<prov>:<date>`) | Mirrors `storage/cache.ts` and `storage/preferences.ts`.                                                                                                                                         |
| Chart             | Small custom Compose `Canvas` line chart                                                                                                                                           | Only one chart; avoids a dependency.                                                                                                                                                             |
| i18n              | `strings.xml` (`values-es` default content, `values-en`), per-app language via `AppCompatDelegate.setApplicationLocales` + `locales_config.xml`                                    | Native language picker in system settings on Android 13+.                                                                                                                                        |
| Package / app id  | `es.gasolineras` (debug builds: `es.gasolineras.debug`)                                                                                                                            | Chosen.                                                                                                                                                                                          |
| Distribution      | Signed APK attached to GitHub Releases; Play Store later                                                                                                                           | Chosen. Release build stays Play-ready (AAB can be added in one CI step).                                                                                                                        |
| Repo layout       | New `android/` folder in this repo, independent Gradle project                                                                                                                     | Shares fixtures and docs; web build untouched.                                                                                                                                                   |

## 2. Feature mapping (web → Android)

| Web                                | Android                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full-screen Leaflet map            | Full-screen MapLibre map, coloured price markers (green→red, same `colorForValue`), clustering at low zoom                                                                                                                |
| Floating "cheapest stations" panel | `BottomSheetScaffold`: peek shows top 3, drag up for full list; fuel `FilterChip` row at the top of the sheet                                                                                                             |
| Top bar ☰ / 📍                    | Search bar (destination for route mode) + "My location" FAB                                                                                                                                                               |
| Preferences drawer                 | Settings screen (Navigation Compose): Fuel & filters, Search radius / route detour, Brands, Discounts, Cars, Language                                                                                                     |
| Cars section                       | "My cars" list screen + add/edit dialog; active car picker in the sheet                                                                                                                                                   |
| Station popup / card               | Station detail `ModalBottomSheet`: prices for all fuels, discount applied, distance, cost breakdown, price age, 7-day chart, opening hours, **Navigate** (intent to Maps/Waze via `geo:`/`google.navigation:`), **Share** |
| "Sort by total cost" checkbox      | Sort toggle (segmented button €/l ↔ total cost) in the sheet                                                                                                                                                              |
| Toasts / status line               | Snackbars + inline empty/error states with Retry                                                                                                                                                                          |
| Browser locale                     | System locale + per-app language                                                                                                                                                                                          |

## 3. Project structure

```
android/
  settings.gradle.kts, build.gradle.kts, gradle/libs.versions.toml
  app/src/main/java/es/gasolineras/
    domain/        # pure Kotlin port of src/domain (types, pricing, filters, staleness,
                   #   ageFilter, geo, brands, provinces, colorScale, dates, numbers, priceHistory)
    config/        # fuels, brands, provinces, endpoints
    data/
      miteco/      # MitecoApi, JSON + XML parsing, MitecoRepository (once-per-key, cache)
      geocoding/   # GeocoderRepository (platform + Nominatim, rate limiter)
      routing/     # OsrmRouter
      cache/       # FileCache with TTL
      prefs/       # PreferencesRepository (DataStore, schema v3 + migrations)
      location/    # LocationRepository (fused provider, permission state)
    state/         # AppState, transitions, selectors, effects (coroutines)
    widget/        # Glance home-screen widget + WorkManager refresh
    ui/
      theme/       # Color, Type, Shape, dynamic colour
      map/         # MapScreen + api/ (MapRenderer, MapMarker, MapStyle) — SDK-free
      results/     # sheet, list rows, sort/fuel controls
      station/     # detail sheet, PriceChart
      settings/    # settings screens, cars, discounts, brands
      components/  # shared composables
    MainActivity.kt, GasolinerasApp.kt (Hilt)
  map-maplibre/        # MapLibreRenderer: the only module that knows MapLibre
  app/src/test/        # JVM unit tests (domain, parsing, repos with MockWebServer)
  app/src/androidTest/ # Compose UI tests
```

### 3.1 Swappable map layer

Screens never import MapLibre. They talk to a small interface and receive plain domain data:

```kotlin
// ui/map/api — no SDK types here
data class MapMarker(val id: String, val position: LatLng, val label: String, val color: Color, val selected: Boolean)
data class CameraTarget(val center: LatLng, val zoom: Double)

interface MapRenderer {
    @Composable
    fun Map(
        markers: List<MapMarker>,
        route: List<LatLng>?,
        userPosition: LatLng?,
        camera: CameraTarget,
        contentPadding: PaddingValues,       // keeps markers clear of the bottom sheet
        onMarkerClick: (id: String) -> Unit,
        onCameraIdle: (CameraTarget) -> Unit,
        modifier: Modifier,
    )
}

data class MapStyle(val styleUrl: String, val darkStyleUrl: String, val attribution: String)
```

- `ui/map/maplibre/MapLibreRenderer` is the only code that depends on the MapLibre SDK.
- The tile source is configuration: `MapStyle` is provided by Hilt from `config/MapConfig.kt`
  (OpenFreeMap "liberty" / dark style URLs today). Switching to MapTiler, Stadia or a
  self-hosted style = change the URLs (and add a key via `BuildConfig` if needed).
- Switching SDK (e.g. Google Maps) = add `ui/map/google/GoogleMapRenderer` and change one
  Hilt binding. A `FakeMapRenderer` is used in Compose UI tests.
- Map SDK isolated in its own Gradle module (`:map-maplibre`) so a replacement doesn't
  touch the app module's dependencies.

Test fixtures: reuse `tests/fixtures/*.json|xml` from the web project (Gradle copies
them into test resources), so both apps are validated against the same real samples.

## 4. Phases

Each phase ends with a working, tested build; mirrors how the web refactor was done.

### Phase 0 — Spikes & setup (1–2 days)

- Create `android/` Gradle project, version catalog, Compose + M3, Hilt, ktlint/detekt, Android Lint.
- Spike: fetch `FiltroProvincia/28` from a real device/emulator. **Verify the MITECO TLS
  chain** (FNMT-issued cert); if the system trust store rejects it, add a
  `network_security_config.xml` pinning the FNMT root for that host only.
- Spike: MapLibre + OpenFreeMap rendering 1,000+ markers smoothly (GeoJSON symbol layer), light and dark styles.
- Define the `MapRenderer` interface and `MapStyle` config (§3.1) before any map screen is written.
- App id `es.gasolineras`, name, adaptive icon (reuse ⛽ identity), splash screen API.
- **Done when:** empty app with theme runs on API 26 and API 36 emulators; CI builds it.

### Phase 1 — Domain port (2–3 days)

- Port `src/domain/*` and `src/config/*` to pure Kotlin (no Android imports).
  `LatLng`, `FuelType` enum, `Station`, `Discount` (sealed/enum `CTS`/`PCT`), `AgeFilter` sealed class, etc.
- Port the Vitest suites for these modules to JUnit (same cases, same expected values).
- **Done when:** `./gradlew :app:testDebugUnitTest` passes with domain parity tests.

### Phase 2 — Data layer (3–4 days)

- `MitecoRepository`: current prices + history day, JSON parsing (ask for
  `Accept: application/json`), XML fallback parser (`_xHHHH_` tag decoding), Spanish
  decimal parsing, in-flight request de-duplication (`Mutex`/shared `Deferred`), daily cache (2-day TTL, history 15 days).
- `FileCache` with TTL and size cap; `PreferencesRepository` on DataStore with schema v3, defaults and validation (clamp radius 1–50, detour 1–10, custom days 1–10).
- `GeocoderRepository`, `OsrmRouter`, `LocationRepository`.
- Tests with MockWebServer + the shared fixtures.
- **Done when:** repositories return correct `Station`s from fixtures; offline returns cached data.

### Phase 3 — State & ViewModel (2 days)

- `AppState` + pure transitions + selectors (`selectVisibleStations` reused from domain).
- Effects as coroutines: load province(s) for the user's position (incl. neighbouring
  provinces near borders, as the web does), history check sized by the age filter, route mode.
- `MainViewModel` exposing `StateFlow<UiState>`; one-off events (snackbars) via `Channel`.
- **Done when:** ViewModel tests cover GPS → province → stations → filtered rows, and route mode.

### Phase 4 — Core UI (5–7 days)

- Theme (M3, dynamic colour, dark mode, typography), edge-to-edge, predictive back.
- Map screen: markers coloured by metric, selected-marker state, route polyline, attribution.
- Location permission flow (rationale, approximate-only, denied → manual search).
- Results bottom sheet: fuel chips, sort toggle, rows (price, discount badge, distance/detour, total cost, price-age tag), empty/loading/error states, pull-to-refresh.
- Station detail sheet with Navigate / Share, 7-day price chart.
- Destination search → route mode, clear route.
- **Done when:** the full happy path from `docs/SMOKE_TEST.md` works on device.

### Phase 5 — Settings & i18n (3 days)

- Settings screens: fuel, age filter (options + custom days), radius, detour, route-only, brands multi-select, per-brand discounts, cars CRUD + active car, language.
- All strings in `values/strings.xml` (es) and `values-en/`, plurals, number/currency formatting with `Locale`.
- **Done when:** every preference persists across process death; ES/EN fully translated.

### Phase 6 — Hardening & quality (3 days)

- Accessibility: TalkBack labels, 48dp targets, contrast of marker text (reuse `textColorFor`), font scaling to 200%.
- Large screens/foldables: list-detail layout on width ≥ 600dp (sheet becomes side panel).
- Offline banner, timeouts/retries, process-death restore (`SavedStateHandle`).
- R8/minify rules, Baseline Profile for startup, StrictMode in debug.
- Compose UI tests for main flows; optional screenshot tests (Roborazzi/Paparazzi).
- **Done when:** no lint errors, cold start < 1.5 s on a mid-range device, UI tests green.

### Phase 7 — Home-screen widget (2–3 days)

- Jetpack Glance widget (resizable: small = best price + brand; medium = top 3 with distance).
- Data: last known location + active car's fuel (or chosen fuel), stations from the daily cache; refresh with a periodic `WorkManager` job (e.g. every 3 h, unmetered not required) and on app open.
- Tap a row → opens the app on that station; refresh button; "location unavailable" / "no data" states.
- Respects dynamic colour and dark mode; strings in ES/EN.
- **Done when:** widget updates after a price refresh and survives reboot; works with only "approximate location".

### Phase 8 — APK release (1–2 days)

- GitHub Actions `android.yml` (path filter `android/**`, `tests/fixtures/**`): lint, detekt, unit tests, `assembleRelease` on every PR.
- On tag `android-v*`: build a **signed release APK** (keystore + passwords as repository secrets), attach it to a GitHub Release with changelog. `versionName` from the tag, `versionCode` from the run number.
- In-app "About": version, data sources and OSM/OpenFreeMap attribution, link to releases page.
- README section: how to install the APK (allow "install unknown apps"), and how to update.
- Keep the build Play-ready (R8, signing config, privacy policy page on GitHub Pages) so publishing later is only adding `bundleRelease` + the Play listing.

### Phase 9 — Later, optional

- Play Store publishing (AAB, listing ES/EN, data-safety form).
- App shortcuts ("Cheapest near me", "Route home").
- Android Auto (Car App Library, POI category) — later, needs Google review.
- Favourite stations and price-drop notifications (WorkManager daily check).

**Rough total:** ~5 weeks for one developer to reach a released APK with widget (Phases 0–8).

## 5. Risks & mitigations

| Risk                                                                            | Mitigation                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MITECO cert chain not trusted on some Android versions                          | Verify in Phase 0; host-scoped `network_security_config` with the FNMT root.                                                                                         |
| MITECO downtime / slow responses (large XML/JSON per province)                  | Daily file cache, show cached data with "last updated" label, generous timeouts, retry.                                                                              |
| OSRM and Nominatim public servers have usage policies not meant for app traffic | Identifying User-Agent, rate limiting, platform Geocoder first; plan a fallback (self-hosted OSRM, or Google Directions/OpenRouteService with key) if the app grows. |
| OSM tile usage policy                                                           | Use OpenFreeMap (or MapTiler/Google Maps), never `tile.openstreetmap.org` directly from the app.                                                                     |
| Logic drift between web and Android                                             | Shared fixtures + ported parity tests; any domain change updates both test suites.                                                                                   |
| Many markers hurting performance                                                | MapLibre symbol layer (GeoJSON source) instead of individual views; clustering.                                                                                      |

## 6. Decision log

| Date       | Decision                                                                        |
| ---------- | ------------------------------------------------------------------------------- |
| 2026-11-21 | Native Kotlin + Compose, Material 3, minSdk 26 / targetSdk 36                   |
| 2026-11-21 | Map: OpenFreeMap tiles via MapLibre, behind a swappable `MapRenderer` interface |
| 2026-11-21 | Distribution: signed APK on GitHub Releases (Play Store later)                  |
| 2026-11-21 | Package name: `es.gasolineras`                                                  |
| 2026-11-21 | Home-screen widget included in the first release                                |
