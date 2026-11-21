import type { StationRow } from '../../domain/filters';
import { stationIcon } from './icons';
import type { LeafletLayerGroup, LeafletMarker, LeafletStatic } from './leaflet';
import { stationPopupHtml, type PopupContext } from './stationPopup';

interface Entry {
  marker: LeafletMarker;
  color: string;
  row: StationRow;
  /** Popup HTML last shown, while the popup is open. */
  shown: string | null;
}

export interface StationMarkers {
  /** Shows exactly these rows: adds new markers, removes missing ones, and updates only what changed. */
  update(rows: readonly StationRow[], context: PopupContext): void;
  /** Opens a station's popup, if it has a marker. */
  open(stationId: string): void;
  /** Number of markers on the map (for tests/diagnostics). */
  size(): number;
}

/**
 * Keeps one marker per visible station, diffed by station id: a render only adds,
 * removes or recolours the markers that changed.
 *
 * Popup HTML is built lazily — Leaflet calls the content function when a popup
 * opens — so a render with 1,000 stations doesn't build 1,000 popups. Only an
 * open popup is refreshed, and only if its content actually changed.
 */
export function createStationMarkers(L: LeafletStatic, layer: LeafletLayerGroup): StationMarkers {
  const entries = new Map<string, Entry>();
  let context: PopupContext | null = null;

  const popupHtml = (entry: Entry) => {
    const content = stationPopupHtml(entry.row, context!).value;
    entry.shown = content;
    return content;
  };

  return {
    update(rows, nextContext) {
      context = nextContext;
      const visible = new Set<string>();

      for (const row of rows) {
        const id = row.station.id;
        visible.add(id);
        const entry = entries.get(id);

        if (!entry) {
          const created: Entry = {
            marker: null as unknown as LeafletMarker,
            color: row.color,
            row,
            shown: null,
          };
          created.marker = L.marker([row.station.lat, row.station.lon], { icon: stationIcon(L, row.color) })
            .bindPopup(() => popupHtml(created))
            .addTo(layer);
          entries.set(id, created);
          continue;
        }

        entry.row = row;
        if (entry.color !== row.color) {
          entry.marker.setIcon(stationIcon(L, row.color));
          entry.color = row.color;
        }
        if (entry.marker.isPopupOpen() && stationPopupHtml(row, nextContext).value !== entry.shown) {
          entry.marker.getPopup()?.update();
        }
      }

      for (const [id, entry] of entries) {
        if (!visible.has(id)) {
          layer.removeLayer(entry.marker);
          entries.delete(id);
        }
      }
    },

    open(stationId) {
      entries.get(stationId)?.marker.openPopup();
    },

    size: () => entries.size,
  };
}
