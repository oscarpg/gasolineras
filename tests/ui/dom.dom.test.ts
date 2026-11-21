// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { byId, delegate, html, setHtml, syncChecked, syncValue } from '../../src/ui/dom';
import { createToaster } from '../../src/ui/toast';

describe('DOM helpers', () => {
  it('setHtml inserts escaped data; byId fails loudly for missing elements', () => {
    document.body.innerHTML = '<div id="box"></div>';
    setHtml(byId('box'), html`<b>${'<i>x</i>'}</b>`);
    expect(byId('box').innerHTML).toBe('<b>&lt;i&gt;x&lt;/i&gt;</b>');
    expect(() => byId('nope')).toThrow('Missing element #nope');
  });

  it('delegate handles clicks on matching descendants, including ones added later', () => {
    document.body.innerHTML = '<ul id="list"></ul>';
    const seen: string[] = [];
    delegate(byId('list'), 'click', '[data-id]', (el) => seen.push(el.dataset.id!));
    setHtml(byId('list'), html`<li data-id="a"><span>A</span></li><li>no id</li>`);
    byId('list').querySelector('span')!.click();
    byId('list').querySelectorAll('li')[1]!.click();
    expect(seen).toEqual(['a']);
  });

  it('syncValue leaves a text field alone while the user types in it; syncChecked sets checkboxes', () => {
    document.body.innerHTML =
      '<input id="t" type="text"><input id="r" type="range" min="0" max="50"><input id="c" type="checkbox">';
    const text = byId<HTMLInputElement>('t');
    syncValue(text, 'a');
    expect(text.value).toBe('a');
    text.focus();
    syncValue(text, 'b');
    expect(text.value).toBe('a');

    const range = byId<HTMLInputElement>('r');
    range.focus();
    syncValue(range, '20');
    expect(range.value).toBe('20'); // sliders always follow the state

    syncChecked(byId<HTMLInputElement>('c'), true);
    expect(byId<HTMLInputElement>('c').checked).toBe(true);
  });
});

describe('createToaster', () => {
  it('shows one toast at a time and hides it after the duration', async () => {
    document.body.innerHTML = '';
    const toast = createToaster();
    toast.show('first', { durationMs: 10 });
    toast.show('second', { durationMs: 10 });
    const elements = document.querySelectorAll<HTMLElement>('.toast');
    expect(elements).toHaveLength(1);
    expect(elements[0]!.textContent).toBe('second');
    expect(elements[0]!.getAttribute('role')).toBe('alert');
    await new Promise((r) => setTimeout(r, 30));
    expect(elements[0]!.hidden).toBe(true);
  });
});
