/**
 * The small part of Leaflet's API the app uses, typed by hand.
 *
 * Leaflet comes from the npm package (bundled by Vite). The rest of the app
 * only sees this narrow interface, so it stays easy to fake in tests and the
 * map library could be swapped without touching the components.
 */
import * as LeafletModule from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

/** Popup content: HTML, or a function Leaflet calls each time the popup opens or updates. */
export type PopupContent = string | (() => string);

export interface LeafletPopup {
  /** Re-evaluates the content (calls the content function again). */
  update(): void;
}

export interface LeafletMarker extends LeafletLayer {
  bindPopup(content: PopupContent): this;
  setIcon(icon: LeafletIcon): this;
  openPopup(): this;
  isPopupOpen(): boolean;
  getPopup(): LeafletPopup | undefined;
  setZIndexOffset(offset: number): this;
}

export interface LeafletLayerGroup extends LeafletLayer {
  clearLayers(): this;
  removeLayer(layer: LeafletLayer): this;
}

export interface LeafletMap {
  setView(center: LatLngTuple, zoom: number): this;
  fitBounds(bounds: LeafletBounds, options?: FitBoundsOptions): this;
  removeLayer(layer: LeafletLayer): this;
  getZoom(): number;
  getContainer(): HTMLElement;
  latLngToContainerPoint(position: LatLngTuple): { x: number; y: number };
  on(event: 'zoomend' | 'moveend', handler: () => void): this;
}

export interface FitBoundsOptions {
  paddingTopLeft?: [number, number];
  paddingBottomRight?: [number, number];
  maxZoom?: number;
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

/** The Leaflet library, seen through the narrow interface above. */
export function getLeaflet(): LeafletStatic {
  return LeafletModule as unknown as LeafletStatic;
}
