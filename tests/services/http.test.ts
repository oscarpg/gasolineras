import { describe, expect, it } from 'vitest';
import {
  corsFallbackAttempts,
  createHttpClient,
  fetchWithFallback,
  HttpError,
} from '../../src/services/http';
import { fakeFetch } from '../helpers';

const TARGET = 'https://example.test/data';

describe('createHttpClient', () => {
  it('returns the body of a 2xx response', async () => {
    const http = createHttpClient({ fetchFn: fakeFetch({ [TARGET]: { ok: 1 } }) });
    expect(await http.getJson(TARGET)).toEqual({ ok: 1 });
    expect(await http.getText(TARGET)).toBe('{"ok":1}');
  });

  it('throws HttpError on non-2xx, unless allowHttpErrors is set', async () => {
    const fetchFn = fakeFetch({ [TARGET]: () => new Response('{"code":"NoRoute"}', { status: 400 }) });
    const http = createHttpClient({ fetchFn });
    await expect(http.getText(TARGET)).rejects.toThrow('HTTP 400');
    expect(await http.getJson(TARGET, { allowHttpErrors: true })).toEqual({ code: 'NoRoute' });
    try {
      await http.getText(TARGET);
    } catch (e) {
      expect(e instanceof HttpError && e.status === 400).toBe(true);
    }
  });

  it('aborts after the timeout', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    const http = createHttpClient({ fetchFn: hanging, timeoutMs: 20 });
    await expect(http.getText(TARGET)).rejects.toThrow('Timeout after 20 ms');
  });
});

describe('fetchWithFallback + corsFallbackAttempts', () => {
  const quiet = () => {};

  it('uses the direct request when it works, asking for JSON first', async () => {
    const fetchFn = fakeFetch({ [TARGET]: '{"a":1}' });
    const http = createHttpClient({ fetchFn });
    const result = await fetchWithFallback(TARGET, JSON.parse, corsFallbackAttempts(http), quiet);
    expect(result).toEqual({ a: 1 });
    expect(fetchFn.calls).toHaveLength(1);
    expect(new Headers(fetchFn.calls[0]!.init?.headers).get('Accept')).toBe('application/json');
  });

  it('falls back to the allorigins relay, then codetabs', async () => {
    const blocked = () => Promise.reject(new TypeError('CORS'));
    const viaAllOrigins = fakeFetch({
      'allorigins.win': { contents: '{"via":"allorigins"}' },
      [TARGET]: blocked,
    });
    const r1 = await fetchWithFallback(
      TARGET,
      JSON.parse,
      corsFallbackAttempts(createHttpClient({ fetchFn: viaAllOrigins })),
      quiet,
    );
    expect(r1).toEqual({ via: 'allorigins' });
    expect(viaAllOrigins.calls.map((c) => c.url.includes('allorigins'))).toEqual([false, false, true]);

    const viaCodeTabs = fakeFetch({
      'allorigins.win': () => new Response('', { status: 500 }),
      'codetabs.com': '{"via":"codetabs"}',
      [TARGET]: blocked,
    });
    const r2 = await fetchWithFallback(
      TARGET,
      JSON.parse,
      corsFallbackAttempts(createHttpClient({ fetchFn: viaCodeTabs })),
      quiet,
    );
    expect(r2).toEqual({ via: 'codetabs' });
  });

  it('moves on when a body is empty or cannot be parsed', async () => {
    const failures: string[] = [];
    const attempts = [async () => '   ', async () => '<html>error page</html>', async () => '{"ok":true}'];
    const result = await fetchWithFallback(TARGET, JSON.parse, attempts, (m) => failures.push(m));
    expect(result).toEqual({ ok: true });
    expect(failures).toHaveLength(2);
    expect(failures[0]).toBe('Respuesta vacía');
  });

  it('fails with a clear message when every attempt fails', async () => {
    const attempts = [async () => Promise.reject(new Error('x')), async () => ''];
    await expect(fetchWithFallback(TARGET, JSON.parse, attempts, quiet)).rejects.toThrow(
      'No se pudo descargar la información de las gasolineras.',
    );
  });
});
