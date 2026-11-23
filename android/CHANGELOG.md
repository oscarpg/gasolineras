# Changelog — Gasolineras para Android

Todas las versiones publicadas de la app Android. Cada versión es un
[release en GitHub](https://github.com/oscarpg/gasolineras/releases) con su APK firmado.
_All published versions of the Android app; English below each entry._

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
