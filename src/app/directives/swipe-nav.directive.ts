import { Directionality } from '@angular/cdk/bidi';
import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, input, output } from '@angular/core';

/** Horizontal travel (px) a flick needs before it counts as a swipe. */
const MIN_DISTANCE = 50;
/** Horizontal travel must beat vertical travel by this ratio, so vertical scrolling never switches. */
const DIRECTION_RATIO = 1.4;
/** A swipe slower than this (ms) is a drag or a selection, not a flick. */
const MAX_DURATION = 700;
/** Controls that consume horizontal drags themselves; add `data-no-swipe` to opt any element out. */
const SELF_HANDLED_CONTROLS =
  'input, textarea, select, canvas, [contenteditable=""], [contenteditable="true"], mat-slider, [data-no-swipe]';

/**
 * Swipe navigation for hand-made tab strips (a `role="tablist"` of buttons plus the content they
 * switch) — the counterpart of `appSwipeTabs` for `mat-tab-group`. Put it on the element that
 * holds both the strip and the content; a horizontal flick anywhere inside emits `swipeNext`
 * or `swipePrev` (reading direction aware: in RTL a flick to the right goes to the next tab),
 * and the host component moves its selection.
 *
 * ```html
 * <div appSwipeNav (swipeNext)="select(index + 1)" (swipePrev)="select(index - 1)">…</div>
 * ```
 *
 * Nested in a `mat-tab-group appSwipeTabs`, these inner tabs win; once they are on their first
 * or last tab (`swipeNavCanPrev` / `swipeNavCanNext` false) the flick goes to the outer tabs.
 *
 * Content that scrolls sideways (a scrollable tab strip, a wide table, a code block) keeps
 * the gesture: a flick that scrolled it does not switch tabs; once it is at its edge, it does.
 */
@Directive({
  selector: '[appSwipeNav]',
  standalone: true,
  // Horizontal gestures belong to the tabs, or the browser takes a sideways flick for its
  // "back" gesture. Scrollers inside (a code block, a scrollable strip) still pan sideways.
  host: {
    '[style.touch-action]': '"pan-y"',
    // Read by appSwipeTabs: an outer tab group leaves a flick alone when these tabs can take it
    'data-swipe-nav': '',
    '[attr.data-swipe-next]': 'swipeNavCanNext() ? "" : null',
    '[attr.data-swipe-prev]': 'swipeNavCanPrev() ? "" : null'
  }
})
export class SwipeNavDirective implements OnInit, OnDestroy {
  readonly swipeNext = output<void>();
  readonly swipePrev = output<void>();
  /** Whether there is a next tab; when false the flick is left to an outer tab group. */
  readonly swipeNavCanNext = input(true);
  /** Whether there is a previous tab; when false the flick is left to an outer tab group. */
  readonly swipeNavCanPrev = input(true);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly directionality = inject(Directionality, { optional: true });

  private start: { x: number; y: number; time: number; scrollers: [HTMLElement, number][] } | null = null;

  ngOnInit(): void {
    const el = this.host.nativeElement;
    this.zone.runOutsideAngular(() => {
      el.addEventListener('touchstart', this.onTouchStart, { passive: true });
      el.addEventListener('touchend', this.onTouchEnd, { passive: true });
      el.addEventListener('touchcancel', this.onTouchCancel, { passive: true });
    });
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchend', this.onTouchEnd);
    el.removeEventListener('touchcancel', this.onTouchCancel);
  }

  private readonly onTouchStart = (event: TouchEvent): void => {
    this.start = null;
    const target = event.target as HTMLElement | null;
    if (event.touches.length !== 1 || target?.closest(SELF_HANDLED_CONTROLS)) {
      return;
    }
    const touch = event.touches[0];
    this.start = { x: touch.clientX, y: touch.clientY, time: event.timeStamp, scrollers: this.sidewaysScrollers(target) };
  };

  private readonly onTouchEnd = (event: TouchEvent): void => {
    const start = this.start;
    this.start = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || event.timeStamp - start.time > MAX_DURATION) {
      return;
    }
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < MIN_DISTANCE || Math.abs(deltaX) < Math.abs(deltaY) * DIRECTION_RATIO) {
      return;
    }
    // The flick scrolled something sideways: it was a scroll, not a tab swipe.
    if (start.scrollers.some(([node, left]) => Math.abs(node.scrollLeft - left) > 1)) {
      return;
    }
    // Finger moving left = next tab in LTR, previous tab in RTL.
    const next = (deltaX < 0) !== (this.directionality?.value === 'rtl');
    if (next ? !this.swipeNavCanNext() : !this.swipeNavCanPrev()) {
      return;
    }
    this.zone.run(() => (next ? this.swipeNext.emit() : this.swipePrev.emit()));
  };

  private readonly onTouchCancel = (): void => {
    this.start = null;
  };

  /** Elements between the touched one and the host that can scroll sideways, with their position. */
  private sidewaysScrollers(element: HTMLElement | null): [HTMLElement, number][] {
    const found: [HTMLElement, number][] = [];
    for (let node = element; node && node !== this.host.nativeElement.parentElement; node = node.parentElement) {
      if (node.scrollWidth <= node.clientWidth + 1) {
        continue;
      }
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') {
        found.push([node, node.scrollLeft]);
      }
    }
    return found;
  }
}
