/** Shared test helpers: a scriptable fake `fetch` and a small MITECO-shaped sample. */

export type FakeRoute = (url: string, init?: RequestInit) => Response | Promise<Response>;

/**
 * A fake `fetch` that answers by URL substring. Records every call.
 * Unmatched URLs reject like a network error.
 */
export function fakeFetch(routes: Record<string, FakeRoute | Response | string | object>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    for (const [pattern, handler] of Object.entries(routes)) {
      if (!url.includes(pattern)) continue;
      if (typeof handler === 'function') return (handler as FakeRoute)(url, init);
      if (handler instanceof Response) return handler.clone();
      if (typeof handler === 'string') return new Response(handler);
      return new Response(JSON.stringify(handler), { headers: { 'Content-Type': 'application/json' } });
    }
    throw new TypeError(`Failed to fetch ${url}`);
  };
  return Object.assign(fn as typeof fetch, { calls });
}

/** A station in MITECO's raw format (Spanish fields, decimal commas). */
export function rawStation(i: number, overrides: Record<string, string> = {}) {
  return {
    IDEESS: String(1000 + i),
    Rótulo: ['REPSOL', 'CEPSA', 'BALLENOIL'][i % 3]!,
    Dirección: `CALLE EJEMPLO ${i}`,
    Localidad: 'MADRID',
    Provincia: 'MADRID',
    Latitud: `40,41${i}`,
    'Longitud (WGS84)': `-3,70${i}`,
    Horario: 'L-D: 24H',
    'Precio Gasolina 95 E5': `1,5${i}9`,
    'Precio Gasoleo A': i % 2 ? '' : `1,4${i}9`,
    'Precio Gasolina 98 E5': '1,659',
    'Precio Gasoleo Premium': '',
    'Precio Gases licuados del petróleo': '',
    'Precio Gas natural comprimido': '',
    'Precio Gas natural licuado': '',
    ...overrides,
  };
}

export const samplePayload = (count = 3) => ({
  Fecha: '21/11/2026 9:05:12',
  ListaEESSPrecio: Array.from({ length: count }, (_, i) => rawStation(i)),
  Nota: 'Archivo de todos los productos en todas las estaciones de servicio.',
  ResultadoConsulta: 'OK',
});
