# Web parity guide: Android features to bring to the web app

The Android app (`android/`) started as a port of the web app, then gained features from phone
feedback. This guide covers each Android feature the web app (`src/`) lacks. For each one it says
how it behaves on Android, where the Android code is, what to change in the web app, and which
tests to add.

References use these short prefixes:

- `core/…`: `android/core/src/main/kotlin/es/gasolineras/core/`
- `state/…`: `android/state/src/main/kotlin/es/gasolineras/state/`
- `app/…`: `android/app/src/main/java/es/gasolineras/`

## Out of scope

These are tied to Android, or the web app already has them in another form:

| Android                                                                     | Why it is not ported                                                                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Home-screen widgets, WorkManager refresh                                    | Browsers have no home-screen widgets. A PWA with notifications would be a separate project.                                             |
| Signed APK releases, StrictMode, Compose UI tests                           | Platform tooling.                                                                                                                       |
| Restoring the origin after process death (`SavedStateHandle`)               | A reload already starts fresh and asks for GPS.                                                                                         |
| Per-app language through `LocaleManager`                                    | The web app already has a language selector (`languageSection.ts`).                                                                     |
| MapLibre and OpenFreeMap vector map; separate layer for the selected marker | The web app uses Leaflet with OSM raster tiles. Moving it to MapLibre GL JS is possible but separate work, unrelated to these features. |
| Wide layout (side panel at 600 dp or wider)                                 | The web layout is already responsive CSS.                                                                                               |

## Summary and suggested order

Domain changes come first: they are small, pure and covered by tests. UI work builds on them.

| #   | Feature                                                                                      | Layer                    | Effort | Value                                                                 |
| --- | -------------------------------------------------------------------------------------------- | ------------------------ | ------ | --------------------------------------------------------------------- |
| 1   | [Equal prices: nearer first](#1-equal-prices-nearer-first)                                   | domain                   | XS     | Better ranking for ties                                               |
| 2   | [Sort by distance](#2-sort-by-distance)                                                      | domain, prefs, UI        | S      | Asked for on Android                                                  |
| 3   | [Neighbouring provinces](#3-neighbouring-provinces)                                          | domain, state, UI, asset | M      | **High**: near a province border, half the stations are missing today |
| 4   | [Favourites](#4-favourites)                                                                  | prefs, state, UI         | M      | High                                                                  |
| 5   | [Directions, share and show on map](#5-directions-share-and-show-on-map)                     | UI                       | S      | High on phones                                                        |
| 6   | [Auto-zoom and empty-result actions](#6-auto-zoom-and-empty-result-actions)                  | UI                       | S      | Avoids an "empty" map                                                 |
| 7   | [Quick chips in the results panel](#7-quick-chips-in-the-results-panel)                      | UI                       | S      | Fewer trips to the drawer                                             |
| 8   | [Filters apart from preferences](#8-filters-apart-from-preferences)                          | UI                       | M      | Clearer navigation                                                    |
| 9   | [Brands: select all and deselect all](#9-brands-select-all-and-deselect-all)                 | UI, state                | XS     | Makes "only these brands" quick                                       |
| 10  | [Edit a car without duplicating it](#10-edit-a-car-without-duplicating-it)                   | state, UI                | XS     | Fixes a rename creating a second car                                  |
| 11  | [Offline banner](#11-offline-banner)                                                         | UI                       | XS     | Explains why prices are old                                           |
| 12  | [Station details: all fuels; accessibility](#12-station-details-all-fuels-and-accessibility) | UI                       | S      | Polish                                                                |

Do the domain parts of 1–4 in one PR, and the UI in one or two more. Keep `npm run check` green
throughout. When a domain rule changes, update both test suites (`tests/domain/*.test.ts` and
`android/core/src/test/...`) so the two apps don't drift apart.

---

## 1. Equal prices: nearer first

**Android:** when two stations have the same €/l (or total cost), the nearer one comes first.
On a route, that means the smaller detour first, then the shorter distance from the user. Any
remaining ties keep load order. See `core/domain/Filters.kt`, `selectVisibleStations`.

**Web:** `src/domain/filters.ts` sorts by the metric only, and keeps load order for ties
(documented in `AppState.stations`).

**Change** the sort in `selectVisibleStations`:

```ts
const far = Number.POSITIVE_INFINITY;
rows.sort(
  (a, b) =>
    metricOf(a) - metricOf(b) ||
    (a.routeDetourKm ?? far) - (b.routeDetourKm ?? far) ||
    (a.distanceFromUserKm ?? far) - (b.distanceFromUserKm ?? far),
);
```

Move `metricOf` above the sort, so the sort and the colour scale use the same function. Also update
the comment on `AppState.stations`, which says load order is the tie-break.

**Tests** (`tests/domain/filters.test.ts`):

- Two stations at the same price, the farther one loaded first: the nearer one ranks first.
- The same on a route, using detour.
- Equal price and equal distance: load order is kept.

## 2. Sort by distance

**Android:** sort chips `€/l · Distancia · Coste total` (total cost appears only with a car).
"Distance" means the detour when a route is active, with price breaking ties. **Colours always
rank price** (or total cost), whatever the order, so the cheapest station stays green.

Android code:

- `core/domain/Preferences.kt`: `sortByDistance`.
- `core/domain/Filters.kt`: `VisibilityCriteria.sortByDistance`, `VisibleStations.sortedByDistance`.
- `app/ui/main/ResultsSheet.kt`: the sort chips.

**Web changes:**

1. **`src/domain/preferences.ts`:** add `sortByDistance: boolean` (default `false`). The schema
   version changes in [§4](#4-favourites); do both in the same schema bump.
2. **`src/domain/filters.ts`:**
   - Add `sortByDistance: boolean` to `VisibilityCriteria`, and `sortedByDistance: boolean` to
     `VisibleStations`.
   - Sort by distance like this:
     ```ts
     const distanceOf = (r: Row) => r.routeDetourKm ?? r.distanceFromUserKm ?? far;
     if (c.sortByDistance) rows.sort((a, b) => distanceOf(a) - distanceOf(b) || metricOf(a) - metricOf(b));
     ```
   - Compute the colour scale's `min` and `max` with `Math.min` / `Math.max` over all metrics.
     Today it takes the first and last row, which is only right when rows are sorted by the metric.
   - Return `sortedByTotalCost: sortedByTotalCost && !c.sortByDistance`.
3. **`src/state/selectors.ts`:** pass `sortByDistance` from preferences.
4. **`src/storage/preferences.ts`:** read the field as a boolean, defaulting to `false`.
5. **UI (`resultsPanel.ts`, `index.html`):** replace the "sort by total cost" checkbox with three
   segmented buttons (`role="radiogroup"`). The total-cost button is disabled without a car.
   - Choosing one sets both flags: `€/l` is both off; `distance` sets `sortByDistance`; `total`
     sets `sortByTotalCost` and clears `sortByDistance`.
   - `statusSummary` (`src/ui/format.ts`) gets a "sorted by distance" variant.
6. **i18n (`src/i18n/es.ts`, `en.ts`):** `results.sortLabel` "Ordenar:" / "Sort:",
   `results.sortPrice` "€/l", `results.sortDistance` "Distancia" / "Distance",
   `results.sortTotal` "Coste total" / "Total cost".

**Tests:**

- Domain: the order is by distance while colours still follow price; ties in distance go cheaper
  first; on a route, the detour is what counts.
- Storage: a missing field defaults to `false`.
- UI: clicking the distance button reorders the cards.

## 3. Neighbouring provinces

**Android:**

- The list includes **every province within the search radius of the origin** (plus a 2 km
  margin). With a route, it includes every province within the detour distance of the route.
- Changing the radius, detour or "only on route" loads any newly reached province (debounced
  400 ms, because sliders fire many events).
- The bundled outlines also give the province when reverse geocoding fails, with no network call.

Android code:

- `core/domain/ProvinceShapes.kt`: outlines, point in polygon, distance to outline, provinces
  within a radius, provinces along a route.
- `android/scripts/build_province_shapes.py`: generator; data from es-atlas (MIT), built from
  IGN data, CC BY 4.0.
- `android/core/src/main/resources/es/gasolineras/core/provinces.txt`: about 170 kB, one line per
  province (`code|lon,lat;…|ring…`).
- `state/ProvinceLocator.kt`: `PROVINCE_MARGIN_KM = 2.0`.
- `state/AppController.kt`: `provincesNeeded`, `loadProvincesNeeded`, `ensureCoverage`.

**Web today:** `locationController.ts` loads only the origin's province, from Nominatim reverse
geocoding, and the destination's province for a route. Near a border, stations a few km away in
the next province are missing.

**Web changes:**

1. **Asset.** Keep one source of truth. Import the Android file as text in a lazily loaded chunk,
   so the first page load isn't heavier:
   ```ts
   // src/domain/provinceShapes.ts
   export async function loadProvinceShapes(): Promise<ProvinceShapes> {
     const { default: text } = await import(
       '../../android/core/src/main/resources/es/gasolineras/core/provinces.txt?raw'
     );
     return parseProvinceShapes(text);
   }
   ```
   If coupling to the `android/` path is unwanted, move the file to `data/provinces.txt` and point
   the Gradle resource and the generator at it. Credit IGN (CC BY 4.0) on the map, next to the
   MITECO credit.
2. **`src/domain/provinceShapes.ts`** (pure, about 120 lines): port `ProvinceShapes.kt` as is.
   - Per-province bounding box and `boxFartherThan`.
   - Even-odd `contains`.
   - `distanceKm`, the minimum of `distanceToSegmentKm` (already in `src/domain/geo.ts`) over
     every ring edge.
   - `provinceAt(p)`.
   - `provincesWithin(p, radiusKm)`, nearest first.
   - `provincesAlongRoute(route, detourKm, stepKm = 2)`: sample the route every 2 km and add the
     step to the radius.
3. **`src/state/effects.ts`** or a new `src/state/coverage.ts`:
   ```ts
   export function provincesNeeded(s: AppState, shapes: ProvinceShapes): string[] {
     const p = s.preferences;
     if (s.route)
       return shapes.provincesAlongRoute(
         s.route,
         (p.routeOnly ? ROUTE_ONLY_MAX_KM : p.routeDetourKm) + PROVINCE_MARGIN_KM,
       );
     if (s.userPosition) return shapes.provincesWithin(s.userPosition, p.searchRadiusKm + PROVINCE_MARGIN_KM);
     return [];
   }
   ```
4. **`src/ui/locationController.ts`:**
   - `setOrigin`: after the origin is set, load every province in `provincesNeeded` that isn't
     loaded yet. Use `shapes.provinceAt` as the province when Nominatim gives none. Show
     `message.provinceUnknown` only when both fail (at sea, or in Portugal).
   - `calculateRoute`: after `setRoute`, load the provinces along the route, not just the
     destination's.
   - Add `ensureCoverage()`, which loads whatever is missing. Call it, debounced by 400 ms, from
     the radius, detour and route-only controls (`locationRouteSections.ts`), and from the filters
     panel in [§8](#8-filters-apart-from-preferences).
   - Each failed province shows its own error with Retry, as `loadProvince` already does. Keep
     loading the others.
5. **Loading message:** with several provinces, show `message.downloadingProvince` for each, or
   use a new "Downloading N provinces…" message.

**Tests:**

- Shapes: port `ProvinceShapesTest.kt`, which uses known points:
  - well-known places (Madrid 28, A Coruña 15, Palma 07, Ceuta 51…) map to their province;
  - Lisbon, open sea and Paris give none;
  - Aranjuez with a 15 km radius gives 28 first and includes 45 (Toledo) but not 19 (Guadalajara);
  - a straight Madrid → Zaragoza line meets 28, then 19, then 50.
- Controller (with a fake `ProvinceShapes`):
  - an origin near a border loads two provinces;
  - widening the radius loads a third;
  - a failure in one province still shows the others.

## 4. Favourites

**Android:**

- A heart in the station details and on every list row toggles a favourite.
- A **"♥ Favoritas (N)"** chip in the list shows **only favourites, wherever they are**: their
  provinces are loaded, and the radius and route don't apply.
- Favourites are saved with the preferences as `{ id, provinceCode, brand }`, so a favourite's
  province can be loaded without searching.

Android code:

- `core/domain/Preferences.kt`: `FavouriteStation`, `favourites`.
- `data/prefs/PreferencesCodec.kt`: the JSON is `favourites: [{id, provinceCode, brand}]`.
- `state/Transitions.kt`: `toggleFavourite`, `setFavouritesOnly`.
- `state/AppState.kt`: `favouritesOnly`, which isn't persisted.
- `state/Selectors.kt`: passes `onlyIds` and drops the route while showing favourites.
- `core/domain/Filters.kt`: `onlyIds` skips the range check.
- `state/AppController.kt`: `showFavourites` loads the favourites' provinces.

**Web changes:**

1. **Preferences (`src/domain/preferences.ts`):**
   - Set `schemaVersion: 4`.
   - Add `favourites: FavouriteStation[]` (default `[]`) and `sortByDistance` (from §2).
   - In `src/storage/preferences.ts`, migrate v3 → v4 by adding defaults, and validate each
     favourite: non-empty `id`; `provinceCode` of two digits from 01 to 52; `brand` as a string.
     Drop duplicates by `id`.
   - Use the same field names as Android, so a future export or import between the two works.
2. **State:**
   - Add `favouritesOnly: boolean` to `AppState` (not persisted; `false` at start).
   - In `transitions.ts`, add `toggleFavourite(s, station)` and `setFavouritesOnly(s, on)`.
3. **Domain (`filters.ts`):** add `onlyIds?: ReadonlySet<string>` to `VisibilityCriteria`.
   - When it is set, a station outside the set is skipped, and the range check is skipped.
   - The distance is still computed, for display and the trip cost.
4. **Selector:** with `favouritesOnly`, pass `onlyIds` as the favourite ids and `route: null`.
   Add `favouritesOnly` to the memo inputs.
5. **Controller:** `showFavourites(on)` sets the flag. When it is on, it loads each distinct
   `provinceCode` of the favourites that isn't loaded, then rerenders.
6. **UI:**
   - **Results panel:** a `♥ Favoritas (N)` toggle chip, shown only when N > 0. When favourites
     are on, the summary reads "N favourites".
   - **List row (`stationCard.ts`):** a heart button `data-action="favourite"`, with
     `aria-pressed` and the label "Añadir a favoritas" / "Quitar de favoritas". Use `delegate`,
     and `stopPropagation` so the card click (focus station) doesn't fire.
   - **Popup (`stationPopup.ts`):** the same heart next to the name.
   - In favourites mode, an empty list shows "No favourites yet: tap ♥ on a station".
7. **i18n:** `favourites.chip`, `favourites.add`, `favourites.remove`, `favourites.empty`,
   `favourites.summary`.

**Tests:**

- Storage: v3 data loads with `favourites: []`; invalid entries are dropped.
- Domain: `onlyIds` shows a favourite 200 km away and hides nearer non-favourites.
- State: toggling adds, then removes.
- Controller: turning favourites on loads a favourite's province that isn't loaded.
- UI: the heart toggles without opening the card.

## 5. Directions, share and show on map

**Android:**

- **Station details:** one row with **Cómo llegar** (directions), **Ver en el mapa** (show on
  map), and a small **share** icon button.
- **List rows:** a directions button opens the maps app straight away, without opening the
  details. It is also a TalkBack custom action.
- **Show on map** zooms to the station and keeps it highlighted.
- **Share** text:
  ```
  {brand} — {fuel}: {price} €/l
  {address}
  https://www.google.com/maps/search/?api=1&query={lat},{lon}
  ```

Android code: `app/ui/main/StationActions.kt` (`geo:` intent), `app/ui/main/StationDetailSheet.kt`
(action row, `share`), `app/ui/main/ResultsSheet.kt` (row button).

**Web today:** the popup has no directions or share. Clicking a card already focuses the station
and opens its popup (`app.ts`), which is the web form of "show on map".

**Web changes:**

1. **`src/ui/stationActions.ts`** (new):
   ```ts
   export const directionsUrl = (lat: number, lon: number) =>
     `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
   export const shareText = (row: StationRow, fuelName: string) => /* format above */;
   export async function shareStation(text: string, url: string, toast: Toaster) {
     if (navigator.share) {
       try {
         await navigator.share({ text, url });
       } catch {
         /* cancelled */
       }
     } else {
       await navigator.clipboard.writeText(text);
       toast.show(i18n().t('station.copied'));
     }
   }
   ```
   The Google Maps "dir" link opens the Google Maps app on Android and iOS when it is installed,
   and the website otherwise. An optional alternative: a `geo:` link on Android browsers, detected
   with `/Android/i.test(navigator.userAgent)`, which lets the user pick Waze or OsmAnd.
2. **Popup (`stationPopup.ts`):** after the price block, add a button row:
   - `<a class="btn" href="{directionsUrl}" target="_blank" rel="noopener">Cómo llegar</a>`
   - a share icon button with `data-action="share"`.

   Bind it with `delegate` on the map container, as `bindPriceHistoryButtons` does.

3. **Cards (`stationCard.ts`):** add a compact directions link (an icon with
   `aria-label="Cómo llegar a {name}"`). Stop propagation, so the card's focus action doesn't run.
4. **Keep the station highlighted** after "show on map": give the focused marker a CSS class
   (`.is-selected`: bigger and outlined) until another station is picked. `stationMarkers.ts`
   needs `select(id | null)`.
5. **i18n:** `station.directions` "Cómo llegar" / "Directions", `station.share`
   "Compartir" / "Share", `station.copied` "Copiado al portapapeles" / "Copied to clipboard".

**Tests:**

- `directionsUrl` and `shareText` (pure).
- UI with mocked `navigator.share` and the clipboard: the fallback path shows a toast.
- The card's directions link doesn't trigger the card click.

## 6. Auto-zoom and empty-result actions

**Android:**

- **Auto-zoom:** after a **new origin** or a **user change** to a filter, fuel, car, sort or
  favourites, the map fits **the origin and the 3 cheapest stations** once results arrive. It
  never moves on background updates, such as history checks or a refresh. It doesn't run with a
  route, which fits the route instead. In favourites mode, it fits the favourites only.
  - Zoom is clamped to 3–15, with a minimum span of 0.005° so a single point doesn't zoom in fully.
  - Code: `app/MainViewModel.kt`, `fitPending`, `userChange`, `fitCamera`.
- **No results:** the list shows two buttons:
  - **"Ampliar a N km"**: radius + 10 km, capped at 50.
  - **"Quitar filtros"**: no price-age filter and no brand filter.

**Web changes:**

1. **`MapView` (`mapView.ts`):** add `fitPoints(points: LatLng[])` using
   `map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })`. On phones, add bottom padding for
   the results panel (`paddingBottomRight`).
2. **In `app.ts`, keep a `fitPending` flag:**
   - Set it in `setOrigin`, and in every handler the user triggers: fuel, car, sort, brands, age,
     radius, favourites. Wrapping them is easiest: a `userChange(fn)` helper that sets the flag
     and calls `store.update(fn)`.
   - In `render`: if the flag is set, there's no route, and `visible.rows.length > 0`, call
     `fitPoints([origin, ...top3])` and clear the flag.
   - If there are no rows yet but provinces are loaded, clear the flag without moving.
3. **Empty state (`resultsPanel.ts` `renderList`):** replace `results.none` with the message plus
   the two buttons. Each button goes through `userChange`, so the map refits when results appear.
   Widening also calls `ensureCoverage()` from §3.
4. **i18n:** `results.widen` "Ampliar a {km} km" / "Widen to {km} km", `results.clearFilters`
   "Quitar filtros" / "Clear filters".

**Tests:**

- A fake map records `fitBounds`: a new origin fits it with the top 3; a history-check update
  doesn't refit.
- "Widen" raises the radius by 10 and caps it at 50.
- "Clear filters" resets age and brands only.

## 7. Quick chips in the results panel

**Android:** chip rows above the list for one-tap changes:

- **Favourites** (§4).
- **Fuel:** one chip per fuel present.
- **Car:** one chip per car, plus "Sin coche" (no car), shown when there are cars.
- **Sort** (§2).

The active car's name appears in the summary. Code: `app/ui/main/ResultsSheet.kt`.

**Web today:** fuel and car can only be changed in the drawer.

**Web changes (`resultsPanel.ts`, `index.html`, `results-panel.css`):**

- A horizontally scrolling chip row (`overflow-x: auto`, no wrap):
  - fuel chips, from `FUELS` filtered to those with prices in the loaded stations;
  - car chips, when `cars.length > 0`.
- Chips are `<button aria-pressed>`.
- Fuel calls `setFuel`. Car calls `selectCar`, or sets `activeCarId: null` for "no car". Both go
  through `userChange` (§6).
- Render only when the cars, fuel or locale change, like `renderSortOption` does.
- i18n: `results.noCar` "Sin coche" / "No car".

**Tests:** clicking a car chip changes the active car and the fuel; the chips mirror changes made
in the drawer.

## 8. Filters apart from preferences

**Android:**

- The ☰ menu opens a side drawer with Filtros, Preferencias, Actualizar precios and Diagnóstico.
- A **"Filtros (N)"** button next to the list summary opens the station filters: distance,
  detour, route only, price age, brands, and **Restablecer** (reset).
- **Preferencias** keeps the one-time setup: cars, discounts, language and About.
- N counts the filters that differ from the defaults.

Android code: `app/ui/settings/FiltersSheet.kt` (with `activeFilterCount()`),
`app/ui/settings/SettingsScreen.kt`, `app/ui/main/MainScreen.kt`.

**Web today:** one drawer, "⚙️ Preferencias y Filtros", holds everything: cars, location,
radius, route, fuel, age, brands, discounts and language.

**Web changes:**

1. **A filters panel** (a second `<aside>`, reusing `drawer.css` and `createDrawer` with an id
   parameter):
   - search radius, route detour, route only;
   - price age and custom days;
   - the brand list (move it out of `filtersSection.ts`);
   - a "Restablecer filtros" (reset filters) button that restores those preferences to their
     defaults.

   Fuel stays as a chip (§7).

2. **Open it** from a "Filtros (N)" button in the results panel header.
   `activeFilterCount(prefs)` (pure, in `src/domain/preferences.ts`) counts each of these that
   differs from the defaults:
   - radius;
   - detour;
   - route only;
   - age option;
   - brands, when non-empty.
3. **The preferences drawer** keeps cars, discounts, language, location (GPS or address) and the
   route destination. Rename the title key `drawer.title` to "⚙️ Preferencias".
4. **Top bar:** keep ☰ for preferences. On narrow screens, the filters button in the results
   panel is enough.
5. **i18n:** `filters.title`, `filters.button` "Filtros ({count})", `filters.reset`.

**Tests:**

- `activeFilterCount`, with one test per field.
- Reset restores only the filter fields.
- Both panels open, close with Escape, and keep focus trapped, as the current drawer does.

## 9. Brands: select all and deselect all

**Android:**

- Two buttons above the checklist: **"Desmarcar todas"** (deselect all) and **"Marcar todas"**
  (select all).
- The checklist stays open while choosing.
- Nothing ticked means no filter (all brands shown), as on the web.

**Web today:** an "All brands (N)" checkbox. Unticking it ticks every brand individually, so
picking two brands means unticking all the rest one by one.

**Web change (`filtersSection.ts`):** replace the "all" checkbox with two small buttons:

- **Deselect all:** `setAllBrands(s, true, [])`, which leaves an empty list (no filter) and
  unticks every box.
- **Select all:** `setAllBrands(s, false, present)`.

Each brand box then reflects `selected.has(brand)`. Show a hint, "Ninguna marcada = todas"
(none ticked = all), while the list is empty.

i18n: `filters.deselectAll`, `filters.selectAll`, `filters.noneMeansAll`.

**Tests:** deselecting all then ticking two brands leaves `brands` as exactly those two.

## 10. Edit a car without duplicating it

**Android:** cars are edited in place by id, and the edit dialog can rename a car. See
`state/Transitions.kt`, `updateCar`.

**Web today:** `saveCar` matches cars by name, case-insensitively. Renaming a car creates a
second car.

**Web change:**

- In `transitions.ts`, add `updateCar(s, id, input)`, which keeps the id and the active state.
- In `carsSection.ts`, add an "Editar" button per car. It fills the form and remembers the id
  being edited; "Guardar" then calls `updateCar` instead of `saveCar`; "Cancelar" clears it.

**Tests:** renaming keeps one car with the same id; the active car stays active.

## 11. Offline banner

**Android:** "Sin conexión: precios guardados" (offline: showing saved prices) above the list
while there's no network. Cached prices keep working. See `app/data/ConnectivityMonitor.kt` and
`ResultsSheet.kt`.

**Web change:**

- A banner element in the results panel, toggled by `navigator.onLine` and the
  `online` / `offline` window events.
- When the connection comes back, hide the banner. Optionally retry a pending error's action.

i18n: `message.offline`.

**Tests:** dispatch `offline` / `online` events in jsdom and check that the banner shows and hides.

## 12. Station details: all fuels and accessibility

**Android:**

- **Details:** the details show **every fuel price** the station sells, with the selected one
  highlighted. Opening hours, price age and the 7-day chart are already on the web.
- **Accessibility:**
  - each list row reads as one sentence, "{position}. {brand}, {price} €/l, {distance}", with
    actions for directions and favourite;
  - the map tap area is larger: 24 dp, and the nearest marker wins.

**Web changes:**

- **`stationPopup.ts`:** a compact table of `FUELS` with prices from `row.station.prices`, the
  selected fuel in bold, using `fuelLabel` and `pricePerLitre`.
- **`stationCard.ts`:** an `aria-label` on `.station-card` with the one-sentence summary. Keep
  the visual content `aria-hidden` only if it would be read twice.
- **Markers:** the icon is 26×38 px. On touch screens (`matchMedia('(pointer: coarse)')`), wrap
  it in a transparent `divIcon` of about 44×44 px, the minimum touch size in WCAG 2.5.5, so taps
  near a marker hit it.

**Tests:** every fuel the station sells appears in the popup; cards expose the label.

---

## Checklist per feature

- [ ] Domain change with unit tests (`tests/domain`), and the Android test updated when a shared
      rule changes.
- [ ] State: a transition, or a controller change with tests (`tests/state`, `tests/ui`).
- [ ] UI wired through `delegate`, all HTML built with `html` (escaped), and re-rendering only when
      the inputs change.
- [ ] i18n keys in `es.ts` and `en.ts` (the i18n test checks that both have the same keys).
- [ ] Preferences schema bumped once (v4: `favourites`, `sortByDistance`), with the migration
      tested.
- [ ] `npm run check` passes; try it on a phone-sized viewport.
- [ ] README feature list updated.
