/**
 * The small part of Leaflet's API the app uses, typed by hand.
 *
 * Leaflet is still loaded from the CDN <script> in index.html as the global `L`.
 * Keeping the surface this small makes it easy to move to the npm package
 * (`leaflet` + `@types/leaflet`) later, or to fake it in tests.
 */
export type LatLngTuple = readonly [number, number];

export interface LeafletIcon {
  readonly __leafletIcon?: never;
}

export interface LeafletBounds {
  readonly __leafletBounds?: never;
}

export interface LeafletLayer {
  addTo(target: LeafletMap | LeafletLayerGroup): this;
}

export interface LeafletMarker extends LeafletLayer {
  bindPopup(content: string): this;
  setPopupContent(content: string): this;
  setIcon(icon: LeafletIcon): this;
  openPopup(): this;
}

export interface LeafletLayerGroup extends LeafletLayer {
  clearLayers(): this;
  removeLayer(layer: LeafletLayer): this;
}

export interface LeafletMap {
  setView(center: LatLngTuple, zoom: number): this;
  fitBounds(bounds: LeafletBounds): this;
  removeLayer(layer: LeafletLayer): this;
}

export interface DivIconOptions {
  className: string;
  html?: string;
  iconSize: [number, number];
  iconAnchor: [number, number];
  popupAnchor: [number, number];
}

export interface LeafletStatic {
  map(elementId: string): LeafletMap;
  tileLayer(urlTemplate: string, options: { maxZoom: number; attribution: string }): LeafletLayer;
  layerGroup(): LeafletLayerGroup;
  marker(position: LatLngTuple, options?: { icon?: LeafletIcon; zIndexOffset?: number }): LeafletMarker;
  divIcon(options: DivIconOptions): LeafletIcon;
  polyline(points: readonly LatLngTuple[], options: { color: string; weight: number }): LeafletLayer;
  latLngBounds(points: readonly LatLngTuple[]): LeafletBounds;
}

/** The global Leaflet object loaded by index.html. */
export function getLeaflet(): LeafletStatic {
  const leaflet = (globalThis as { L?: LeafletStatic }).L;
  if (!leaflet) throw new Error('Leaflet is not loaded');
  return leaflet;
}
