import { describe, expect, it } from 'vitest';
import { selectVisibleStations } from '../../src/domain/filters';
import { directionsUrl, placeUrl, shareStation, shareText } from '../../src/ui/stationActions';
import { branded, prices } from '../state/fixtures';

const row = selectVisibleStations(
  [
    branded('a', {
      brand: 'CEPSA',
      address: 'Calle Mayor 1',
      lat: 40.4,
      lon: -3.7,
      prices: prices({ GASOLINA_95: 1.459 }),
    }),
  ],
  {
    fuel: 'GASOLINA_95',
    brands: [],
    ageFilter: { mode: 'all' },
    staleness: {},
    userPosition: [40.4, -3.7],
    route: null,
    searchRadiusKm: 15,
    routeDetourKm: 3,
    routeOnly: false,
    car: null,
    discounts: { CEPSA: { type: 'CTS', value: 5 } },
    sortByTotalCost: false,
    sortByDistance: false,
  },
).rows[0]!;

const recordingToast = () => {
  const shown: string[] = [];
  return { shown, toast: { show: (m: string) => void shown.push(m) } };
};

describe('station actions', () => {
  it('builds Google Maps links', () => {
    expect(directionsUrl(40.4, -3.7)).toBe('https://www.google.com/maps/dir/?api=1&destination=40.4,-3.7');
    expect(placeUrl(40.4, -3.7)).toBe('https://www.google.com/maps/search/?api=1&query=40.4,-3.7');
  });

  it('shares brand, fuel, discounted price, address and a map link', () => {
    expect(shareText(row, 'Gasolina 95')).toBe(
      'CEPSA — Gasolina 95: 1,409 €/l\nCalle Mayor 1\nhttps://www.google.com/maps/search/?api=1&query=40.4,-3.7',
    );
  });

  it('uses the share sheet when there is one; cancelling is silent', async () => {
    const shared: string[] = [];
    const { shown, toast } = recordingToast();
    await shareStation('hi', { share: async ({ text }) => void shared.push(text), toast });
    await shareStation('hi', { share: () => Promise.reject(new Error('AbortError')), toast });
    expect(shared).toEqual(['hi']);
    expect(shown).toEqual([]);
  });

  it('otherwise copies the text and says so, or says it could not', async () => {
    const copied: string[] = [];
    const { shown, toast } = recordingToast();
    await shareStation('hi', { copy: async (t) => void copied.push(t), toast });
    await shareStation('hi', { copy: () => Promise.reject(new Error('denied')), toast });
    await shareStation('hi', { toast });
    expect(copied).toEqual(['hi']);
    expect(shown).toEqual(['Copiado al portapapeles', 'No se pudo copiar', 'No se pudo copiar']);
  });
});
