import { describe, expect, it } from 'vitest';
import { createMapView } from '../../src/ui/map/mapView';
import { fakeLeaflet } from './fakes';

describe('createMapView', () => {
  it('starts centred on Spain and moves to the user position with one origin marker', () => {
    const { L, map, log } = fakeLeaflet();
    const view = createMapView('map', L);
    expect(map.view).toEqual({ center: [40.4168, -3.7038], zoom: 6 });

    view.showUserPosition([40.3, -3.7], 13);
    view.showUserPosition([40.5, -3.6], 12);
    expect(map.view).toEqual({ center: [40.5, -3.6], zoom: 12 });
    expect(log.filter((l) => l.startsWith('open'))).toHaveLength(2);
    expect(log[1]).toContain('Tu ubicación');
  });

  it('draws, fits and clears the route; focuses a station', () => {
    const { L, map } = fakeLeaflet();
    const view = createMapView('map', L);
    view.showRoute([
      [40, -3],
      [41, -4],
    ]);
    expect(map.bounds).toEqual({
      points: [
        [40, -3],
        [41, -4],
      ],
    });
    view.clearRoute();
    view.focus([40.1, -3.1], 15);
    expect(map.view).toEqual({ center: [40.1, -3.1], zoom: 15 });
  });
});
