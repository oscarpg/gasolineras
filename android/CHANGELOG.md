# Changelog — Gasolineras para Android

Todas las versiones publicadas de la app Android. Cada versión es un
[release en GitHub](https://github.com/oscarpg/gasolineras/releases) con su APK firmado.
_All published versions of the Android app; English below each entry._

## [Sin publicar] — _Unreleased_

### Correcciones

- **Tocar un bocadillo abre su gasolinera**, no otra que quede debajo de él.

### Fixes

- **Tapping a bubble opens its station**, not another one hidden under it.

## [1.0.5] — 2026-11-28

### Mejoras

- **Bocadillos desde el zoom inicial.** Los bocadillos con logotipo y precio aparecen ya al
  abrir el mapa, a escala de ciudad; las gasolineras mejor situadas en la lista los muestran primero.
- **Logotipos en la lista de resultados, en el filtro de marcas y en la ficha de la gasolinera.**

### Improvements

- **Bubbles from the initial zoom.** Logo and price bubbles show as soon as the map opens, at city
  scale; the stations ranked highest in the list get them first.
- **Logos in the results list, the brand filter and the station details.**

## [1.0.4] — 2026-11-28

### Mejoras

- **Marcadores tipo bocadillo en el mapa.** Al acercar el mapa, cada gasolinera muestra un
  bocadillo con el logotipo de su marca, más grande, y el precio, señalando su ubicación. Si dos
  bocadillos se solapan, se muestra el de la gasolinera que va antes en la lista.

### Improvements

- **Speech-bubble markers on the map.** Zoomed in, each station shows a bubble with its brand's
  logo, now bigger, and its price, pointing at its location. When two bubbles would overlap, the
  one for the station higher in the list is shown.

## [1.0.3] — 2026-11-27

### Novedades

- **Logotipos de las marcas en el mapa.** Al acercar el mapa, cada gasolinera muestra el logotipo
  de su marca (o sus iniciales si no hay logotipo) dentro de un anillo del color de su precio.
  Al alejarlo vuelven a ser puntos de color.
- **Logotipos en el widget**, a la izquierda del nombre de la marca.

### New

- **Brand logos on the map.** Zoomed in, each station shows its brand's logo (or its initials when
  there is no logo) inside a ring of its price colour. Zoomed out, they are coloured dots again.
- **Logos in the widget**, to the left of the brand name.

## [1.0.2] — 2026-11-27

### Corregido

- **El widget ya no dice siempre «hace 0 minutos».** Ahora muestra la hora de la última
  actualización: «Actualizado a las 14:32», «Actualizado ayer a las 14:32» o la fecha.
- **Etiquetas de antigüedad del precio más claras** en la lista y en la ficha: «Precio actualizado
  hoy», «ayer», «hace 2 días» o «hace 4 días o más», en lugar de «sin cambios 2 d» o «Precio
  cambiado desde ayer».

### Fixed

- **The widget no longer always says "0 minutes ago".** It now shows the time of the last update:
  "Updated at 14:32", "Updated yesterday at 14:32" or the date.
- **Clearer price-age labels** in the list and the details: "Price updated today", "yesterday",
  "2 days ago" or "4 or more days ago", instead of "unchanged 2 d" or "Price changed since yesterday".

## [1.0.1] — 2026-11-24

### Corregido

- **«Solo gasolineras en la ruta» ya no muestra gasolineras para las que hay que salir de la
  carretera.** Antes bastaba con estar a menos de 150 m de la línea de la ruta, así que entraban:
  - áreas de servicio del **otro sentido** de una autovía o autopista;
  - gasolineras en **calles o polígonos junto a la vía**, a las que solo se llega por una salida.

  Ahora la app comprueba cada gasolinera cercana a la ruta (a menos de 300 m) **por carretera**:
  calcula cuánto más se conduce yendo desde un punto de la ruta 2 km antes, pasando por la
  gasolinera, hasta un punto 2 km después, frente a seguir recto. Si el rodeo es de **1 km o
  menos**, está en la ruta.

  La comprobación usa el mismo servicio de rutas (OSRM) que ya calcula la ruta, con una sola
  petición por cada 30 gasolineras. Mientras se hace, o si falla (por ejemplo sin conexión), se
  usa la regla anterior de 150 m.

### Fixed

- **"Only stations on the route" no longer lists stations you have to leave the road for.** Before,
  being within 150 m of the route line was enough, so it let in service areas on the **other
  carriageway** of a motorway, and stations on **streets or estates beside the road** that need an
  exit. Now each station within 300 m of the route is **checked by road**: the extra distance of
  driving from a route point 2 km before it, through it, to a point 2 km after it. Up to **1 km**
  extra counts as on the route. It uses the same routing service (OSRM), one request per 30 stations; while
  it runs, or if it fails (e.g. offline), the previous 150 m rule applies.

## [1.0.0] — 2026-11-22

Primera versión publicada. _First published version._

- Mapa con los precios en colores y lista ordenable por €/l, distancia o coste total.
- Provincias vecinas dentro del radio y todas las de una ruta.
- Coches, descuentos por marca, filtros por marca y por antigüedad del precio.
- Favoritas, gráfico de 7 días, «Cómo llegar», widgets y modo sin conexión.
- Español e inglés. Android 8.0 o superior.

[1.0.1]: https://github.com/oscarpg/gasolineras/releases/tag/android-v1.0.1
[1.0.0]: https://github.com/oscarpg/gasolineras/releases/tag/android-v1.0.0
