import { BRAND_BADGES } from '../config/brandBadges';
import { html, type SafeHtml } from './dom';

/**
 * The brand's logo on a small white circle, or nothing when the brand has no logo.
 * Decorative (`alt=""`): the station or brand name is always shown next to it.
 */
export function brandLogoHtml(brand: string, size: 'small' | 'large' = 'small'): SafeHtml | '' {
  const logo = BRAND_BADGES[brand]?.logo;
  if (!logo) return '';
  const src = `${import.meta.env.BASE_URL}${logo}`;
  return html`<span class="brand-logo brand-logo--${size}"><img src="${src}" alt="" loading="lazy" decoding="async"></span>`;
}
