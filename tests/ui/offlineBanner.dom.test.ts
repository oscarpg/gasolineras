// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { bindOfflineBanner } from '../../src/ui/offlineBanner';

describe('offline banner', () => {
  it('shows while offline and hides when the connection comes back', () => {
    const banner = document.createElement('div');
    const win = Object.assign(new EventTarget(), { navigator: { onLine: false } });
    bindOfflineBanner(banner, win as never);
    expect(banner.hidden).toBe(false);

    win.navigator.onLine = true;
    win.dispatchEvent(new Event('online'));
    expect(banner.hidden).toBe(true);

    win.navigator.onLine = false;
    win.dispatchEvent(new Event('offline'));
    expect(banner.hidden).toBe(false);
  });
});
