# Smoke test checklist

Run this by hand at the end of every refactor phase, with `npm run dev`
(and once against the deployed GitHub Pages site after merging).
Every item must behave exactly as before the phase started.

Tip: do one run with your normal browser profile (existing saved preferences)
and one in a private window (no saved data), so the preference migration is
tested too.

## Start-up

- [ ] Page loads with no errors in the browser console.
- [ ] Browser asks for location; on accept, the map centres on you with the red marker.
- [ ] Results panel shows "N gasolineras · <fuel> …" and a list of up to 20 stations.
- [ ] On deny, the status line tells you to open Preferences or press 📍.

## Location and distance

- [ ] 📍 button (top right) re-centres on GPS.
- [ ] Preferences → "Establecer dirección" with a street in another province loads that province.
- [ ] "Distancia máxima" slider changes the number of stations shown.

## Route

- [ ] Destination + "Calcular ruta" draws the blue route and fits the map to it.
- [ ] A destination in another province also loads that province's stations.
- [ ] "Radio de desvío" slider and "Solo gasolineras en la ruta" change the results.
- [ ] "Quitar ruta" removes the line and returns to distance mode.

## Cars

- [ ] Add a car (name, fuel, tank, consumption): it appears as "Activo" and the fuel select follows it.
- [ ] Cards show "Depósito + Viaje i/v = total".
- [ ] "Ordenar por coste total" checkbox is enabled and re-sorts the list.
- [ ] Add a second car, press "Usar" on the first; delete a car with ✕.
- [ ] Changing the fuel select to a different fuel deactivates the car.

## Filters

- [ ] Each fuel in "Carburante a mostrar" updates map and list (including GNC/GNL where a station sells them).
- [ ] Age filter: try "Actualizado hoy", "≤ 2 días", "Más de X días" with X = 5.
      The custom X field appears only for the "X" options and the info line reports the history check.
- [ ] Brands: untick "Todas", tick one brand, only that brand is shown; tick "Todas" again.

## Discounts

- [ ] Add a cts/litro discount and a % discount to brands present on the map.
- [ ] Affected stations show the discounted price, the struck-through original and the badge.
- [ ] Delete a discount with ✕.

## Map and list

- [ ] Pin colours go from green (cheapest) to red.
- [ ] Clicking a list card zooms to the station and opens its popup.
- [ ] Popup → "Ver evolución (7 días)" shows the SVG chart.
- [ ] Results panel collapses/expands from its header.
- [ ] Mobile width (≤ 700 px, use DevTools): ☰ icon replaces "Preferencias", panel spans the width.

## Language

- [ ] With the browser in Spanish, everything is in Spanish with decimal commas (`1,459 €/l`, `3,3 km`) and dates as `dd/mm/aaaa`.
- [ ] Preferences → Idioma → English: the whole UI (drawer, list, status line, popups, chart, placeholders, tab title) switches immediately, with decimal points.
- [ ] Reload: English is kept. Choose "Automatic (browser)": back to the browser's language.

## Persistence and refresh

- [ ] Reload the page: fuel, filters, radius, brands, cars, discounts and sort mode are kept.
- [ ] "Forzar actualización de precios" re-downloads and repaints without errors.
