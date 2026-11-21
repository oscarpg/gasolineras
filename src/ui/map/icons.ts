import { escapeHtml } from '../dom';
import type { LeafletIcon, LeafletStatic } from './leaflet';

/** Red dot for the user's location / route origin. */
export const userIcon = (L: LeafletStatic): LeafletIcon =>
  L.divIcon({ className: 'marcador-usuario', iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10] });

/** Map pin filled with the station's price colour. */
export function stationIcon(L: LeafletStatic, color: string): LeafletIcon {
  const fill = escapeHtml(color);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
      <path d="M13 1C6.37 1 1 6.37 1 13c0 8.8 12 23.5 12 23.5S25 21.8 25 13c0-6.63-5.37-12-12-12z"
            fill="${fill}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="13" cy="13" r="4.5" fill="#ffffff"/>
    </svg>`;
  return L.divIcon({
    className: 'icono-gasolinera',
    html: svg,
    iconSize: [26, 38],
    iconAnchor: [13, 37],
    popupAnchor: [0, -34],
  });
}
