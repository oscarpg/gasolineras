/**
 * DOM helpers. The important one is `html`: a tagged template that escapes every
 * interpolated value unless it is already SafeHtml, so data from the API or the
 * user can never inject markup.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for use in HTML content and in quoted attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** A string that is known to be safe HTML (built by `html` or explicitly trusted with `raw`). */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/** Marks a string as trusted HTML. Only use it for markup written in this codebase, never for data. */
export const raw = (markup: string): SafeHtml => new SafeHtml(markup);

const render = (value: unknown): string => {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
};

/**
 * Builds HTML from a template, escaping every interpolated value.
 * SafeHtml values (e.g. nested `html` results) are inserted as-is; arrays are joined;
 * `null`, `undefined` and `false` render nothing.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0]!;
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1]!;
  });
  return new SafeHtml(out);
}

/** Replaces an element's content with safe HTML. The only place the UI assigns innerHTML. */
export function setHtml(element: Element, content: SafeHtml): void {
  element.innerHTML = content.value;
}

/** Looks up a required element; fails loudly if index.html and the code disagree. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

/**
 * One listener on `root` for every current and future element matching `selector`
 * (used for lists that are re-rendered, and for Leaflet popups).
 */
export function delegate(
  root: Pick<EventTarget, 'addEventListener'>,
  type: string,
  selector: string,
  handler: (element: HTMLElement, event: Event) => void,
): void {
  root.addEventListener(type, (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const match = target.closest(selector);
    if (match instanceof HTMLElement) handler(match, event);
  });
}

/** Sets a form control's value unless it already has it, or the user is typing in it. */
export function syncValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  if (element.value === value) return;
  const typing =
    element === document.activeElement && element instanceof HTMLInputElement && element.type !== 'range';
  if (!typing) element.value = value;
}

export function syncChecked(element: HTMLInputElement, checked: boolean): void {
  if (element.checked !== checked) element.checked = checked;
}

/** Message of an unknown thrown value. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
