import { describe, expect, it } from 'vitest';
import { boundsAround, createMapView } from '../../src/ui/map/mapView';
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

describe('fitting points', () => {
  it('pads a single point to a minimum span and caps the zoom', () => {
    expect(boundsAround([[40, -3]])).toEqual([
      [39.9975, -3.0025],
      [40.0025, -2.9975],
    ]);
    const box = boundsAround([
      [40, -3],
      [41, -4],
    ]);
    expect(box).toEqual([
      [40, -4],
      [41, -3],
    ]);
  });

  it('fitPoints keeps the points clear of a bottom panel; no points, no move', () => {
    const { L, map } = fakeLeaflet();
    const view = createMapView('map', L);
    view.fitPoints([]);
    expect(map.fits).toBe(0);
    view.fitPoints(
      [
        [40, -3],
        [41, -4],
      ],
      { bottomPadding: 200 },
    );
    expect(map.fitOptions).toEqual({ paddingTopLeft: [40, 40], paddingBottomRight: [40, 240], maxZoom: 15 });
  });
});
