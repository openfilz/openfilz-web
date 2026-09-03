/**
 * Touch (mobile / tablet) text selection for the Monaco editor.
 *
 * Monaco has no drag-to-select on touch devices: its `PointerEventHandler` explicitly bails out
 * of the mouse-down selection operation when `pointerType === 'touch'`, and its gesture handler
 * turns a finger drag into a scroll. The only selection a finger can produce out of the box is a
 * double-tap, which selects a single word - so copying or cutting a phrase is impossible.
 *
 * This handler adds the native-feeling gesture on top of the editor DOM node:
 *   long press  -> select the word under the finger (and enter selection mode)
 *   then drag   -> extend the selection, auto-scrolling near the top/bottom edges
 *   release     -> keep the selection (the component then shows a copy/cut/paste bar)
 *
 * A plain drag (without the long press) is left untouched, so scrolling still works.
 *
 * Monaco's own gesture recognizer listens on `document` in the bubble phase, so stopping
 * propagation from our capture-phase listeners on the editor node is enough to keep it from
 * scrolling while a selection drag is in progress.
 *
 * Kept in its own file (no Angular dependency) so the enterprise fork can pick it up as-is.
 */

export interface MonacoTouchSelectionConfig {
  /** How long a finger must stay down before selection starts. */
  longPressMs?: number;
  /** Movement (px) that cancels the pending long press - the user is scrolling. */
  moveTolerancePx?: number;
  /** Distance (px) from the top/bottom edge where dragging auto-scrolls. */
  autoScrollEdgePx?: number;
  /** Max auto-scroll speed in px per animation frame. */
  autoScrollMaxSpeedPx?: number;
}

interface Position {
  lineNumber: number;
  column: number;
}

const DEFAULTS: Required<MonacoTouchSelectionConfig> = {
  longPressMs: 450,
  moveTolerancePx: 10,
  autoScrollEdgePx: 44,
  autoScrollMaxSpeedPx: 14
};

export class MonacoTouchSelection {

  private readonly config: Required<MonacoTouchSelectionConfig>;
  private readonly domNode: HTMLElement | null;
  private readonly teardown: Array<() => void> = [];

  private pressTimer: any = null;
  private touchId: number | null = null;
  private startX = 0;
  private startY = 0;

  /** True between the long press firing and the finger being lifted. */
  private selecting = false;
  /** Word range the long press landed on: the selection never shrinks below it. */
  private anchor: { start: Position; end: Position } | null = null;

  private lastClientX = 0;
  private lastClientY = 0;
  private autoScrollHandle: number | null = null;
  private autoScrollSpeed = 0;

  constructor(private readonly editor: any, config: MonacoTouchSelectionConfig = {}) {
    this.config = { ...DEFAULTS, ...config };
    this.domNode = editor?.getDomNode?.() ?? null;
    if (this.domNode) {
      this.listen('touchstart', this.onTouchStart);
      this.listen('touchmove', this.onTouchMove);
      this.listen('touchend', this.onTouchEnd);
      this.listen('touchcancel', this.onTouchEnd);
    }
  }

  dispose(): void {
    this.cancelPendingPress();
    this.stopAutoScroll();
    this.teardown.forEach(fn => fn());
    this.teardown.length = 0;
  }

  private listen(type: string, handler: (e: TouchEvent) => void): void {
    const node = this.domNode!;
    const bound = handler.bind(this) as EventListener;
    // Capture phase + non-passive: we must be able to preventDefault()/stopPropagation()
    // before Monaco's document-level gesture recognizer turns the drag into a scroll.
    const options: AddEventListenerOptions = { capture: true, passive: false };
    node.addEventListener(type, bound, options);
    this.teardown.push(() => node.removeEventListener(type, bound, options));
  }

  private onTouchStart(e: TouchEvent): void {
    this.cancelPendingPress();
    this.stopSelecting();

    if (e.touches.length !== 1) {
      return;
    }
    const touch = e.touches[0];
    if (!this.isOnContent(touch.target)) {
      return; // scrollbar, gutter, overlay widget... leave it to Monaco
    }

    this.touchId = touch.identifier;
    this.startX = this.lastClientX = touch.clientX;
    this.startY = this.lastClientY = touch.clientY;
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      this.beginSelection(this.startX, this.startY);
    }, this.config.longPressMs);
  }

  private onTouchMove(e: TouchEvent): void {
    const touch = this.trackedTouch(e);
    if (!touch) {
      return;
    }

    if (!this.selecting) {
      const movedFar = Math.abs(touch.clientX - this.startX) > this.config.moveTolerancePx
        || Math.abs(touch.clientY - this.startY) > this.config.moveTolerancePx;
      if (movedFar) {
        this.cancelPendingPress(); // the user is scrolling, not selecting
      }
      return;
    }

    // Selection drag: keep the gesture away from Monaco, which would scroll instead.
    e.preventDefault();
    e.stopPropagation();

    this.lastClientX = touch.clientX;
    this.lastClientY = touch.clientY;
    this.extendTo(touch.clientX, touch.clientY);
    this.updateAutoScroll(touch.clientY);
  }

  private onTouchEnd(e: TouchEvent): void {
    this.cancelPendingPress();
    if (!this.selecting) {
      this.touchId = null;
      return;
    }
    // Swallow the end of the gesture too, otherwise Monaco reads the drag as a fling and
    // kicks off inertia scrolling right after the selection was made.
    e.preventDefault();
    e.stopPropagation();
    this.stopSelecting();
  }

  private beginSelection(clientX: number, clientY: number): void {
    const position = this.positionAt(clientX, clientY);
    const model = this.editor.getModel?.();
    if (!position || !model) {
      return;
    }

    const word = model.getWordAtPosition(position);
    const start: Position = { lineNumber: position.lineNumber, column: word ? word.startColumn : position.column };
    const end: Position = { lineNumber: position.lineNumber, column: word ? word.endColumn : position.column };

    this.anchor = { start, end };
    this.selecting = true;
    this.editor.setSelection({
      selectionStartLineNumber: start.lineNumber,
      selectionStartColumn: start.column,
      positionLineNumber: end.lineNumber,
      positionColumn: end.column
    });

    // Short buzz so the user feels the gesture switch from "scroll" to "select".
    navigator.vibrate?.(10);
  }

  private extendTo(clientX: number, clientY: number): void {
    const anchor = this.anchor;
    const position = this.positionAt(clientX, clientY);
    if (!anchor || !position) {
      return;
    }

    if (this.compare(position, anchor.start) < 0) {
      // Dragging backwards: the caret leads, the end of the anchor word stays put.
      this.editor.setSelection({
        selectionStartLineNumber: anchor.end.lineNumber,
        selectionStartColumn: anchor.end.column,
        positionLineNumber: position.lineNumber,
        positionColumn: position.column
      });
      return;
    }

    const caret = this.compare(position, anchor.end) > 0 ? position : anchor.end;
    this.editor.setSelection({
      selectionStartLineNumber: anchor.start.lineNumber,
      selectionStartColumn: anchor.start.column,
      positionLineNumber: caret.lineNumber,
      positionColumn: caret.column
    });
  }

  /** Scrolls the editor while the finger is held near the top or bottom edge. */
  private updateAutoScroll(clientY: number): void {
    const rect = this.domNode?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const edge = this.config.autoScrollEdgePx;
    const maxSpeed = this.config.autoScrollMaxSpeedPx;
    const aboveBy = rect.top + edge - clientY;
    const belowBy = clientY - (rect.bottom - edge);

    if (aboveBy > 0) {
      this.autoScrollSpeed = -Math.min(maxSpeed, (aboveBy / edge) * maxSpeed);
    } else if (belowBy > 0) {
      this.autoScrollSpeed = Math.min(maxSpeed, (belowBy / edge) * maxSpeed);
    } else {
      this.stopAutoScroll();
      return;
    }

    if (this.autoScrollHandle === null) {
      this.autoScrollHandle = requestAnimationFrame(this.autoScrollStep);
    }
  }

  private autoScrollStep = (): void => {
    this.autoScrollHandle = null;
    if (!this.selecting || this.autoScrollSpeed === 0) {
      return;
    }
    const top = this.editor.getScrollTop();
    const next = Math.max(0, Math.min(this.editor.getScrollHeight(), top + this.autoScrollSpeed));
    if (next !== top) {
      this.editor.setScrollTop(next);
      // The text under the finger moved, so the selection has to follow it.
      this.extendTo(this.lastClientX, this.lastClientY);
    }
    this.autoScrollHandle = requestAnimationFrame(this.autoScrollStep);
  };

  private stopAutoScroll(): void {
    if (this.autoScrollHandle !== null) {
      cancelAnimationFrame(this.autoScrollHandle);
      this.autoScrollHandle = null;
    }
    this.autoScrollSpeed = 0;
  }

  private stopSelecting(): void {
    this.stopAutoScroll();
    this.selecting = false;
    this.anchor = null;
    this.touchId = null;
  }

  private cancelPendingPress(): void {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  private trackedTouch(e: TouchEvent): Touch | null {
    if (this.touchId === null) {
      return null;
    }
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches.item(i);
      if (touch && touch.identifier === this.touchId) {
        return touch;
      }
    }
    return null;
  }

  private positionAt(clientX: number, clientY: number): Position | null {
    const target = this.editor.getTargetAtClientPoint?.(clientX, clientY);
    return target?.position ?? null;
  }

  /** Only gestures that start on the rendered lines select - not the scrollbars or the gutter. */
  private isOnContent(target: EventTarget | null): boolean {
    const lines = this.domNode?.querySelector('.lines-content');
    return !!lines && target instanceof Node && lines.contains(target);
  }

  private compare(a: Position, b: Position): number {
    return a.lineNumber !== b.lineNumber ? a.lineNumber - b.lineNumber : a.column - b.column;
  }
}
