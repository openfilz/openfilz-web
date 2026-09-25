import { dragAutoScrollStep, intersectRects, ViewportRect } from './signature-geometry';

/**
 * Drag auto-scroll of the request-signature dialog body while a palette field is dragged.
 * Only jasmine/vitest-common matchers, so it runs with `npx vitest run <this file> --globals`.
 */
describe('dragAutoScrollStep', () => {
  // Dialog body from y=100 to y=600; the page shows its top strip at y=540..600 (desktop layout).
  const scroller: ViewportRect = { top: 100, bottom: 600, left: 0, right: 1000 };
  const visiblePage: ViewportRect = { top: 540, bottom: 600, left: 500, right: 980 };
  const startY = 300; // palette chip

  it('never scrolls while the pointer is over the visible page, even in the edge band', () => {
    expect(dragAutoScrollStep({ x: 700, y: 590 }, startY, scroller, visiblePage)).toBe(0);
    expect(dragAutoScrollStep({ x: 700, y: 570 }, startY, scroller, visiblePage)).toBe(0);
  });

  it('scrolls down in the bottom band beside the page, or past the bottom edge', () => {
    expect(dragAutoScrollStep({ x: 200, y: 590 }, startY, scroller, visiblePage)).toBeGreaterThan(0);
    expect(dragAutoScrollStep({ x: 700, y: 620 }, startY, scroller, visiblePage)).toBeGreaterThan(0);
  });

  it('scrolls down to reach a page below the fold (stacked layout)', () => {
    expect(dragAutoScrollStep({ x: 200, y: 590 }, startY, scroller, null)).toBeGreaterThan(0);
  });

  it('does not scroll outside the edge bands', () => {
    expect(dragAutoScrollStep({ x: 200, y: 400 }, startY, scroller, null)).toBe(0);
  });

  it('only scrolls the way the pointer travelled from the drag start', () => {
    // Chip grabbed in the top band of a scrolled body: dragging it down must not scroll up.
    expect(dragAutoScrollStep({ x: 200, y: 125 }, 110, scroller, null)).toBe(0);
    expect(dragAutoScrollStep({ x: 200, y: 105 }, 110, scroller, null)).toBeLessThan(0);
    // Chip in the bottom band: moving up out of it must not scroll down.
    expect(dragAutoScrollStep({ x: 200, y: 575 }, 580, scroller, null)).toBe(0);
  });
});

describe('intersectRects', () => {
  it('clips the page to what the stage and scroller show', () => {
    expect(intersectRects(
      { top: 540, bottom: 1160, left: 500, right: 980 },
      { top: 520, bottom: 900, left: 480, right: 1000 },
      { top: 100, bottom: 600, left: 0, right: 1000 }
    )).toEqual({ top: 540, bottom: 600, left: 500, right: 980 });
  });

  it('is null when the page is scrolled out of view', () => {
    expect(intersectRects({ top: 700, bottom: 900, left: 0, right: 10 }, { top: 100, bottom: 600, left: 0, right: 10 })).toBeNull();
  });
});
