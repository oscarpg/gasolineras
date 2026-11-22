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

### Phase 0 — Spikes & setup ✅ done 2026-11-21

- `android/` Gradle project (AGP 8.13, Kotlin 2.3, Compose M3, minSdk 26, targetSdk 36), Android Lint.
  Deferred to Phase 3: Hilt, ktlint/detekt, splash screen.
- `:map-api` (`MapRenderer`, `MapStyle`, §3.1) and `:map-maplibre` (MapLibre + OpenFreeMap).
- Diagnostics app (MITECO, OpenFreeMap, location, map stress test, copyable report).
- CI: lint, unit tests, debug APK, emulator tests on API 26 / 30 / 36.

Results:

| Check             | Emulators API 26 / 30 / 36                       | Pixel 10 Pro, Android 17 (API 37)          |
| ----------------- | ------------------------------------------------ | ------------------------------------------ |
| MITECO TLS + data | ✅ DigiCert chain trusted, 894 stations (Madrid) | ✅ 894 stations, 944 kB in 647 ms          |
| OpenFreeMap       | ✅                                               | ✅ 164 ms                                  |
| Location          | —                                                | ✅ precise fix in 1.5 s, ±16 m             |
| Map, 894 markers  | —                                                | ✅ 119.9 fps, 0% janky frames, worst 10 ms |

Conclusions: no `network_security_config` needed; GeoJSON-layer markers are smooth at 120 Hz,
so clustering is optional rather than required.

### Phase 1 — Domain port ✅ done 2026-11-21

- `:core` module: pure Kotlin/JVM (no Android imports), so it builds and tests anywhere.
  Ports `src/domain/*` and `src/config/*`: types (`LatLng`, `FuelType` enum with MITECO fields,
  `Station`, `Discount`, sealed `AgeFilter`, `AgeFilterOption` with the web ids and legacy codes),
  brands, provinces, pricing, geo, staleness, price history, colour scale (`ScaleColor`),
  dates (`java.time`), numbers, errors, `Preferences` model and `selectVisibleStations`.
- 75 JUnit tests: all 74 web domain test cases with the same inputs and expected values, plus
  MITECO date parsing and rounding checks. Brand and province tables verified identical (order included).
- Parity details kept on purpose: `+x.toFixed(3)` rounding, `Math.round` for hues,
  `parseFloat`-style number parsing, stable sort.
- CI runs `:core:test`; each push publishes the debug APK to the `android-test-build` pre-release.

### Phase 2 — Data layer ✅ done 2026-11-21

- `:data` module, pure Kotlin/JVM (tested locally and in CI):
  - `OkHttpHttpClient` (timeouts → `AppError` TIMEOUT, non-2xx → `HttpError`), `fetchWithFallback`.
  - `MitecoRepository`: JSON first, then MITECO's default XML; daily cache (2-day TTL),
    history days cached 15 days, concurrent callers share one download. No CORS relays needed.
  - `Cache` with the web entry format (`v`/`e`/`w`), TTL and oldest-first eviction, on
    `FileStorage` (one atomic file per key, size cap) — 30 MB in `cacheDir`.
  - `PreferencesCodec` (web schema v3, same validation and v1/v2 migrations) and `PreferencesStore`
    (`StateFlow`, saved to a JSON file in `filesDir`). Decision: a JSON file via `FileStorage`
    instead of DataStore — same guarantees here, fewer dependencies, testable on the JVM.
  - `NominatimGeocoder` (1 req/s `RateLimiter`, session cache, failures not cached),
    `FallbackGeocoder` (phone first), `OsrmRouter`.
- App: `AndroidGeocoder` (platform `Geocoder`, async API on 33+), `LocationRepository`
  (fused provider, last-known fallback), `AppContainer` + `GasolinerasApp` (manual DI until Phase 3).
- 52 JUnit tests ported from the web suites with the shared fixtures; real XML and JSON MITECO
  files give identical stations (also checked on Android's runtime by an instrumented test).
- Diagnostics "Datos (prueba completa)": position → province → stations (download + cache) →
  history → staleness → visible stations, plus search, route and preferences save, all live.

Phone check (Pixel 10 Pro, Android 17, A Coruña): province 15 from both the phone geocoder
(272 ms) and Nominatim (1.1 s); 291 stations downloaded in 615 ms, 52 ms from cache; 4/4 history
days; 87 stations within 15 km; search, a 6,386-point route and preferences save all OK.

### Phase 3 — State & ViewModel ✅ done 2026-11-21

- `:state` module, pure Kotlin/JVM: `AppState`, `Store` (`StateFlow`), pure transitions,
  memoised `VisibleStationsSelector`, `countBrands`, `Effects` (province loading, background
  history checks sized by the age filter, deeper checks on demand), debounced
  `PreferencesPersister` (flushed in `onStop`), and `AppController` — the web
  `locationController` without DOM: GPS/address → origin → province → stations, routes (loading
  the destination province), refresh, statuses and errors with Retry, map events.
- 42 JUnit tests: the web transition/effect/persistence tests plus the controller flows.
- App: `MainViewModel` (`MainUiState` = state + visible rows + status), `LocationPositionProvider`,
  ES/EN texts for statuses, errors and fuels (same wording as the web app), and a temporary
  preview screen with the live list.
- Decisions:
  - Manual DI (`AppContainer`) instead of Hilt: a handful of objects, no annotation processing,
    faster builds.
  - Neighbouring provinces (improvement over the web app, requested 2026-11-21): the list includes
    every province within the search radius (+2 km margin) of the origin, and every province within
    the detour distance of a route — not just the user's and the destination's. Uses bundled IGN
    province outlines (`ProvinceShapes`, es-atlas, CC BY 4.0 © IGN; ~170 kB, offline), which also
    give the province when geocoding fails. Changing the radius or detour loads what's newly reached.

### Phase 4 — Core UI ✅ done 2026-11-22 (large-screen layout moved to Phase 6)

- `MainScreen`: full-screen MapLibre map (dark style in dark mode) with green→red price markers,
  user position and route; floating search bar (search key = origin, arrow = route, ⋮ menu with
  Preferences, refresh and diagnostics); my-location FAB; "route active" chip.
- `ResultsSheet` (`BottomSheetScaffold`): summary/status, history progress, fuel chips, sort switch,
  errors with Retry, station list.
- `StationDetailSheet`: price and discount, distance/detour + round trip, tank + trip cost, price
  age, hours, 7-day Canvas chart, all fuel prices, Directions (`geo:` intent) and Share.
- Performance (from phone feedback "opening a station lags"): selected marker in its own layer,
  marker GeoJSON built off the main thread and only when the list changes; MITECO cache reads on
  `Dispatchers.IO` with an in-memory LRU of decoded provinces/history days.
- Not needed: marker clustering (894 markers at 120 fps). Pull-to-refresh replaced by the menu entry.

### Phase 5 — Settings & i18n ✅ done 2026-11-22

- `SettingsScreen`: fuel, max distance and route detour sliders, route-only, price-age options
  with custom days, cars (activate/add/edit/delete), brands with counts, per-brand discounts,
  language, About with data attributions (MITECO, OSM/OpenFreeMap, IGN CC BY 4.0, Nominatim, OSRM).
- Decisions:
  - Per-app language without AppCompat: `LocaleManager` on Android 13+ (kept in sync with system
    settings), context wrapping on older versions; the choice is also saved in preferences.
  - `updateCar` edits a car in place and keeps its id (the web app saves by name, so a rename
    there creates a second car).
- All strings ES/EN with the web app's wording; preferences persist (debounced, flushed in `onStop`).

### Changes requested after Phase 5 (2026-11-22)

- Brands: "Deselect all" / "Select all" buttons; the checklist stays open while choosing (nothing
  ticked = no filter, as on the web).
- Station details: "Show on map" next to Directions and Share (zooms to the station, keeps it highlighted).
- Sorting: equal prices (or total costs) go nearer first — smaller detour on a route, then distance
  from the user. Differs from the web app, which keeps load order for ties.

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
| MITECO cert chain not trusted on some Android versions                          | ✅ Resolved in Phase 0: DigiCert chain, trusted from API 26 (emulator tests in CI keep checking it).                                                                 |
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
