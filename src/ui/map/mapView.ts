import type { LatLng } from '../../domain/types';
import { escapeHtml } from '../dom';
import { i18n } from '../i18nContext';
import { userIcon } from './icons';
import type { LeafletLayerGroup, LeafletMarker, LeafletStatic } from './leaflet';

const SPAIN_CENTER: LatLng = [40.4168, -3.7038];
const ROUTE_COLOR = '#1565C0';

export interface MapView {
  readonly L: LeafletStatic;
  /** Layer holding the station markers (managed by stationMarkers.ts). */
  readonly stationsLayer: LeafletLayerGroup;
  /** Moves the origin marker and centres the map on it. */
  showUserPosition(position: LatLng, zoom: number): void;
  showRoute(points: readonly LatLng[]): void;
  clearRoute(): void;
  focus(position: LatLng, zoom: number): void;
  /**
   * Fits the map to these points (zoom at most 15, with a minimum span so one
   * point doesn't zoom in fully). `bottomPadding` keeps them clear of a panel.
   */
  fitPoints(points: readonly LatLng[], options?: { bottomPadding?: number }): void;
}

/** Max zoom when fitting points, and the smallest span (degrees) fitted. */
export const FIT_MAX_ZOOM = 15;
export const FIT_MIN_SPAN_DEG = 0.005;

/** Below this zoom, station tags shrink to coloured dots so they don't pile up. */
export const TAG_MIN_ZOOM = 12;

/** The corners of a box around the points, at least `minSpan` degrees wide and tall. */
export function boundsAround(points: readonly LatLng[], minSpan = FIT_MIN_SPAN_DEG): [LatLng, LatLng] {
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const widen = (min: number, max: number): [number, number] => {
    const extra = Math.max(0, minSpan - (max - min)) / 2;
    return [min - extra, max + extra];
  };
  const [south, north] = widen(Math.min(...lats), Math.max(...lats));
  const [west, east] = widen(Math.min(...lons), Math.max(...lons));
  return [
    [south, west],
    [north, east],
  ];
}

/** The Leaflet map. `L` is passed in (main.ts gives the real library, tests a fake). */
export function createMapView(elementId: string, L: LeafletStatic): MapView {
  const map = L.map(elementId).setView(SPAIN_CENTER, 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> · Precios: MITECO · Provincias: <a href='https://www.ign.es'>IGN</a> (CC BY 4.0)",
  }).addTo(map);
  const stationsLayer = L.layerGroup().addTo(map);
  const syncMarkerDensity = () =>
    map.getContainer().classList.toggle('is-zoomed-out', map.getZoom() < TAG_MIN_ZOOM);
  map.on('zoomend', syncMarkerDensity);
  syncMarkerDensity();
  const routeLayer = L.layerGroup().addTo(map);
  let userMarker: LeafletMarker | null = null;

  return {
    L,
    stationsLayer,
    showUserPosition(position, zoom) {
      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.marker(position, { icon: userIcon(L), zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(`<b>${escapeHtml(i18n().t('message.yourLocation'))}</b>`)
        .openPopup();
      map.setView(position, zoom);
    },
    showRoute(points) {
      routeLayer.clearLayers();
      L.polyline(points, { color: ROUTE_COLOR, weight: 6 }).addTo(routeLayer);
      map.fitBounds(L.latLngBounds(points));
    },
    clearRoute() {
      routeLayer.clearLayers();
    },
    focus(position, zoom) {
      map.setView(position, zoom);
    },
    fitPoints(points, { bottomPadding = 0 } = {}) {
      if (points.length === 0) return;
      map.fitBounds(L.latLngBounds(boundsAround(points)), {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, 40 + bottomPadding],
        maxZoom: FIT_MAX_ZOOM,
      });
    },
  };
}
