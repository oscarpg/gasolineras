import type { StationRow } from '../../domain/filters';
import { i18n } from '../i18nContext';
import { stationIcon, type StationIconOptions, type StationTag } from './icons';
import type { LeafletLayerGroup, LeafletMarker, LeafletStatic } from './leaflet';
import { stationPopupHtml, type PopupContext } from './stationPopup';

/** Keeps the selected marker above the others. */
const SELECTED_Z = 1000;

interface Entry {
  marker: LeafletMarker;
  /** What the tag shows; the icon is rebuilt only when this changes. */
  tag: StationTag;
  row: StationRow;
  /** Popup HTML last shown, while the popup is open. */
  shown: string | null;
}

export interface StationMarkers {
  /** Shows exactly these rows: adds new markers, removes missing ones, and updates only what changed. */
  update(rows: readonly StationRow[], context: PopupContext): void;
  /** Opens a station's popup, if it has a marker. */
  open(stationId: string): void;
  /** Highlights one station's marker (bigger, outlined, on top) until another is picked; null clears it. */
  select(stationId: string | null): void;
  /** Number of markers on the map (for tests/diagnostics). */
  size(): number;
}

/**
 * Keeps one marker per visible station, diffed by station id: a render only adds,
 * removes or redraws the markers that changed (price, colour or brand).
 *
 * Popup HTML is built lazily — Leaflet calls the content function when a popup
 * opens — so a render with 1,000 stations doesn't build 1,000 popups. Only an
 * open popup is refreshed, and only if its content actually changed.
 */
export function createStationMarkers(
  L: LeafletStatic,
  layer: LeafletLayerGroup,
  { touch = false }: Pick<StationIconOptions, 'touch'> = {},
): StationMarkers {
  const entries = new Map<string, Entry>();
  let context: PopupContext | null = null;
  let selectedId: string | null = null;

  const tagFor = (row: StationRow): StationTag => ({
    brand: row.station.brand,
    price: i18n().number(row.finalPrice, 3),
    color: row.color,
  });
  const sameTag = (a: StationTag, b: StationTag) =>
    a.brand === b.brand && a.price === b.price && a.color === b.color;

  const iconFor = (id: string, tag: StationTag) =>
    stationIcon(L, tag, { selected: id === selectedId, touch });

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

        const tag = tagFor(row);

        if (!entry) {
          const created: Entry = {
            marker: null as unknown as LeafletMarker,
            tag,
            row,
            shown: null,
          };
          created.marker = L.marker([row.station.lat, row.station.lon], {
            icon: iconFor(id, tag),
            ...(id === selectedId ? { zIndexOffset: SELECTED_Z } : {}),
          })
            .bindPopup(() => popupHtml(created))
            .addTo(layer);
          entries.set(id, created);
          continue;
        }

        entry.row = row;
        if (!sameTag(entry.tag, tag)) {
          entry.marker.setIcon(iconFor(id, tag));
          entry.tag = tag;
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

    select(stationId) {
      if (stationId === selectedId) return;
      const previous = selectedId === null ? undefined : entries.get(selectedId);
      selectedId = stationId;
      if (previous) {
        previous.marker.setIcon(iconFor(previous.row.station.id, previous.tag)).setZIndexOffset(0);
      }
      const next = stationId === null ? undefined : entries.get(stationId);
      next?.marker.setIcon(iconFor(stationId!, next.tag)).setZIndexOffset(SELECTED_Z);
    },

    size: () => entries.size,
  };
}
