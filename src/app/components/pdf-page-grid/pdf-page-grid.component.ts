import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy,
  Output, QueryList, SimpleChanges, ViewChildren, inject
} from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * One tile of the grid: a page of a loaded PDF plus the edits applied to it so far.
 * `rotation` is the extra clockwise rotation requested by the user; `baseRotation` is the page's
 * own /Rotate, so the thumbnail shows `(baseRotation + rotation) % 360`.
 */
export interface PdfGridPage {
  /** Stable identity of the tile (survives reorder / duplicate) */
  key: string;
  /** Which loaded document the page comes from (key of the `docs` map) */
  sourceId: string;
  /** 1-based page number in the source */
  page: number;
  rotation: number;
  baseRotation: number;
  width: number;
  height: number;
  selected: boolean;
}

/**
 * Lazy, drag-sortable grid of PDF page thumbnails rendered client-side with pdf.js. The
 * component owns the selection (click / Shift-click / Ctrl-click / keyboard) and the rendering
 * cache; every structural change (reorder, rotate, delete, duplicate, cut) is emitted to the
 * owning dialog, which holds the model and its undo history.
 * <p>
 * Tiles render only when scrolled into view (IntersectionObserver) and thumbnails are cached per
 * (source, page, rotation, size) as JPEG data URLs, so a 500-page document stays responsive.
 */
@Component({
  selector: 'app-pdf-page-grid',
  standalone: true,
  imports: [DragDropModule, MatIconModule, MatButtonModule, MatTooltipModule, TranslatePipe],
  templateUrl: './pdf-page-grid.component.html',
  styleUrls: ['./pdf-page-grid.component.css']
})
export class PdfPageGridComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) pages: PdfGridPage[] = [];
  /** Loaded pdf.js documents keyed by `PdfGridPage.sourceId` */
  @Input({ required: true }) docs!: Map<string, PDFDocumentProxy>;
  /** Tile width in CSS pixels */
  @Input() thumbWidth = 160;
  @Input() dragEnabled = true;
  /** Show the per-tile rotate / delete / duplicate buttons */
  @Input() showActions = true;
  /** Selection is allowed (click toggles) */
  @Input() selectable = true;
  /** Split mode: a scissors toggle before each page (except the first) starts a new part there */
  @Input() cutMode = false;
  /** Split mode: 0-based tile indices that start a new part */
  @Input() cuts: ReadonlySet<number> = new Set<number>();

  @Output() reorder = new EventEmitter<{ from: number; to: number }>();
  @Output() selectionChange = new EventEmitter<void>();
  @Output() rotatePage = new EventEmitter<{ page: PdfGridPage; delta: number }>();
  @Output() removePage = new EventEmitter<PdfGridPage>();
  @Output() duplicatePage = new EventEmitter<PdfGridPage>();
  @Output() cutToggle = new EventEmitter<number>();

  @ViewChildren('tile') private tileRefs!: QueryList<ElementRef<HTMLElement>>;

  /** cache key → data URL */
  private readonly thumbs = new Map<string, string>();
  private readonly pending = new Set<string>();
  /** Tile keys the observer has already shown: they may re-render in place (e.g. after a rotation). */
  private readonly seen = new Set<string>();
  /** Cache keys whose render threw: never queue them again (the tile keeps its placeholder). */
  private readonly failed = new Set<string>();
  private observer?: IntersectionObserver;
  private lastClicked = -1;
  private destroyed = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  // ── lifecycle ───────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver !== 'undefined') {
      this.zone.runOutsideAngular(() => {
        this.observer = new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const key = (entry.target as HTMLElement).dataset['key'];
              const page = key ? this.pages.find(p => p.key === key) : undefined;
              if (page) {
                this.seen.add(page.key);
                this.render(page);
              }
            }
          }
        }, { rootMargin: '300px' });
        this.observeTiles();
      });
      this.tileRefs.changes.subscribe(() => this.zone.runOutsideAngular(() => this.observeTiles()));
    } else {
      // No observer support: render everything.
      this.pages.forEach(p => {
        this.seen.add(p.key);
        this.render(p);
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['thumbWidth'] && !changes['thumbWidth'].firstChange) {
      // Re-render visible tiles at the new size (other buckets stay cached).
      setTimeout(() => this.observeTiles());
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.thumbs.clear();
    this.seen.clear();
    this.failed.clear();
  }

  private observeTiles(): void {
    if (!this.observer) return;
    this.observer.disconnect();
    this.tileRefs?.forEach(ref => this.observer!.observe(ref.nativeElement));
  }

  // ── thumbnails ──────────────────────────────────────────────────────────

  /** Effective rotation shown for a tile. */
  totalRotation(p: PdfGridPage): number {
    return ((p.baseRotation + p.rotation) % 360 + 360) % 360;
  }

  /** Tile height for the tile width, honouring the page's aspect and its rotation. */
  tileHeight(p: PdfGridPage): number {
    const swapped = this.totalRotation(p) % 180 !== 0;
    const w = swapped ? p.height : p.width;
    const h = swapped ? p.width : p.height;
    if (!w || !h) return this.thumbWidth * 1.4142;
    return Math.round(this.thumbWidth * (h / w));
  }

  thumbFor(p: PdfGridPage): string | undefined {
    const thumb = this.thumbs.get(this.cacheKey(p));
    if (thumb === undefined && this.seen.has(p.key)) {
      // Rotating a page changes its cache key without touching the tile element, so the
      // IntersectionObserver never fires again: re-queue the render here, or the tile would
      // fall back to its placeholder for the rest of the session.
      this.render(p);
    }
    return thumb;
  }

  private bucket(): number {
    return Math.max(80, Math.round(this.thumbWidth / 40) * 40);
  }

  private cacheKey(p: PdfGridPage): string {
    return `${p.sourceId}|${p.page}|${this.totalRotation(p)}|${this.bucket()}`;
  }

  /**
   * Queue a thumbnail render. Renders run at most {@link MAX_PARALLEL_RENDERS} at a time, newest
   * request first: pdf.js decodes a page's images at full resolution whatever the thumbnail size,
   * so on a heavy scan a flood of parallel requests would keep every tile blank for a long while,
   * whereas a short queue paints the tiles the user is looking at one after the other.
   */
  private render(p: PdfGridPage): void {
    const key = this.cacheKey(p);
    if (this.thumbs.has(key) || this.pending.has(key) || this.failed.has(key)) return;
    if (!this.docs?.get(p.sourceId)) return;
    this.pending.add(key);
    this.queue.unshift({ page: p, key });
    this.pump();
  }

  private static readonly MAX_PARALLEL_RENDERS = 2;
  private readonly queue: { page: PdfGridPage; key: string }[] = [];
  private active = 0;

  private pump(): void {
    while (this.active < PdfPageGridComponent.MAX_PARALLEL_RENDERS && this.queue.length > 0) {
      const next = this.queue.shift()!;
      // Skip work for tiles that were rotated / resized again while waiting.
      if (this.cacheKey(next.page) !== next.key || this.thumbs.has(next.key)) {
        this.pending.delete(next.key);
        continue;
      }
      this.active++;
      this.renderNow(next.page, next.key).finally(() => {
        this.active--;
        this.pending.delete(next.key);
        this.pump();
      });
    }
  }

  private async renderNow(p: PdfGridPage, key: string): Promise<void> {
    const doc = this.docs?.get(p.sourceId);
    if (!doc || this.destroyed) return;
    const width = this.bucket() * Math.min(2, window.devicePixelRatio || 1);
    const rotation = this.totalRotation(p);
    try {
      const page = await doc.getPage(p.page);
      if (this.destroyed) return;
      const base = page.getViewport({ scale: 1, rotation });
      const viewport = page.getViewport({ scale: width / base.width, rotation });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (this.destroyed) return;
      this.thumbs.set(key, canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = canvas.height = 0;
      this.zone.run(() => this.cdr.markForCheck());
    } catch {
      // cancelled or unreadable page: the tile keeps its placeholder, and is not retried
      // (thumbFor() asks again on every change detection cycle). A render interrupted by
      // teardown is not a failure — the whole grid is going away anyway.
      if (!this.destroyed) this.failed.add(key);
    }
  }

  // ── selection ───────────────────────────────────────────────────────────

  get selectedCount(): number {
    return this.pages.filter(p => p.selected).length;
  }

  onTileClick(index: number, event: MouseEvent): void {
    if (!this.selectable) return;
    const page = this.pages[index];
    if (!page) return;
    if (event.shiftKey && this.lastClicked >= 0) {
      const [from, to] = this.lastClicked < index ? [this.lastClicked, index] : [index, this.lastClicked];
      for (let i = from; i <= to; i++) this.pages[i].selected = true;
    } else {
      page.selected = !page.selected;
    }
    this.lastClicked = index;
    this.selectionChange.emit();
  }

  onTileKeydown(index: number, event: KeyboardEvent): void {
    const page = this.pages[index];
    if (!page) return;
    switch (event.key) {
      case ' ':
      case 'Enter':
        event.preventDefault();
        if (this.selectable) {
          page.selected = !page.selected;
          this.lastClicked = index;
          this.selectionChange.emit();
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (this.showActions) {
          event.preventDefault();
          this.removePage.emit(page);
        }
        break;
      case 'r':
      case 'R':
        if (this.showActions) {
          event.preventDefault();
          this.rotatePage.emit({ page, delta: event.shiftKey ? -90 : 90 });
        }
        break;
      case 'ArrowRight':
      case 'ArrowLeft':
        event.preventDefault();
        this.focusTile(index + (event.key === 'ArrowRight' ? 1 : -1));
        break;
      default:
        break;
    }
  }

  private focusTile(index: number): void {
    const tiles = this.tileRefs?.toArray();
    if (!tiles || index < 0 || index >= tiles.length) return;
    tiles[index].nativeElement.focus();
  }

  // ── structural events ───────────────────────────────────────────────────

  onDrop(event: CdkDragDrop<PdfGridPage[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      this.reorder.emit({ from: event.previousIndex, to: event.currentIndex });
    }
  }

  onRotate(page: PdfGridPage, delta: number, event: Event): void {
    event.stopPropagation();
    this.rotatePage.emit({ page, delta });
  }

  onRemove(page: PdfGridPage, event: Event): void {
    event.stopPropagation();
    this.removePage.emit(page);
  }

  onDuplicate(page: PdfGridPage, event: Event): void {
    event.stopPropagation();
    this.duplicatePage.emit(page);
  }

  onCut(index: number, event: Event): void {
    event.stopPropagation();
    this.cutToggle.emit(index);
  }

  /** Split mode: 1-based part number of the tile at `index`. */
  partOf(index: number): number {
    let part = 1;
    for (const cut of this.cuts) {
      if (cut <= index) part++;
    }
    return part;
  }

  trackByKey(_: number, p: PdfGridPage): string {
    return p.key;
  }
}
