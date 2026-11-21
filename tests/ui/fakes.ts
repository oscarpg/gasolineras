/** Fakes shared by the UI tests: a Leaflet stand-in, a recording status line and map view. */
import type { LatLng } from '../../src/domain/types';
import type { StatusLine } from '../../src/ui/components/resultsPanel';
import type { LeafletStatic } from '../../src/ui/map/leaflet';
import type { MapView } from '../../src/ui/map/mapView';

export interface FakeLayer {
  layers: Set<unknown>;
  addTo(): FakeLayer;
  addLayer(layer: unknown): FakeLayer;
  removeLayer(layer: unknown): FakeLayer;
  clearLayers(): FakeLayer;
}

/** Enough of Leaflet for mapView, stationMarkers and app.ts; records what happens. */
export function fakeLeaflet() {
  const log: string[] = [];
  const layer = (): FakeLayer => {
    const l: FakeLayer = {
      layers: new Set(),
      addTo: () => l,
      addLayer: (x) => (l.layers.add(x), l),
      removeLayer: (x) => (l.layers.delete(x), l),
      clearLayers: () => (l.layers.clear(), l),
    };
    return l;
  };
  const map = {
    view: null as { center: LatLng; zoom: number } | null,
    bounds: null as unknown,
    layers: new Set<unknown>(),
    setView(center: LatLng, zoom: number) {
      map.view = { center, zoom };
      return map;
    },
    fitBounds(b: unknown) {
      map.bounds = b;
      return map;
    },
    removeLayer(x: unknown) {
      map.layers.delete(x);
      return map;
    },
  };
  const markers: Marker[] = [];
  class Marker {
    content: string | (() => string) = '';
    open = false;
    icon: unknown;
    constructor(
      readonly position: LatLng,
      options: { icon?: unknown } = {},
    ) {
      this.icon = options.icon;
      markers.push(this);
    }
    addTo(target: FakeLayer | typeof map) {
      if ('layers' in target && target.layers instanceof Set) target.layers.add(this);
      return this;
    }
    bindPopup(c: string | (() => string)) {
      this.content = c;
      return this;
    }
    get html() {
      return typeof this.content === 'function' ? this.content() : this.content;
    }
    openPopup() {
      this.open = true;
      log.push(`open ${this.html.slice(0, 40)}`);
      return this;
    }
    isPopupOpen() {
      return this.open;
    }
    getPopup() {
      return { update: () => log.push('popup update') };
    }
    setIcon(icon: unknown) {
      this.icon = icon;
      return this;
    }
  }
  const L = {
    map: () => map,
    tileLayer: () => ({ addTo: () => undefined }),
    layerGroup: layer,
    marker: (p: LatLng, o?: { icon?: unknown }) => new Marker(p, o),
    divIcon: (o: { html?: string; className?: string }) => o,
    polyline: (points: LatLng[]) => ({ points, addTo: (l: FakeLayer) => l.addLayer({ points }) }),
    latLngBounds: (points: LatLng[]) => ({ points }),
  } as unknown as LeafletStatic;
  return { L, map, log, markers };
}

/** A StatusLine that records what it was asked to show. */
export function recordingStatus() {
  const shown: string[] = [];
  const errors: { message: string; retry?: () => void }[] = [];
  let cleared = 0;
  const status: StatusLine = {
    show: (m) => void shown.push(m),
    error: (message, retry) => void errors.push({ message, retry }),
    clearError: () => void cleared++,
  };
  return { status, shown, errors, cleared: () => cleared, last: () => shown[shown.length - 1] };
}

/** A MapView that records calls. */
export function recordingMapView() {
  const calls: string[] = [];
  const view: MapView = {
    L: fakeLeaflet().L,
    stationsLayer: {} as MapView['stationsLayer'],
    showUserPosition: (p, z) => void calls.push(`user ${p.join(',')} z${z}`),
    showRoute: (points) => void calls.push(`route ${points.length}`),
    clearRoute: () => void calls.push('clear route'),
    focus: (p, z) => void calls.push(`focus ${p.join(',')} z${z}`),
  };
  return { view, calls };
}

/** Resolves after pending promise callbacks have run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
