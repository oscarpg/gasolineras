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
}

/** The Leaflet map. `L` is passed in (main.ts gives the real library, tests a fake). */
export function createMapView(elementId: string, L: LeafletStatic): MapView {
  const map = L.map(elementId).setView(SPAIN_CENTER, 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> · Precios: MITECO",
  }).addTo(map);
  const stationsLayer = L.layerGroup().addTo(map);
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
  };
}
