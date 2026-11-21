import { describe, expect, it } from 'vitest';
import {
  createMitecoService,
  decodeXmlTagName,
  parseMitecoText,
  toHistoryPrices,
  toStations,
  type MitecoPayload,
} from '../../src/services/miteco';
import { memoryStorageAdapter } from '../../src/storage/adapter';
import { createCache } from '../../src/storage/cache';
import { rawStation, samplePayload } from '../helpers';

describe('parsing', () => {
  it('decodes escaped XML tag names', () => {
    expect(decodeXmlTagName('R_x00F3_tulo')).toBe('Rótulo');
    expect(decodeXmlTagName('Longitud_x0020__x0028_WGS84_x0029_')).toBe('Longitud (WGS84)');
    expect(decodeXmlTagName('Horario')).toBe('Horario');
  });

  it('parses JSON bodies (XML needs a browser DOMParser and is covered end-to-end)', () => {
    expect(parseMitecoText(JSON.stringify(samplePayload(2))).ListaEESSPrecio).toHaveLength(2);
  });

  it('normalises stations', () => {
    const [s] = toStations(samplePayload(1), '28');
    expect(s).toEqual({
      id: '1000-40,410--3,700',
      code: '1000',
      provinceCode: '28',
      bulletinDate: '21/11/2026',
      name: 'REPSOL',
      address: 'CALLE EJEMPLO 0, MADRID, MADRID',
      lat: 40.41,
      lon: -3.7,
      openingHours: 'L-D: 24H',
      prices: {
        GASOLEO_A: 1.409,
        GASOLEO_PREMIUM: null,
        GASOLINA_95: 1.509,
        GASOLINA_98: 1.659,
        GLP: null,
        GNC: null,
        GNL: null,
      },
    });
  });

  it('drops stations without coordinates and fills in missing fields', () => {
    const payload: MitecoPayload = {
      ListaEESSPrecio: [
        rawStation(0, { Latitud: '' }),
        rawStation(1, { IDEESS: '', Rótulo: '', Horario: '', Localidad: '' }),
      ],
    };
    const stations = toStations(payload, '28', new Date(2026, 10, 21));
    expect(stations).toHaveLength(1);
    expect(stations[0]!.name).toBe('Sin nombre');
    expect(stations[0]!.code).toBe('');
    expect(stations[0]!.address).toBe('CALLE EJEMPLO 1, MADRID');
    expect(stations[0]!.bulletinDate).toBe('21-11-2026'); // no "Fecha" → today
  });

  it('builds history maps with only the fuels each station sold', () => {
    const h = toHistoryPrices(samplePayload(2));
    expect(h['1000']).toEqual({ GASOLEO_A: 1.409, GASOLINA_95: 1.509, GASOLINA_98: 1.659 });
    expect(h['1001']).toEqual({ GASOLINA_95: 1.519, GASOLINA_98: 1.659 });
  });
});

describe('createMitecoService', () => {
  const setup = (body = JSON.stringify(samplePayload(3))) => {
    const urls: string[] = [];
    let date = new Date(2026, 10, 21, 10);
    const service = createMitecoService({
      http: undefined as never,
      cache: createCache(memoryStorageAdapter(), { namespace: 't:' }),
      attempts: [async (url) => (urls.push(url), body)],
      now: () => date,
    });
    return { service, urls, setDate: (d: Date) => (date = d) };
  };

  it('downloads a province once per day', async () => {
    const { service, urls, setDate } = setup();
    expect(service.hasCachedProvince('28')).toBe(false);
    expect(await service.getProvinceStations('28')).toHaveLength(3);
    expect(service.hasCachedProvince('28')).toBe(true);
    await service.getProvinceStations('28');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/EstacionesTerrestres\/FiltroProvincia\/28$/);

    setDate(new Date(2026, 10, 22, 0, 30)); // next local day
    expect(service.hasCachedProvince('28')).toBe(false);
    await service.getProvinceStations('28');
    expect(urls).toHaveLength(2);
  });

  it('re-downloads when forced', async () => {
    const { service, urls } = setup();
    await service.getProvinceStations('28');
    await service.getProvinceStations('28', { force: true });
    expect(urls).toHaveLength(2);
  });

  it('shares one request between concurrent callers', async () => {
    const { service, urls } = setup();
    const [a, b] = await Promise.all([service.getProvinceStations('28'), service.getProvinceStations('28')]);
    expect(a).toBe(b);
    expect(urls).toHaveLength(1);
  });

  it('does not cache an empty province', async () => {
    const { service, urls } = setup(JSON.stringify({ ListaEESSPrecio: [] }));
    await service.getProvinceStations('28');
    await service.getProvinceStations('28');
    expect(urls).toHaveLength(2);
  });

  it('fetches and caches history days', async () => {
    const { service, urls } = setup();
    const day = await service.getHistoryDay('28', '20-11-2026');
    expect(day['1002']).toEqual({ GASOLEO_A: 1.429, GASOLINA_95: 1.529, GASOLINA_98: 1.659 });
    await service.getHistoryDay('28', '20-11-2026');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/EstacionesTerrestresHist\/FiltroProvincia\/20-11-2026\/28$/);
  });
});
