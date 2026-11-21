import type { StationRow } from '../../domain/filters';
import { stationIcon } from './icons';
import type { LeafletLayerGroup, LeafletMarker, LeafletStatic } from './leaflet';
import { stationPopupHtml, type PopupContext } from './stationPopup';

interface Entry {
  marker: LeafletMarker;
  color: string;
  popup: string;
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
 * Keeps one marker per visible station. Instead of clearing and recreating every
 * marker on each render (what the original did), it diffs by station id, so
 * moving a slider only touches the markers that appear, disappear or change.
 */
export function createStationMarkers(L: LeafletStatic, layer: LeafletLayerGroup): StationMarkers {
  const entries = new Map<string, Entry>();

  return {
    update(rows, context) {
      const visible = new Set<string>();

      for (const row of rows) {
        const id = row.station.id;
        visible.add(id);
        const popup = stationPopupHtml(row, context).value;
        const entry = entries.get(id);

        if (!entry) {
          const marker = L.marker([row.station.lat, row.station.lon], { icon: stationIcon(L, row.color) })
            .bindPopup(popup)
            .addTo(layer);
          entries.set(id, { marker, color: row.color, popup });
          continue;
        }
        if (entry.color !== row.color) {
          entry.marker.setIcon(stationIcon(L, row.color));
          entry.color = row.color;
        }
        if (entry.popup !== popup) {
          entry.marker.setPopupContent(popup);
          entry.popup = popup;
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
