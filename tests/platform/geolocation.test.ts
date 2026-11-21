import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/domain/errors';
import { browserGeoProvider } from '../../src/platform/geolocation';

/** A Geolocation that answers with a position, or fails with a GeolocationPositionError code. */
const fakeGeolocation = (answer: { lat: number; lon: number } | { code: number }) =>
  ({
    getCurrentPosition(ok: PositionCallback, fail: PositionErrorCallback) {
      if ('code' in answer)
        fail({ code: answer.code, message: `code ${answer.code}` } as GeolocationPositionError);
      else ok({ coords: { latitude: answer.lat, longitude: answer.lon } } as GeolocationPosition);
    },
  }) as unknown as Geolocation;

const errorCode = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (e: unknown) => (e instanceof AppError ? e.code : 'other'),
  );

describe('browserGeoProvider', () => {
  it('resolves [lat, lon]', async () => {
    const gps = browserGeoProvider(fakeGeolocation({ lat: 40.4, lon: -3.7 }));
    expect(gps.isAvailable()).toBe(true);
    expect(await gps.getCurrentPosition()).toEqual([40.4, -3.7]);
  });

  it('maps browser error codes to AppError codes', async () => {
    expect(await errorCode(browserGeoProvider(fakeGeolocation({ code: 1 })).getCurrentPosition())).toBe(
      'geolocation-denied',
    );
    expect(await errorCode(browserGeoProvider(fakeGeolocation({ code: 2 })).getCurrentPosition())).toBe(
      'geolocation-unavailable',
    );
    expect(await errorCode(browserGeoProvider(fakeGeolocation({ code: 3 })).getCurrentPosition())).toBe(
      'geolocation-timeout',
    );
  });

  it('reports unavailable when the browser has no geolocation', async () => {
    const gps = browserGeoProvider(undefined);
    expect(gps.isAvailable()).toBe(false);
    expect(await errorCode(gps.getCurrentPosition())).toBe('geolocation-unavailable');
  });
});
