/**
 * A horizontally scrolling row of chips. Phones swipe it; with a mouse, the
 * vertical wheel scrolls it sideways and a thin scrollbar shows. Faded edges
 * (classes `can-scroll-left` / `can-scroll-right`) show there is more to see.
 */
export interface ChipRow {
  /** Call after replacing the chips: scrolls the pressed one into view and updates the faded edges. */
  refresh(): void;
}

export function bindChipRow(row: HTMLElement): ChipRow {
  const updateEdges = () => {
    const max = row.scrollWidth - row.clientWidth;
    row.classList.toggle('can-scroll-left', row.scrollLeft > 1);
    row.classList.toggle('can-scroll-right', row.scrollLeft < max - 1);
  };

  row.addEventListener('scroll', updateEdges, { passive: true });
  row.addEventListener(
    'wheel',
    (event) => {
      // Only a mostly vertical wheel on a row that can scroll; trackpad sideways swipes work natively.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (row.scrollWidth <= row.clientWidth) return;
      event.preventDefault();
      row.scrollLeft += event.deltaY;
    },
    { passive: false },
  );
  // The row's width changes with the window (and when the panel is shown).
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateEdges).observe(row);

  return {
    refresh() {
      // Keep the selected chip visible (scrolls the row only, never the page).
      const pressed = row.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (
        pressed &&
        (pressed.offsetLeft < row.scrollLeft ||
          pressed.offsetLeft + pressed.offsetWidth > row.scrollLeft + row.clientWidth)
      ) {
        row.scrollLeft = Math.max(0, pressed.offsetLeft - 24);
      }
      updateEdges();
    },
  };
}
