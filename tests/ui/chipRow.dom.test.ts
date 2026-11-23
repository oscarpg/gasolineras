// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { bindChipRow } from '../../src/ui/chipRow';

/** A row 300 px wide holding 10 chips of 100 px (happy-dom has no layout, so sizes are set by hand). */
function row() {
  const el = document.createElement('div');
  el.innerHTML = Array.from(
    { length: 10 },
    (_, i) => `<button class="chip" aria-pressed="${i === 7}">${i}</button>`,
  ).join('');
  Object.defineProperty(el, 'clientWidth', { value: 300 });
  Object.defineProperty(el, 'scrollWidth', { value: 1000 });
  [...el.children].forEach((chip, i) => {
    Object.defineProperty(chip, 'offsetLeft', { value: i * 100 });
    Object.defineProperty(chip, 'offsetWidth', { value: 100 });
  });
  document.body.append(el);
  return el;
}

describe('chip rows', () => {
  it('scroll the pressed chip into view and fade the edges with more chips', () => {
    const el = row();
    const r = bindChipRow(el);
    r.refresh();
    expect(el.scrollLeft).toBe(676); // chip 7 (700–800) visible, with a little room on its left
    expect(el.classList.contains('can-scroll-left')).toBe(true);
    expect(el.classList.contains('can-scroll-right')).toBe(true);

    el.scrollLeft = 0;
    el.dispatchEvent(new Event('scroll'));
    expect(el.classList.contains('can-scroll-left')).toBe(false);
  });

  it('turn a vertical mouse wheel into sideways scrolling, but leave sideways swipes alone', () => {
    const el = row();
    bindChipRow(el);
    const wheel = new WheelEvent('wheel', { deltaY: 120, cancelable: true });
    el.dispatchEvent(wheel);
    expect(el.scrollLeft).toBe(120);
    expect(wheel.defaultPrevented).toBe(true);

    const sideways = new WheelEvent('wheel', { deltaX: 50, deltaY: 10, cancelable: true });
    el.dispatchEvent(sideways);
    expect(sideways.defaultPrevented).toBe(false);
    expect(el.scrollLeft).toBe(120);
  });
});
