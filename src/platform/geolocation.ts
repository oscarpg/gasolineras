import type { LatLng } from '../domain/types';

/**
 * Where the device is. The browser implementation wraps `navigator.geolocation`;
 * a Capacitor implementation can replace it in the mobile apps.
 */
export interface GeoProvider {
  isAvailable(): boolean;
  /** Rejects with an Error whose message explains the failure (permission denied, timeout…). */
  getCurrentPosition(): Promise<LatLng>;
}

export function browserGeoProvider(
  geolocation: Geolocation | undefined = globalThis.navigator?.geolocation,
): GeoProvider {
  return {
    isAvailable: () => !!geolocation,
    getCurrentPosition: () =>
      new Promise((resolve, reject) => {
        if (!geolocation) {
          reject(new Error('Geolocation not available'));
          return;
        }
        geolocation.getCurrentPosition(
          (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
          (err) => reject(new Error(err.message)),
        );
      }),
  };
}
