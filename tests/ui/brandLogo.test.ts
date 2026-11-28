import { describe, expect, it } from 'vitest';
import { brandLogoHtml } from '../../src/ui/brandLogo';

describe('brandLogoHtml', () => {
  it('shows the logo for brands that have one', () => {
    const logo = brandLogoHtml('REPSOL');
    expect(logo).not.toBe('');
    expect((logo as { value: string }).value).toContain('brands/repsol.png');
    expect((logo as { value: string }).value).toContain('alt=""');
  });

  it('shows nothing for brands without a logo', () => {
    expect(brandLogoHtml('PLENOIL')).toBe('');
    expect(brandLogoHtml('SIN MARCA')).toBe('');
  });
});
