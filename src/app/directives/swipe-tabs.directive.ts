import { Directionality } from '@angular/cdk/bidi';
import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  booleanAttribute,
  inject
} from '@angular/core';
import { MatTabGroup } from '@angular/material/tabs';

/** Horizontal travel (px) before the gesture is claimed as a tab swipe. */
const START_THRESHOLD = 10;
/** Horizontal travel must beat vertical travel by this ratio to win over scrolling. */
const DIRECTION_RATIO = 1.4;
/** Fraction of the tab width that commits the swipe when the finger is lifted. */
const COMMIT_DISTANCE_RATIO = 0.25;
/** Flick speed (px/ms) that commits the swipe even when the drag was short. */
const COMMIT_VELOCITY = 0.35;
/** A flick must still travel this far (px), so a jittery tap never switches tabs. */
const MIN_FLICK_DISTANCE = 30;
/** How much of the finger movement is followed when there is no tab to swipe to. */
const EDGE_RESISTANCE = 0.25;
/** Snap-back duration (ms) when the swipe is abandoned. */
const CANCEL_DURATION = 200;
/** Same curve Angular Material uses for its own tab transition. */
const EASING = 'cubic-bezier(0.35, 0, 0.25, 1)';
/** Window (ms) over which the flick speed is measured. */
const VELOCITY_WINDOW = 100;
/**
 * Controls that consume horizontal drags themselves — a swipe starting on one of
 * them belongs to the control, not to the tab group. Add `data-no-swipe` to opt
 * any other element out.
 */
const SELF_HANDLED_CONTROLS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], mat-slider, [data-no-swipe]';

/**
 * Lets the user swipe horizontally to move between the tabs of a `mat-tab-group`,
 * the way native mobile apps do — a must on touch screens, where reaching for a
 * small tab label is far more work than flicking the content sideways.
 *
 * The tab content follows the finger while dragging and, on release, either snaps
 * back or hands over to Material's own tab transition, so the movement stays
 * continuous. Clicking the tab labels and keyboard navigation are untouched, so
 * this is purely an addition for touch users.
 *
 * ```html
 * <mat-tab-group appSwipeTabs>…</mat-tab-group>
 * ```
 *
 * Two things to know before enabling it on a tab group:
 * - the body wrapper gets `touch-action: pan-y`, so content that needs to be
 *   panned horizontally by finger (a wide table, a chart) can no longer be panned
 *   inside these tabs — set `[swipeTabsLockAxis]="false"` for those;
 * - `preserveContent` is turned on, so a tab that has been shown once can be seen
 *   sliding in during the drag. A tab that has never been opened is still built
 *   only when the swipe completes, so the very first drag towards it uncovers the
 *   panel background rather than its content.
 *
 * The tabs of a group should be the same height, or committing a swipe resizes
 * the panel under the user's finger — give the container a definite height
 * rather than letting it grow with whichever tab is showing.
 */
@Directive({
  selector: 'mat-tab-group[appSwipeTabs]',
  standalone: true,
  host: {
    '[class.swipe-tabs]': 'enabled',
    '[class.swipe-tabs-lock-axis]': 'enabled && swipeTabsLockAxis'
  }
})
export class SwipeTabsDirective implements OnInit, AfterViewInit, OnDestroy {
  /** Set to `false` to leave the tab group untouched (e.g. behind a feature flag). */
  @Input({ alias: 'appSwipeTabs', transform: booleanAttribute }) enabled = true;

  /**
   * Whether the tab group claims the horizontal axis outright, via
   * `touch-action: pan-y` on the tab bodies. That makes the gesture more robust,
   * but it also stops anything inside the tabs from being panned sideways by
   * finger, so tabs holding a wide table or a chart should set this to `false`:
   * the swipe still works, it just leaves the axis to the browser until the
   * gesture has been recognised.
   */
  @Input({ transform: booleanAttribute }) swipeTabsLockAxis = true;

  private readonly tabGroup = inject(MatTabGroup, { self: true });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly directionality = inject(Directionality, { optional: true });

  private wrapper?: HTMLElement;

  /** A finger is down and the gesture could still become a swipe. */
  private tracking = false;
  /** The gesture is a horizontal swipe and the tab content is following the finger. */
  private dragging = false;
  /** A commit or snap-back transition is running. */
  private animating = false;

  private startX = 0;
  private startY = 0;
  private offset = 0;
  private wrapperWidth = 1;
  /** Reference point for the flick speed, refreshed every `VELOCITY_WINDOW` ms. */
  private sampleX = 0;
  private sampleTime = 0;
  private velocity = 0;
  /** Index of the tab currently uncovered behind the one being dragged. */
  private previewIndex: number | null = null;
  private cleanupTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    if (this.enabled) {
      // Without this the neighbouring tab is torn out of the DOM as soon as it
      // stops being the active one, and the drag would reveal an empty panel.
      this.tabGroup.preserveContent = true;
    }
  }

  ngAfterViewInit(): void {
    if (!this.enabled) {
      return;
    }

    this.wrapper = this.tabGroup._tabBodyWrapper?.nativeElement;
    if (!this.wrapper) {
      return;
    }

    // Touch handling runs outside Angular: a drag emits a move event per frame
    // and none of them change anything the app renders.
    this.zone.runOutsideAngular(() => {
      this.wrapper!.addEventListener('touchstart', this.onTouchStart, { passive: true });
      this.wrapper!.addEventListener('touchmove', this.onTouchMove, { passive: false });
      this.wrapper!.addEventListener('touchend', this.onTouchEnd);
      this.wrapper!.addEventListener('touchcancel', this.onTouchCancel);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.cleanupTimer);
    this.wrapper?.removeEventListener('touchstart', this.onTouchStart);
    this.wrapper?.removeEventListener('touchmove', this.onTouchMove);
    this.wrapper?.removeEventListener('touchend', this.onTouchEnd);
    this.wrapper?.removeEventListener('touchcancel', this.onTouchCancel);
  }

  private readonly onTouchStart = (event: TouchEvent): void => {
    this.tracking = false;

    if (event.touches.length !== 1 || this.tabCount() < 2) {
      return;
    }
    if ((event.target as HTMLElement | null)?.closest(SELF_HANDLED_CONTROLS)) {
      return;
    }

    // A finger landing mid-transition takes over from it.
    if (this.animating) {
      this.finishAnimation();
    }

    const touch = event.touches[0];
    this.tracking = true;
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.sampleX = touch.clientX;
    this.sampleTime = event.timeStamp;
    this.velocity = 0;
    this.offset = 0;
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.tracking) {
      return;
    }
    // A second finger means a pinch/zoom, which is not ours to interpret.
    if (event.touches.length !== 1) {
      this.onTouchCancel();
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.startX;
    const deltaY = touch.clientY - this.startY;

    if (!this.dragging) {
      // Vertical wins: this is a scroll, leave the gesture alone for good.
      if (Math.abs(deltaY) > START_THRESHOLD && Math.abs(deltaY) >= Math.abs(deltaX)) {
        this.tracking = false;
        return;
      }
      if (Math.abs(deltaX) < START_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY) * DIRECTION_RATIO) {
        return;
      }
      // Something under the finger can still scroll sideways — let it.
      if (this.hasScrollableAncestor(event.target as HTMLElement | null, deltaX)) {
        this.tracking = false;
        return;
      }
      this.beginDrag();
    }

    // Keep the browser (and any outer swipe container) out of this gesture.
    event.preventDefault();
    event.stopPropagation();

    if (event.timeStamp - this.sampleTime > VELOCITY_WINDOW) {
      this.velocity = (touch.clientX - this.sampleX) / (event.timeStamp - this.sampleTime);
      this.sampleX = touch.clientX;
      this.sampleTime = event.timeStamp;
    }

    this.offset = this.applyResistance(deltaX);
    this.setTransform(this.offset);
    this.showPreviewOf(this.targetIndex(this.offset));
  };

  private readonly onTouchEnd = (event: TouchEvent): void => {
    if (!this.dragging) {
      this.tracking = false;
      return;
    }

    // A last sample keeps a quick flick from being read as a slow drag.
    const touch = event.changedTouches[0];
    const elapsed = event.timeStamp - this.sampleTime;
    if (touch && elapsed > 0) {
      this.velocity = (touch.clientX - this.sampleX) / elapsed;
    }

    const target = this.targetIndex(this.offset);
    if (target === null) {
      this.cancelDrag();
      return;
    }

    const flicked =
      Math.abs(this.velocity) >= COMMIT_VELOCITY &&
      Math.abs(this.offset) >= MIN_FLICK_DISTANCE &&
      Math.sign(this.velocity) === Math.sign(this.offset);

    if (flicked || Math.abs(this.offset) >= this.wrapperWidth * COMMIT_DISTANCE_RATIO) {
      this.commitDrag(target);
    } else {
      this.cancelDrag();
    }
  };

  private readonly onTouchCancel = (): void => {
    if (this.dragging) {
      this.cancelDrag();
    } else {
      this.tracking = false;
    }
  };

  private beginDrag(): void {
    this.dragging = true;
    this.wrapperWidth = this.wrapper!.clientWidth || 1;
    this.host.nativeElement.classList.add('swipe-tabs-dragging');
    this.forEachBody(body => (body.style.transition = 'none'));
  }

  /**
   * Uncovers the tab being dragged towards, which Material otherwise keeps
   * hidden and clipped. Only that one: every tab on the same side is parked at
   * the same offset, so revealing them all would stack them on top of each other.
   */
  private showPreviewOf(index: number | null): void {
    if (index === this.previewIndex) {
      return;
    }
    this.hidePreview();
    this.previewIndex = index;
    if (index !== null) {
      this.wrapper?.children[index]?.classList.add('swipe-tabs-preview');
    }
  }

  private hidePreview(): void {
    if (this.previewIndex !== null) {
      this.wrapper?.children[this.previewIndex]?.classList.remove('swipe-tabs-preview');
      this.previewIndex = null;
    }
  }

  /** Slides to `target`, letting Material's own transition finish the movement. */
  private commitDrag(target: number): void {
    this.dragging = false;
    this.tracking = false;
    this.animating = true;

    const duration = this.animationDuration();
    this.setTransition(duration);
    this.setTransform(0);
    // The bodies travelling back to 0 and Material sliding their content in from
    // ±100% add up, so the tab the user dragged into view keeps moving from
    // exactly where the finger left it.
    this.zone.run(() => (this.tabGroup.selectedIndex = target));
    this.scheduleCleanup(duration);
  }

  /** Snaps the tab content back into place, staying on the current tab. */
  private cancelDrag(): void {
    this.dragging = false;
    this.tracking = false;
    this.animating = true;

    this.setTransition(CANCEL_DURATION);
    this.setTransform(0);
    this.scheduleCleanup(CANCEL_DURATION);
  }

  private scheduleCleanup(duration: number): void {
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = setTimeout(() => this.finishAnimation(), duration + 50);
  }

  private finishAnimation(): void {
    clearTimeout(this.cleanupTimer);
    this.animating = false;
    this.hidePreview();
    this.host.nativeElement.classList.remove('swipe-tabs-dragging');
    this.forEachBody(body => {
      body.style.transition = '';
      body.style.transform = '';
    });
  }

  /**
   * Moves the tab bodies, not the wrapper: the wrapper is what crops the tabs
   * parked to either side, so moving it would drag that crop along and the tab
   * being swiped in would stay hidden. Material positions the content inside each
   * body, and the two transforms add up.
   */
  private setTransform(offset: number): void {
    this.forEachBody(body => (body.style.transform = `translate3d(${offset}px, 0, 0)`));
  }

  private setTransition(duration: number): void {
    this.forEachBody(body => (body.style.transition = `transform ${duration}ms ${EASING}`));
  }

  private forEachBody(apply: (body: HTMLElement) => void): void {
    for (const body of Array.from(this.wrapper?.children ?? [])) {
      apply(body as HTMLElement);
    }
  }

  /** Follows the finger, but only barely once there is no further tab that way. */
  private applyResistance(deltaX: number): number {
    const clamped = Math.max(-this.wrapperWidth, Math.min(this.wrapperWidth, deltaX));
    return this.targetIndex(clamped) === null ? clamped * EDGE_RESISTANCE : clamped;
  }

  /**
   * The tab a drag of `offset` would land on, or `null` at either end of the
   * strip. In RTL the tab bodies are mirrored, so the same finger movement walks
   * the tabs the other way round.
   */
  private targetIndex(offset: number): number | null {
    if (!offset) {
      return null;
    }
    const step = (offset > 0 ? -1 : 1) * (this.isRtl() ? -1 : 1);
    const tabs = this.tabGroup._tabs?.toArray() ?? [];
    const current = this.tabGroup.selectedIndex ?? 0;

    for (let i = current + step; i >= 0 && i < tabs.length; i += step) {
      if (!tabs[i].disabled) {
        return i;
      }
    }
    return null;
  }

  private tabCount(): number {
    return this.tabGroup._tabs?.length ?? 0;
  }

  private isRtl(): boolean {
    return this.directionality?.value === 'rtl';
  }

  /** Material's tab transition duration, so the two halves of the move stay in step. */
  private animationDuration(): number {
    const duration = this.tabGroup.animationDuration;
    const value = parseFloat(duration);
    if (isNaN(value)) {
      return 500;
    }
    return duration.endsWith('s') && !duration.endsWith('ms') ? value * 1000 : value;
  }

  /**
   * Whether anything between the touched element and the tab body can still be
   * scrolled sideways in the direction of the drag — a wide table or a code
   * block owns that gesture.
   */
  private hasScrollableAncestor(element: HTMLElement | null, deltaX: number): boolean {
    for (let node = element; node && node !== this.wrapper; node = node.parentElement) {
      if (node.scrollWidth <= node.clientWidth + 1) {
        continue;
      }
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX !== 'auto' && overflowX !== 'scroll') {
        continue;
      }
      const maxScroll = node.scrollWidth - node.clientWidth;
      const scrollLeft = Math.abs(node.scrollLeft);
      if (deltaX < 0 ? scrollLeft < maxScroll - 1 : scrollLeft > 1) {
        return true;
      }
    }
    return false;
  }
}
