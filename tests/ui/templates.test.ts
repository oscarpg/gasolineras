import { describe, expect, it } from 'vitest';
import { selectVisibleStations } from '../../src/domain/filters';
import type { BrandedStation } from '../../src/domain/types';
import { stationCardHtml } from '../../src/ui/components/stationCard';
import { priceChartSvg } from '../../src/ui/components/priceChart';
import { escapeHtml, html, raw, SafeHtml } from '../../src/ui/dom';
import { createStationMarkers } from '../../src/ui/map/stationMarkers';
import { stationPopupHtml } from '../../src/ui/map/stationPopup';
import type { LeafletStatic } from '../../src/ui/map/leaflet';
import { branded, prices } from '../state/fixtures';

const EVIL = `<img src=x onerror="alert('xss')">`;

describe('escapeHtml / html', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('escapes interpolated values but not the template itself', () => {
    expect(html`<b>${EVIL}</b>`.value).toBe(
      '<b>&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;</b>',
    );
  });

  it('inserts nested html and raw() as-is, joins arrays, and skips null/undefined/false', () => {
    const inner = html`<i>${'a&b'}</i>`;
    expect(html`${inner}${raw('<br>')}${['<x>', inner]}${null}${undefined}${false}${0}`.value).toBe(
      '<i>a&amp;b</i><br>&lt;x&gt;<i>a&amp;b</i>0',
    );
    expect(inner).toBeTruthy();
    expect(inner instanceof SafeHtml).toBe(true);
  });
});

const HOME = [40.4, -3.7] as const;
const visible = (
  stations: BrandedStation[],
  extra: Partial<Parameters<typeof selectVisibleStations>[1]> = {},
) =>
  selectVisibleStations(stations, {
    fuel: 'GASOLINA_95',
    brands: [],
    ageFilter: { mode: 'all' },
    staleness: {},
    userPosition: HOME,
    route: null,
    searchRadiusKm: 15,
    routeDetourKm: 3,
    routeOnly: false,
    car: null,
    discounts: {},
    sortByTotalCost: false,
    ...extra,
  }).rows;

describe('station templates escape API data', () => {
  const evilStation = branded('id"1', {
    name: EVIL,
    address: `C/ <script>x()</script>`,
    openingHours: `L-D <b>24H</b>`,
    code: `1'2`,
    brand: `B<1>`,
  });
  const car = {
    id: 'c',
    name: `<u>León</u>`,
    fuel: 'GASOLINA_95' as const,
    tankLitres: 50,
    consumptionL100km: 6,
  };
  const [row] = visible([evilStation], { car, discounts: { 'B<1>': { type: 'CTS', value: 5 } } });

  it('popup', () => {
    const out = stationPopupHtml(row!, { fuel: 'GASOLINA_95', car, hasRoute: false }).value;
    for (const bad of ['<img', '<script', '<b>24H', '<u>León', `data-code="1'2"`, `data-station="id"1"`]) {
      expect(out).not.toContain(bad);
    }
    expect(out).toContain('&lt;img src=x');
    expect(out).toContain('data-code="1&#39;2"');
    expect(out).toContain('data-action="price-history"');
    expect(out).toContain('-5 cts/l');
  });

  it('result card', () => {
    const out = stationCardHtml(row!, 0, { car, hasRoute: false, sortedByTotalCost: false }).value;
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('1. &lt;img');
    expect(out).toContain('Total: ');
  });
});

describe('station templates content', () => {
  it('shows the route detour instead of the distance when there is a route', () => {
    const [row] = visible([branded('a', { prices: prices({ GASOLINA_95: 1.5 }) })], {
      route: [HOME, [40.5, -3.7]],
    });
    const popup = stationPopupHtml(row!, { fuel: 'GASOLINA_95', car: null, hasRoute: true }).value;
    expect(popup).toContain('🛣️ Desvío de ruta: 0.0 km (0.0 km i/v)');
    expect(stationCardHtml(row!, 4, { car: null, hasRoute: true, sortedByTotalCost: false }).value).toContain(
      '5. REPSOL',
    );
  });

  it('omits the history button for stations without a MITECO code', () => {
    const [row] = visible([branded('a', { code: '' })]);
    expect(stationPopupHtml(row!, { fuel: 'GASOLINA_95', car: null, hasRoute: false }).value).not.toContain(
      'price-history',
    );
  });
});

describe('priceChartSvg', () => {
  const series = [1.5, 1.5, null, 1.52, 1.52, 1.49, 1.49].map((price, idx) => ({
    idx,
    label: `d${idx}`,
    price,
  }));

  it('plots changes only and greys out days without data', () => {
    const points = [series[0]!, series[3]!, series[5]!, series[6]!];
    const svg = priceChartSvg(series, points).value;
    expect(svg.match(/<circle/g)).toHaveLength(4);
    expect(svg).toContain('stroke-dasharray="none"');
    expect(svg).toMatch(/fill="#bbb"\s*>d2<\/text/);
    expect(svg).not.toContain('grafica-nota');
  });

  it('draws a dashed line and a note when the price never changed', () => {
    const flat = series.map((s) => ({ ...s, price: s.price === null ? null : 1.5 }));
    const svg = priceChartSvg(flat, [flat[0]!, flat[6]!]).value;
    expect(svg).toContain('stroke-dasharray="4,3"');
    expect(svg).toContain('grafica-nota');
  });
});

/** Minimal fake of the Leaflet API used by stationMarkers. */
function fakeLeaflet() {
  const log: string[] = [];
  const layer = {
    markers: new Set<FakeMarker>(),
    addTo() {
      return this;
    },
    clearLayers() {
      this.markers.clear();
      return this;
    },
    removeLayer(m: FakeMarker) {
      this.markers.delete(m);
      log.push('remove');
      return this;
    },
  };
  class FakeMarker {
    popup = '';
    icon: unknown;
    opened = false;
    constructor(
      readonly position: readonly [number, number],
      options?: { icon?: unknown },
    ) {
      this.icon = options?.icon;
      log.push('create');
    }
    bindPopup(p: string) {
      this.popup = p;
      return this;
    }
    setPopupContent(p: string) {
      this.popup = p;
      log.push('setPopup');
      return this;
    }
    setIcon(i: unknown) {
      this.icon = i;
      log.push('setIcon');
      return this;
    }
    openPopup() {
      this.opened = true;
      return this;
    }
    addTo(target: typeof layer) {
      target.markers.add(this);
      return this;
    }
  }
  const L = {
    marker: (pos: readonly [number, number], opts?: { icon?: unknown }) => new FakeMarker(pos, opts),
    divIcon: (o: { html?: string }) => ({ html: o.html }),
  } as unknown as LeafletStatic;
  return { L, layer, log };
}

describe('createStationMarkers', () => {
  const ctx = { fuel: 'GASOLINA_95' as const, car: null, hasRoute: false };
  const stations = [1.5, 1.6, 1.7].map((p, i) => branded(`s${i}`, { prices: prices({ GASOLINA_95: p }) }));

  it('adds, updates and removes only what changed', () => {
    const { L, layer, log } = fakeLeaflet();
    const markers = createStationMarkers(L, layer as never);

    markers.update(visible(stations), ctx);
    expect(log).toEqual(['create', 'create', 'create']);
    expect(markers.size()).toBe(3);

    log.length = 0;
    markers.update(visible(stations), ctx); // same data → nothing to do
    expect(log).toEqual([]);

    log.length = 0;
    markers.update(visible(stations.slice(0, 2)), ctx); // s2 leaves; s1 becomes the worst (red)
    expect(log.filter((l) => l === 'remove')).toHaveLength(1);
    expect(log.filter((l) => l === 'create')).toHaveLength(0);
    expect(log).toContain('setIcon');
    expect(markers.size()).toBe(2);
    expect(layer.markers.size).toBe(2);
  });

  it('opens a station’s popup', () => {
    const { L, layer } = fakeLeaflet();
    const markers = createStationMarkers(L, layer as never);
    markers.update(visible(stations), ctx);
    markers.open('s1');
    expect([...layer.markers].filter((m) => m.opened)).toHaveLength(1);
  });
});
