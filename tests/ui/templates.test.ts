import { describe, expect, it } from 'vitest';
import { selectVisibleStations } from '../../src/domain/filters';
import type { BrandedStation } from '../../src/domain/types';
import {
  directionsLinkHtml,
  favouriteButtonHtml,
  stationCardHtml,
  stationCardLabel,
} from '../../src/ui/components/stationCard';
import { priceChartSvg } from '../../src/ui/components/priceChart';
import { escapeHtml, html, raw, SafeHtml } from '../../src/ui/dom';
import { brandInitials } from '../../src/ui/map/icons';
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
    sortByDistance: false,
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
    const out = stationPopupHtml(row!, {
      fuel: 'GASOLINA_95',
      car,
      hasRoute: false,
      favourites: new Set(),
    }).value;
    for (const bad of ['<img', '<script', '<b>24H', '<u>León', `data-code="1'2"`, `data-station="id"1"`]) {
      expect(out).not.toContain(bad);
    }
    expect(out).toContain('&lt;img src=x');
    expect(out).toContain('data-code="1&#39;2"');
    expect(out).toContain('data-action="price-history"');
    expect(out).toContain('-5 cts/l');
    expect(out).toContain('aria-label="Añadir &lt;img');
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
    const popup = stationPopupHtml(row!, {
      fuel: 'GASOLINA_95',
      car: null,
      hasRoute: true,
      favourites: new Set(),
    }).value;
    expect(popup).toContain('🛣️ Desvío de ruta: 0,0 km (0,0 km i/v)');
    expect(stationCardHtml(row!, 4, { car: null, hasRoute: true, sortedByTotalCost: false }).value).toContain(
      '5. REPSOL',
    );
  });

  it('omits the history button for stations without a MITECO code', () => {
    const [row] = visible([branded('a', { code: '' })]);
    expect(
      stationPopupHtml(row!, { fuel: 'GASOLINA_95', car: null, hasRoute: false, favourites: new Set() })
        .value,
    ).not.toContain('price-history');
  });

  it('the popup lists every fuel sold, the selected one marked, plus directions and share', () => {
    const [row] = visible([
      branded('a', {
        lat: 40.41,
        lon: -3.69,
        prices: prices({ GASOLINA_95: 1.5, GASOLEO_A: 1.4, GLP: 0.9 }),
      }),
    ]);
    const out = stationPopupHtml(row!, {
      fuel: 'GASOLINA_95',
      car: null,
      hasRoute: false,
      favourites: new Set(),
    }).value;
    expect(out).toContain('Todos los precios');
    expect(out.match(/<tr/g)).toHaveLength(3);
    expect(out).toMatch(/<tr class="is-selected"><th scope="row">Gasolina 95<\/th><td>1,500 €\/l/);
    expect(out).toContain('<td>0,900 €/l</td>');
    expect(out).toContain('href="https://www.google.com/maps/dir/?api=1&amp;destination=40.41,-3.69"');
    expect(out).toContain('rel="noopener"');
    expect(out).toContain('data-action="share" data-station="a"');
    expect(out).toContain('d="M18,16.08'); // Material "share" icon
    expect(out).not.toMatch(/🧭|⤴/);

    const [single] = visible([branded('b')]);
    expect(
      stationPopupHtml(single!, { fuel: 'GASOLINA_95', car: null, hasRoute: false, favourites: new Set() })
        .value,
    ).not.toContain('popup-fuels'); // only one fuel: no table
  });

  it('cards read as one sentence and have a directions link', () => {
    const [row] = visible([branded('a', { lat: 40.4 + 2 / 111.32, prices: prices({ GASOLINA_95: 1.5 }) })]);
    const ctx = { car: null, hasRoute: false, sortedByTotalCost: false };
    expect(stationCardLabel(row!, 2, ctx, false)).toBe('3. REPSOL, 1,500 €/l, a 2,0 km');
    expect(stationCardLabel(row!, 0, ctx, true)).toBe('1. REPSOL, 1,500 €/l, a 2,0 km, favorita');
    const car = { id: 'c', name: 'C', fuel: 'GASOLINA_95' as const, tankLitres: 50, consumptionL100km: 6 };
    const [withCar] = visible([branded('a', { lat: 40.4 + 2 / 111.32 })], { car });
    expect(stationCardLabel(withCar!, 0, { car, hasRoute: false, sortedByTotalCost: true }, false)).toMatch(
      /^1\. REPSOL, \d+,\d\d €, a 2,0 km$/,
    );
    expect(directionsLinkHtml(row!.station).value).toContain('aria-label="Cómo llegar a REPSOL"');
    // The Android app's Material "directions" icon, not an emoji.
    expect(directionsLinkHtml(row!.station).value).toContain('<svg class="icon"');
    expect(directionsLinkHtml(row!.station).value).toContain('d="M21.71,11.29');
  });

  it('the heart shows whether the station is a favourite', () => {
    const [row] = visible([branded('a')]);
    const off = stationPopupHtml(row!, {
      fuel: 'GASOLINA_95',
      car: null,
      hasRoute: false,
      favourites: new Set(),
    });
    expect(off.value).toContain('aria-pressed="false"');
    expect(off.value).toContain('aria-label="Añadir REPSOL a favoritas"');
    const on = favouriteButtonHtml(row!.station, true).value;
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('aria-label="Quitar REPSOL de favoritas"');
    expect(on).toContain('data-station="a"');
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
    expect(svg).not.toContain('price-chart-note');
  });

  it('draws a dashed line and a note when the price never changed', () => {
    const flat = series.map((s) => ({ ...s, price: s.price === null ? null : 1.5 }));
    const svg = priceChartSvg(flat, [flat[0]!, flat[6]!]).value;
    expect(svg).toContain('stroke-dasharray="4,3"');
    expect(svg).toContain('price-chart-note');
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
    content: string | (() => string) = '';
    icon: unknown;
    opened = false;
    /** HTML Leaflet would show: the content function runs when the popup opens or updates. */
    shown = '';
    constructor(
      readonly position: readonly [number, number],
      options?: { icon?: unknown; zIndexOffset?: number },
    ) {
      this.icon = options?.icon;
      this.zIndexOffset = options?.zIndexOffset ?? 0;
      log.push('create');
    }
    bindPopup(p: string | (() => string)) {
      this.content = p;
      return this;
    }
    private evaluate() {
      this.shown = typeof this.content === 'function' ? this.content() : this.content;
      log.push('buildPopup');
    }
    isPopupOpen() {
      return this.opened;
    }
    getPopup() {
      return { update: () => this.evaluate() };
    }
    setIcon(i: unknown) {
      this.icon = i;
      log.push('setIcon');
      return this;
    }
    zIndexOffset = 0;
    setZIndexOffset(z: number) {
      this.zIndexOffset = z;
      return this;
    }
    openPopup() {
      this.opened = true;
      this.evaluate();
      return this;
    }
    addTo(target: typeof layer) {
      target.markers.add(this);
      return this;
    }
  }
  const L = {
    marker: (pos: readonly [number, number], opts?: { icon?: unknown }) => new FakeMarker(pos, opts),
    divIcon: (o: { html?: string; className?: string; iconSize?: [number, number] }) => ({
      html: o.html,
      className: o.className,
      iconSize: o.iconSize,
    }),
  } as unknown as LeafletStatic;
  return { L, layer, log };
}

describe('station marker decluttering', () => {
  // 0.001° ≈ 10 px: stations 0.0001° apart overlap, 0.05° apart don't.
  const project = ([lat, lon]: readonly [number, number]) => ({ x: lon * 10000, y: -lat * 10000 });
  const ctx = { fuel: 'GASOLINA_95' as const, car: null, hasRoute: false, favourites: new Set<string>() };
  const classes = (layer: { markers: Set<unknown> }) =>
    new Map(
      [...layer.markers].map((m) => {
        const marker = m as unknown as { position: [number, number]; icon: { className: string } };
        return [marker.position.join(), marker.icon.className];
      }),
    );

  it('shrinks to a dot a tag that would overlap a cheaper one, and lets the selected one win', () => {
    const { L, layer } = fakeLeaflet();
    const markers = createStationMarkers(L, layer as never);
    const rows = visible([
      branded('cheap', { lat: 40.4, lon: -3.7, prices: prices({ GASOLINA_95: 1.4 }) }),
      branded('dear', { lat: 40.4001, lon: -3.7001, prices: prices({ GASOLINA_95: 1.6 }) }),
      branded('far', { lat: 40.45, lon: -3.65, prices: prices({ GASOLINA_95: 1.7 }) }),
    ]);
    markers.update(rows, ctx);
    markers.declutter(project);
    let c = classes(layer);
    expect(c.get('40.4,-3.7')).not.toContain('is-compact');
    expect(c.get('40.4001,-3.7001')).toContain('is-compact');
    expect(c.get('40.45,-3.65')).not.toContain('is-compact');

    markers.select('dear');
    c = classes(layer);
    expect(c.get('40.4001,-3.7001')).not.toContain('is-compact');
    expect(c.get('40.4,-3.7')).toContain('is-compact');
  });
});

describe('brandInitials', () => {
  it('uses up to two letters, or one per word', () => {
    expect(brandInitials('REPSOL')).toBe('RE');
    expect(brandInitials('GAS EXPRESS')).toBe('GE');
    expect(brandInitials('Q8')).toBe('Q8');
    expect(brandInitials('SIN MARCA')).toBe('');
  });
});

describe('createStationMarkers', () => {
  const ctx = { fuel: 'GASOLINA_95' as const, car: null, hasRoute: false, favourites: new Set<string>() };
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

  it('highlights the selected station until another is picked, also across updates', () => {
    const { L, layer } = fakeLeaflet();
    const markers = createStationMarkers(L, layer as never);
    markers.update(visible(stations), ctx);
    const all = () =>
      [...layer.markers] as unknown as { icon: { className: string }; zIndexOffset: number }[];

    markers.select('s1');
    expect(all().map((m) => m.icon.className.includes('is-selected'))).toEqual([false, true, false]);
    expect(all().map((m) => m.zIndexOffset)).toEqual([0, 1000, 0]);

    markers.select('s2');
    expect(all().map((m) => m.icon.className.includes('is-selected'))).toEqual([false, false, true]);
    expect(all().map((m) => m.zIndexOffset)).toEqual([0, 0, 1000]);

    // s2 leaves and comes back: still highlighted. A colour change keeps the highlight too.
    markers.update(visible(stations.slice(0, 2)), ctx);
    markers.update(visible(stations), ctx);
    expect(all().at(-1)!.icon.className).toContain('is-selected');
    expect(all().at(-1)!.zIndexOffset).toBe(1000);

    markers.select(null);
    expect(all().some((m) => m.icon.className.includes('is-selected'))).toBe(false);
  });

  it('touch screens get extra tap padding around the tag', () => {
    const { L, layer } = fakeLeaflet();
    createStationMarkers(L, layer as never, { touch: true }).update(visible(stations), ctx);
    const icon = ([...layer.markers][0] as unknown as { icon: { className: string } }).icon;
    expect(icon.className).toContain('is-touch');
  });

  it('draws a tag with the brand badge and the price, redrawn when the price changes', () => {
    const { L, layer, log } = fakeLeaflet();
    const markers = createStationMarkers(L, layer as never);
    const repsol = branded('r', { brand: 'REPSOL', prices: prices({ GASOLINA_95: 1.459 }) });
    markers.update(visible([repsol]), ctx);
    const icon = () => ([...layer.markers][0] as unknown as { icon: { html: string } }).icon.html;
    expect(icon()).toContain('station-tag');
    expect(icon()).toContain('>RE<');
    expect(icon()).toContain('1,459');

    log.length = 0;
    markers.update(visible([{ ...repsol, prices: prices({ GASOLINA_95: 1.479 }) }]), ctx);
    expect(log).toContain('setIcon');
    expect(icon()).toContain('1,479');
  });

  it('escapes the brand in the tag', () => {
    const { L, layer } = fakeLeaflet();
    createStationMarkers(L, layer as never).update(
      visible([branded('x', { brand: EVIL, prices: prices({ GASOLINA_95: 1.5 }) })]),
      ctx,
    );
    const icon = ([...layer.markers][0] as unknown as { icon: { html: string } }).icon;
    expect(icon.html).not.toContain('<img');
  });

  it('opens a station’s popup', () => {
    const { L, layer } = fakeLeaflet();
    const markers = createStationMarkers(L, layer as never);
    markers.update(visible(stations), ctx);
    markers.open('s1');
    const opened = [...layer.markers].filter((m) => m.opened);
    expect(opened).toHaveLength(1);
    expect(opened[0]!.shown).toContain('Gasolina 95');
  });

  it('builds popup HTML only when a popup opens, and refreshes an open popup only if it changed', () => {
    const { L, layer, log } = fakeLeaflet();
    const markers = createStationMarkers(L, layer as never);
    markers.update(visible(stations), ctx);
    expect(log).not.toContain('buildPopup'); // nothing built for closed popups

    markers.open('s0');
    const marker = [...layer.markers].find((m) => m.opened)!;
    const before = marker.shown;

    log.length = 0;
    markers.update(visible(stations), ctx); // same content → no rebuild
    expect(log).toEqual([]);

    markers.update(visible(stations), { ...ctx, fuel: 'GASOLEO_A' }); // content changes → open popup refreshed
    expect(log).toContain('buildPopup');
    expect(marker.shown).not.toBe(before);

    log.length = 0;
    markers.update(visible(stations), { ...ctx, favourites: new Set(['s0']) }); // heart toggled → refreshed
    expect(log).toContain('buildPopup');
    expect(marker.shown).toContain('aria-pressed="true"');
  });
});
