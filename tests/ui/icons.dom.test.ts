// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { handleLogoErrors, stationIcon } from '../../src/ui/map/icons';
import type { LeafletStatic } from '../../src/ui/map/leaflet';

const L = { divIcon: (o: { html: string }) => o } as unknown as LeafletStatic;
const tagHtml = (brand: string) =>
  (stationIcon(L, { brand, price: '1,459', color: 'hsl(120, 82%, 40%)' }) as unknown as { html: string })
    .html;

describe('station tag badge', () => {
  it('shows the logo for brands that have one, and initials for the rest', () => {
    document.body.innerHTML = tagHtml('REPSOL') + tagHtml('PLENOIL');
    const [withLogo, withoutLogo] = [...document.querySelectorAll('.station-tag__logo')];
    expect(withLogo!.classList.contains('has-image')).toBe(true);
    expect(withLogo!.querySelector('img')?.getAttribute('src')).toContain('brands/repsol.png');
    expect(withoutLogo!.querySelector('img')).toBeNull();
    expect(withoutLogo!.textContent).toBe('PL');
  });

  it('falls back to the initials when the logo fails to load', () => {
    document.body.innerHTML = `<div id="map">${tagHtml('REPSOL')}</div>`;
    const map = document.getElementById('map')!;
    handleLogoErrors(map);

    map.querySelector('img')!.dispatchEvent(new Event('error'));

    const badge = map.querySelector('.station-tag__logo')!;
    expect(badge.classList.contains('has-image')).toBe(false);
    expect(badge.querySelector('img')).toBeNull();
    expect(badge.textContent).toBe('RE');
  });
});
