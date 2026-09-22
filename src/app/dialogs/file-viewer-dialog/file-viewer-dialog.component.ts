import { Component, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { DocumentApiService } from '../../services/document-api.service';
import { PdfToolsAccessService } from '../../services/pdf-tools-access.service';
import { PdfToolsService } from '../../services/pdf-tools.service';
import { PdfToolResult } from '../../models/pdf-tools.models';
import { DocumentVersionsService } from '../../services/document-versions.service';
import { OnlyOfficeService } from '../../services/onlyoffice.service';
import { RoleService } from '../../services/role.service';
import { determineViewerMode, ViewerMode } from '../../utils/viewer-mode.util';
import { OnlyOfficeEditorComponent } from '../../components/onlyoffice-editor/onlyoffice-editor.component';
import { TextEditorComponent } from '../../components/text-editor/text-editor.component';
import { saveAs } from 'file-saver';
import { Observable, shareReplay, Subscription } from 'rxjs';
import type { ImageGallery } from '../../services/image-gallery.service';

// PDF.js imports
import * as pdfjsLib from 'pdfjs-dist';
import { PDFJS_WORKER_SRC } from '../../utils/pdfjs-worker';

// Syntax highlighting
import hljs from 'highlight.js';

// Markdown rendering
import { marked } from 'marked';

// Office document viewers
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export interface FileViewerDialogData {
  documentId: string;
  fileName: string;
  contentType: string;
  fileSize?: number;
  /** When set, the dialog shows this immutable historical version (read-only, no OnlyOffice) */
  versionId?: string;
  /** Human-readable label for the version (e.g. its formatted date), shown next to the file name */
  versionLabel?: string;
  /**
   * The images of the listing the viewer was opened from (a folder, the favorites, a search).
   * When the opened file is one of them, the viewer lets the user step through them.
   */
  gallery?: ImageGallery;
}

/** A file the viewer can switch to without being reopened. */
export type FileViewerItem = Omit<FileViewerDialogData, 'versionId' | 'versionLabel' | 'gallery'>;

/** Images fetched per request while stepping through a gallery. */
const GALLERY_PAGE_SIZE = 50;

/** Largest image the viewer downloads to display (same limit as opening it from a listing). */
const MAX_IMAGE_PREVIEW_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * File size threshold in bytes above which Monaco editor disables minimap
 * and syntax highlighting for better performance (5 MB).
 */
const MAX_MONACO_COMFORTABLE_SIZE = 5 * 1024 * 1024; // 5 MB

@Component({
  selector: 'app-file-viewer-dialog',
  standalone: true,
  templateUrl: './file-viewer-dialog.component.html',
  styleUrls: ['./file-viewer-dialog.component.css'],
  imports: [
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatTooltipModule,
    OnlyOfficeEditorComponent,
    TextEditorComponent,
    TranslatePipe
  ],
})
export class FileViewerDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('pdfCanvas', { static: false }) pdfCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('imageContainer', { static: false }) imageContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('pageInput', { static: false }) private pageInput?: ElementRef<HTMLInputElement>;

  loading: boolean = true;
  error?: string;
  isFullscreen: boolean = false;
  isLargeTextFile: boolean = false;

  viewerMode: ViewerMode = 'unsupported';
  private readonly pdfToolsAccess = inject(PdfToolsAccessService);
  private readonly pdfTools = inject(PdfToolsService);
  private readonly pdfToolsDialog = inject(MatDialog);

  // Common properties
  fileBlob?: Blob;
  fileUrl?: string;

  // Image viewer properties
  imageSrc?: SafeResourceUrl;
  imageZoom: number = 1;
  imageRotation: number = 0;

  /** Previous / next navigation through the images of the listing the viewer was opened from. */
  galleryTotal = 0;
  /** Index of the image on screen. */
  galleryIndex = -1;
  /** Index of the image being fetched, so steps taken meanwhile add up; -1 when idle. */
  private galleryTarget = -1;
  /** Reached an image too large to preview while stepping through the gallery. */
  imageTooLarge = false;
  readonly maxImagePreviewSizeMb = MAX_IMAGE_PREVIEW_SIZE / (1024 * 1024);
  private galleryPages = new Map<number, Observable<FileViewerItem[]>>();
  private gallerySub?: Subscription;
  /** The previous / next arrows only show up while the mouse moves (or after a tap on touch screens). */
  galleryNavVisible = false;
  private galleryNavPointer?: string;
  private galleryNavTimer?: ReturnType<typeof setTimeout>;
  private touchStartX?: number;
  private touchStartY?: number;
  private contentSub?: Subscription;

  // PDF viewer properties
  pdfDocument?: pdfjsLib.PDFDocumentProxy;
  currentPage: number = 1;
  totalPages: number = 0;
  pdfZoom: number = 1;
  pdfRotation: number = 0;

  // Text viewer properties
  textContent?: string;
  highlightedContent?: SafeHtml;

  // Preview mode properties (HTML/Markdown)
  isPreviewMode: boolean = false;
  renderedPreviewContent?: SafeHtml;
  htmlPreviewSrcdoc?: SafeHtml;

  // Office viewer properties
  officeContent?: SafeHtml;

  readonly dialogRef = inject(MatDialogRef<FileViewerDialogComponent>);
  readonly data = inject<FileViewerDialogData>(MAT_DIALOG_DATA);
  private documentApi = inject(DocumentApiService);
  private documentVersions = inject(DocumentVersionsService);
  private onlyOfficeService = inject(OnlyOfficeService);
  private roleService = inject(RoleService);
  private snackBar = inject(MatSnackBar);
  private sanitizer = inject(DomSanitizer);
  private translate = inject(TranslateService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  
  // Track original content for auto-save
  private originalContent?: string;

  constructor() {
    // Configure PDF.js worker
    // Worker is bundled from node_modules/pdfjs-dist via angular.json assets (no CDN dependency).
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }

  /**
   * Determines if the user can edit documents in OnlyOffice.
   * CONTRIBUTOR role = can edit
   * READER role = view only
   * Historical versions are always read-only.
   */
  get canEditDocument(): boolean {
    return !this.data.versionId && this.roleService.hasRole('CONTRIBUTOR');
  }

  /**
   * Checks if the user has permission to view files.
   */
  get canViewDocument(): boolean {
    return this.roleService.hasRole('CONTRIBUTOR') || this.roleService.hasRole('READER');
  }

  ngOnInit() {
    // Check if user has permission to view files
    if (!this.canViewDocument) {
      this.error = 'errors.notAllowedToViewFiles';
      this.loading = false;
      this.snackBar.open(
        this.translate.instant('errors.notAllowedToViewFiles'),
        this.translate.instant('common.close'),
        { duration: 5000 }
      );
      return;
    }

    // Auto-fullscreen on small screens (mobile devices)
    if (window.innerWidth <= 768) {
      this.isFullscreen = true;
      this.dialogRef.updateSize('100vw', '100vh');
      this.dialogRef.addPanelClass('fullscreen-dialog');
    }

    // Intercept backdrop clicks for auto-save
    this.dialogRef.disableClose = true;
    this.dialogRef.backdropClick().subscribe(() => {
      this.onClose();
    });

    this.initGallery();
    this.dialogRef.keydownEvents().subscribe(event => this.onGalleryKeydown(event));

    this.resolveViewerMode();
  }

  ngAfterViewInit() {
    // Canvas will be rendered after view init for PDF
  }

  ngOnDestroy() {
    this.contentSub?.unsubscribe();
    this.gallerySub?.unsubscribe();
    clearTimeout(this.galleryNavTimer);
    // Clean up object URLs
    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
    }
  }

  private resolveViewerMode() {
    // OnlyOffice edits the live document — never use it for an immutable historical
    // version; office formats then fall back to the in-app mammoth/xlsx renderers.
    const onlyOfficeCandidate = !this.data.versionId &&
      this.onlyOfficeService.isOnlyOfficeEnabled() &&
      this.onlyOfficeService.isSupportedExtension(this.data.fileName?.toLowerCase() || '');

    if (!onlyOfficeCandidate) {
      this.applyViewerMode(false);
      return;
    }

    // The build-time flag only says the deployment *may* have OnlyOffice. Confirm with
    // the API (cached for the session) so a disabled or unreachable DocumentServer opens
    // in the in-app pdf.js / mammoth / xlsx viewer instead of failing.
    this.loading = true;
    this.onlyOfficeService.isAvailable().subscribe(available => this.applyViewerMode(available));
  }

  /** Set the viewer mode for the current file and start loading it. */
  private applyViewerMode(allowOnlyOffice: boolean) {
    this.viewerMode = determineViewerMode(this.data.fileName, this.data.contentType, allowOnlyOffice);

    // Monaco performance: flag large text files (5-10 MB)
    this.isLargeTextFile = this.viewerMode === 'text' && !!this.data.fileSize
      && this.data.fileSize > MAX_MONACO_COMFORTABLE_SIZE;

    this.loadDocument();
  }

  /** PDF tools: the current (not a historical version) PDF may be reorganised in place. */
  get canEditPages(): boolean {
    return !this.data.versionId && this.pdfToolsAccess.enabled;
  }

  /** Open the page organizer for this PDF; reload the preview when it was saved as a new version. */
  editPages(): void {
    if (!this.canEditPages) return;
    import('../pdf-organizer-dialog/pdf-organizer-dialog.component').then(m => {
      const ref = this.pdfToolsDialog.open(m.PdfOrganizerDialogComponent, {
        width: '1200px', maxWidth: '98vw', height: '94dvh', maxHeight: '94dvh',
        panelClass: 'pdf-tools-dialog-panel', autoFocus: false,
        data: { documentId: this.data.documentId, documentName: this.data.fileName }
      });
      ref.afterClosed().subscribe((result: PdfToolResult | undefined) => {
        if (!result?.success) return;
        if (result.mode === 'NEW_VERSION') {
          this.loadDocument();
        } else if (result.openResult) {
          // Saved as a new document and the user asked to see it: show the result rather than
          // the untouched source they started from.
          const output = result.response?.outputs?.[0];
          if (output) {
            this.showDocument(output.documentId, output.name, output.size);
          }
        }
        // The listing that opened this viewer cannot see the organizer's result, so a new
        // document (or a new version) would stay invisible until a manual refresh.
        this.pdfTools.documentsChanged$.next();
      });
    });
  }

  /** Point the viewer at another document (a PDF tool's output) and reload it in place. */
  private showDocument(documentId: string, fileName: string, fileSize?: number): void {
    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
      this.fileUrl = undefined;
    }
    this.data.documentId = documentId;
    this.data.fileName = fileName;
    this.data.contentType = 'application/pdf';
    this.data.fileSize = fileSize;
    this.data.versionId = undefined;
    this.data.versionLabel = undefined;
    this.pdfDocument = undefined;
    this.currentPage = 1;
    this.totalPages = 0;
    this.pdfRotation = 0;
    this.resolveViewerMode();
  }

  private loadDocument() {
    // OnlyOffice handles its own loading
    if (this.viewerMode === 'onlyoffice') {
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = undefined;

    const content$ = this.data.versionId
      ? this.documentVersions.downloadVersion(this.data.documentId, this.data.versionId)
      : this.documentApi.downloadDocument(this.data.documentId, true);

    // Stepping quickly through images: only the last requested file may land in the viewer.
    this.contentSub?.unsubscribe();
    this.contentSub = content$.subscribe({
      next: (blob) => {
        this.fileBlob = blob;
        this.fileUrl = URL.createObjectURL(blob);

        switch (this.viewerMode) {
          case 'pdf':
            this.loadPdf();
            break;
          case 'image':
            this.loadImage();
            break;
          case 'text':
            this.loadText();
            break;
          case 'office':
            this.loadOfficeDocument();
            break;
          default:
            this.loading = false;
            this.error = 'errors.unsupportedType';
        }
      },
      error: (err) => {
        this.error = 'errors.loadFailed';
        this.loading = false;
        this.snackBar.open(this.translate.instant(this.error), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  // ========== OnlyOffice Event Handlers ==========
  onEditorReady() {
    console.log('OnlyOffice editor is ready');
  }

  onDocumentSaved() {
    console.log('Document saved via OnlyOffice');
    this.snackBar.open(this.translate.instant('metadataPanel.saveSuccess'), this.translate.instant('common.close'), { duration: 2000 });
  }

  onEditorError(error: string) {
    // OnlyOffice could not be reached (config call refused, api.js unreachable, ...).
    // Retreat to the in-app viewer rather than leaving the user on an error screen.
    console.warn('OnlyOffice editor unavailable, falling back to the in-app viewer:', error);
    this.onlyOfficeService.markUnavailable();

    if (determineViewerMode(this.data.fileName, this.data.contentType, false) === 'unsupported') {
      this.error = error;
      this.snackBar.open(error, this.translate.instant('common.close'), { duration: 5000 });
      return;
    }

    this.applyViewerMode(false);
  }

  // ========== PDF Viewer ==========
  private async loadPdf() {
    try {
      if (!this.fileUrl) return;

      const loadingTask = pdfjsLib.getDocument(this.fileUrl);
      this.pdfDocument = await loadingTask.promise;
      this.totalPages = this.pdfDocument.numPages;
      this.loading = false;

      // Render first page
      setTimeout(() => this.renderPdfPage(), 100);
    } catch (err) {
      this.error = 'errors.pdfLoadFailed';
      this.loading = false;
      this.snackBar.open(this.translate.instant(this.error), this.translate.instant('common.close'), { duration: 3000 });
    }
  }

  private async renderPdfPage() {
    if (!this.pdfDocument || !this.pdfCanvas) return;

    try {
      const page = await this.pdfDocument.getPage(this.currentPage);
      // pdf.js treats `rotation` as absolute: passing the toolbar's rotation alone would render
      // every page upright and hide the page's own /Rotate (e.g. pages rotated by the PDF tools).
      // The toolbar rotates *on top of* what the document says.
      const viewport = page.getViewport({ scale: this.pdfZoom, rotation: page.rotate + this.pdfRotation });

      const canvas = this.pdfCanvas.nativeElement;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error('Error rendering PDF page:', err);
    }
  }

  /**
   * Jump to the page typed in the toolbar. Anything that is not a page number (empty, text, out
   * of range) leaves the document where it is and puts the current page back in the box — the
   * input keeps whatever was typed otherwise, since [value] only re-writes it when the page
   * actually changes.
   */
  goToPage(value: string): void {
    const page = Math.trunc(Number(value));
    if (Number.isFinite(page) && page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.currentPage = page;
      this.renderPdfPage();
    }
    this.syncPageInput();
  }

  /** Width of the page box, in characters: just enough for the highest page number. */
  get pageInputWidth(): number {
    return String(this.totalPages || 1).length + 2.5;
  }

  /** Put the current page number back in the toolbar box. */
  syncPageInput(): void {
    if (this.pageInput) {
      this.pageInput.nativeElement.value = String(this.currentPage);
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.renderPdfPage();
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.renderPdfPage();
    }
  }

  zoomIn() {
    if (this.viewerMode === 'pdf') {
      this.pdfZoom = Math.min(this.pdfZoom + 0.25, 3);
      this.renderPdfPage();
    } else if (this.viewerMode === 'image') {
      this.imageZoom = Math.min(this.imageZoom + 0.25, 3);
    }
  }

  zoomOut() {
    if (this.viewerMode === 'pdf') {
      this.pdfZoom = Math.max(this.pdfZoom - 0.25, 0.5);
      this.renderPdfPage();
    } else if (this.viewerMode === 'image') {
      this.imageZoom = Math.max(this.imageZoom - 0.25, 0.5);
    }
  }

  resetZoom() {
    if (this.viewerMode === 'pdf') {
      this.pdfZoom = 1;
      this.renderPdfPage();
    } else if (this.viewerMode === 'image') {
      this.imageZoom = 1;
    }
  }

  rotate() {
    if (this.viewerMode === 'pdf') {
      this.pdfRotation = (this.pdfRotation + 90) % 360;
      this.renderPdfPage();
    } else if (this.viewerMode === 'image') {
      this.imageRotation = (this.imageRotation + 90) % 360;
    }
  }

  // ========== Image Viewer ==========
  private loadImage() {
    if (this.fileUrl) {
      this.imageSrc = this.sanitizer.bypassSecurityTrustResourceUrl(this.fileUrl);
      this.loading = false;
    }
  }

  get imageTransform(): string {
    return `scale(${this.imageZoom}) rotate(${this.imageRotation}deg)`;
  }

  // ========== Image navigation (previous / next image of the listing) ==========
  /**
   * Where the opened image sits among the listing's images, and how many there are. The images
   * themselves are only fetched, a page at a time, as the user steps through them.
   */
  private initGallery(): void {
    const gallery = this.data.gallery;
    if (!gallery || this.data.versionId
      || determineViewerMode(this.data.fileName, this.data.contentType) !== 'image') return;
    this.gallerySub = gallery.locate(this.data.documentId).subscribe({
      next: ({ total, index }) => {
        if (index !== null) {
          this.galleryTotal = total;
          this.galleryIndex = index;
        }
      },
      error: err => console.warn('Image navigation unavailable:', err)
    });
  }

  get showGalleryNavigation(): boolean {
    return this.viewerMode === 'image' && this.galleryTotal > 1 && this.galleryIndex >= 0;
  }

  /** Where the next step starts from: the image being fetched, if any, else the one on screen. */
  private get galleryCursor(): number {
    return this.galleryTarget >= 0 ? this.galleryTarget : this.galleryIndex;
  }

  get hasPreviousImage(): boolean {
    return this.showGalleryNavigation && this.galleryCursor > 0;
  }

  get hasNextImage(): boolean {
    return this.showGalleryNavigation && this.galleryCursor < this.galleryTotal - 1;
  }

  previousImage(): void {
    if (this.hasPreviousImage) {
      this.goToGalleryImage(this.galleryCursor - 1);
    }
  }

  nextImage(): void {
    if (this.hasNextImage) {
      this.goToGalleryImage(this.galleryCursor + 1);
    }
  }

  private goToGalleryImage(index: number): void {
    const page = Math.floor(index / GALLERY_PAGE_SIZE);
    this.galleryTarget = index;
    // A newer step replaces one still waiting for its page
    this.gallerySub?.unsubscribe();
    this.gallerySub = this.galleryPage(page).subscribe({
      next: items => {
        this.galleryTarget = -1;
        const item = items[index - page * GALLERY_PAGE_SIZE];
        if (!item) {
          // The listing shrank since it was counted (files deleted or moved meanwhile)
          this.galleryTotal = Math.min(this.galleryTotal, page * GALLERY_PAGE_SIZE + items.length);
          return;
        }
        this.galleryIndex = index;
        this.showImage(item);
        this.prefetchGalleryPages(index);
      },
      error: () => {
        this.galleryTarget = -1;
        this.snackBar.open(
          this.translate.instant('errors.loadFailed'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  /** A page of the gallery, fetched once and shared by every later step onto it. */
  private galleryPage(page: number): Observable<FileViewerItem[]> {
    let items$ = this.galleryPages.get(page);
    if (!items$) {
      items$ = this.data.gallery!.page(page, GALLERY_PAGE_SIZE).pipe(shareReplay(1));
      this.galleryPages.set(page, items$);
      // A failed fetch is retried on the next step rather than cached
      items$.subscribe({ error: () => this.galleryPages.delete(page) });
    }
    return items$;
  }

  /** Near either end of a page, fetch the neighbouring page before the user gets there. */
  private prefetchGalleryPages(index: number): void {
    const page = Math.floor(index / GALLERY_PAGE_SIZE);
    const offset = index - page * GALLERY_PAGE_SIZE;
    if (offset >= GALLERY_PAGE_SIZE - 3 && (page + 1) * GALLERY_PAGE_SIZE < this.galleryTotal) {
      this.galleryPage(page + 1);
    }
    if (offset < 3 && page > 0) {
      this.galleryPage(page - 1);
    }
  }

  /**
   * Show the arrows for a moment: on mouse move over the viewer, or on a tap (touch screens have
   * no hover), then fade them out again so they stay out of the picture.
   */
  revealGalleryNav(event: PointerEvent): void {
    if (!this.showGalleryNavigation) return;
    this.galleryNavPointer = event.pointerType;
    this.galleryNavVisible = true;
    this.scheduleGalleryNavHide(event.pointerType === 'mouse' ? 1500 : 3000);
  }

  /** The mouse left the viewer. A finger lifting off the screen also fires this: ignore it. */
  hideGalleryNav(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(this.galleryNavTimer);
    this.galleryNavVisible = false;
  }

  private scheduleGalleryNavHide(delay: number): void {
    clearTimeout(this.galleryNavTimer);
    this.galleryNavTimer = setTimeout(() => {
      // An arrow under a resting mouse stays visible (touch screens keep a sticky :hover, so
      // only trust it for a mouse). Checked here rather than tracked with enter/leave: the arrow
      // under the mouse disappears without a leave event when the last image is reached.
      if (this.galleryNavPointer === 'mouse' && this.host.nativeElement.querySelector('.gallery-nav:hover')) {
        this.scheduleGalleryNavHide(delay);
        return;
      }
      this.galleryNavVisible = false;
    }, delay);
  }

  /** Left / right arrow keys step through the images, unless the user is typing somewhere. */
  private onGalleryKeydown(event: KeyboardEvent): void {
    if (!this.showGalleryNavigation || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    // In a right-to-left layout the "previous" image sits on the right.
    const rtl = document.documentElement.dir === 'rtl';
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      rtl ? this.nextImage() : this.previousImage();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      rtl ? this.previousImage() : this.nextImage();
    }
  }

  onImageTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      this.touchStartX = undefined;
      return;
    }
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  /** A horizontal swipe on an unzoomed image goes to the previous / next image. */
  onImageTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === undefined || this.touchStartY === undefined || this.imageZoom > 1) return;
    const dx = event.changedTouches[0].clientX - this.touchStartX;
    const dy = event.changedTouches[0].clientY - this.touchStartY;
    this.touchStartX = undefined;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const rtl = document.documentElement.dir === 'rtl';
    (dx > 0) !== rtl ? this.previousImage() : this.nextImage();
  }

  /** Point the viewer at another image of the listing and load it in place. */
  private showImage(item: FileViewerItem): void {
    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
      this.fileUrl = undefined;
    }
    Object.assign(this.data, item);
    this.fileBlob = undefined;
    this.imageSrc = undefined;
    this.imageZoom = 1;
    this.imageRotation = 0;
    this.error = undefined;
    // Too large to preview: say so (with a download button) instead of downloading it
    this.imageTooLarge = !!item.fileSize && item.fileSize > MAX_IMAGE_PREVIEW_SIZE;
    if (this.imageTooLarge) {
      this.contentSub?.unsubscribe();
      this.viewerMode = 'image';
      this.loading = false;
      return;
    }
    this.resolveViewerMode();
  }

  // ========== Text Viewer ==========
  private async loadText() {
    try {
      if (!this.fileBlob) return;

      const text = await this.fileBlob.text();
      this.textContent = text;
      this.originalContent = text;

      this.loading = false;
    } catch (err) {
      this.error = 'errors.textLoadFailed';
      this.loading = false;
      this.snackBar.open(this.translate.instant(this.error), this.translate.instant('common.close'), { duration: 3000 });
    }
  }

  private detectLanguage(extension: string): string | null {
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'ts': 'typescript',
      'java': 'java',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'xml': 'xml',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml',
      'sh': 'bash',
      'bat': 'batch',
      'sql': 'sql'
    };

    return languageMap[extension] || null;
  }

  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) return '';
    return fileName.substring(lastDot + 1).toLowerCase();
  }

  // ========== Office Document Viewer ==========
  private async loadOfficeDocument() {
    try {
      if (!this.fileBlob) return;

      const extension = this.getFileExtension(this.data.fileName);

      if (extension === 'docx') {
        await this.loadDocx();
      } else if (extension === 'xlsx') {
        await this.loadXlsx();
      } else {
        this.error = 'errors.officeUnsupported';
        this.loading = false;
      }
    } catch (err) {
      this.error = 'errors.officeLoadFailed';
      this.loading = false;
      this.snackBar.open(this.translate.instant(this.error), this.translate.instant('common.close'), { duration: 3000 });
    }
  }

  private async loadDocx() {
    if (!this.fileBlob) return;

    const arrayBuffer = await this.fileBlob.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });

    this.officeContent = this.sanitizer.bypassSecurityTrustHtml(
      `<div class="docx-content">${result.value}</div>`
    );
    this.loading = false;
  }

  private async loadXlsx() {
    if (!this.fileBlob) return;

    const arrayBuffer = await this.fileBlob.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Convert all sheets to HTML
    let htmlContent = '';
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const html = XLSX.utils.sheet_to_html(worksheet);
      htmlContent += `<h3>${sheetName}</h3>${html}`;
    });

    this.officeContent = this.sanitizer.bypassSecurityTrustHtml(
      `<div class="xlsx-content">${htmlContent}</div>`
    );
    this.loading = false;
  }

  // ========== Actions ==========
  download() {
    // A version download is not audited, so the blob already shown can be saved as is. The current
    // document is fetched again: the viewer loaded it as an OPEN_DOCUMENT, and the trail must also
    // record this DOWNLOAD_DOCUMENT (OnlyOffice documents have no blob here at all).
    if (this.fileBlob && this.data.versionId) {
      saveAs(this.fileBlob, this.data.fileName);
    } else {
      const content$ = this.data.versionId
        ? this.documentVersions.downloadVersion(this.data.documentId, this.data.versionId)
        : this.documentApi.downloadDocument(this.data.documentId);
      content$.subscribe({
        next: (blob) => saveAs(blob, this.data.fileName),
        error: () => this.snackBar.open(
          this.translate.instant('errors.downloadFailed'),
          this.translate.instant('common.close'),
          { duration: 3000 }
        )
      });
    }
  }

  print() {
    // OnlyOffice renders the document in a cross-origin iframe that window.print()
    // cannot reach — it would print the OpenFilz shell instead of the document.
    // OnlyOffice has no API to trigger its own print, so we rely on the editor's
    // built-in Print control / Ctrl+P (and the header Print button is hidden in
    // OnlyOffice mode). For every other viewer mode window.print() prints the
    // rendered content (toolbar is hidden via the @media print styles).
    if (this.viewerMode === 'onlyoffice') {
      return;
    }
    window.print();
  }

  toggleFullscreen() {
    this.isFullscreen = !this.isFullscreen;
    if (this.isFullscreen) {
      this.dialogRef.updateSize('100vw', '100vh');
      this.dialogRef.addPanelClass('fullscreen-dialog');
    } else {
      this.dialogRef.updateSize('95vw', '95vh');
      this.dialogRef.removePanelClass('fullscreen-dialog');
    }

    // Re-render PDF if in PDF mode to adjust to new size
    if (this.viewerMode === 'pdf') {
      setTimeout(() => this.renderPdfPage(), 100);
    }
  }

  onClose() {
    // Check if content has changed (only for text viewer)
    if (this.viewerMode === 'text' && this.canEditDocument && this.textContent !== this.originalContent) {
      this.saveDocument(true); // true = close after save
    } else {
      this.dialogRef.close();
    }
  }

  get currentZoom(): number {
    return this.viewerMode === 'pdf' ? this.pdfZoom : this.imageZoom;
  }

  get showZoomControls(): boolean {
    return this.viewerMode === 'pdf' || this.viewerMode === 'image';
  }

  // ========== Text Editor ==========
  onTextContentChange(newContent: string) {
    this.textContent = newContent;
  }

  saveDocument(closeAfterSave: boolean = false) {
    if (!this.canEditDocument || !this.textContent) return;

    this.loading = true;
    // Create a Blob from the content
    const blob = new Blob([this.textContent], { type: this.data.contentType || 'text/plain' });
    const file = new File([blob], this.data.fileName, { type: this.data.contentType || 'text/plain' });

    this.documentApi.replaceDocumentContent(this.data.documentId, file).subscribe({
      next: () => {
        this.loading = false;
        // Update original content to match saved content
        this.originalContent = this.textContent;
        
        this.snackBar.open(this.translate.instant('metadataPanel.saveSuccess'), this.translate.instant('common.close'), { duration: 3000 });
        
        if (closeAfterSave) {
          this.dialogRef.close();
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('Error saving document:', err);
        this.error = 'errors.saveFailed';
        this.snackBar.open(this.translate.instant('errors.saveFailed'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  get detectedLanguage(): string {
    const extension = this.getFileExtension(this.data.fileName);
    return this.detectLanguage(extension) || 'plaintext';
  }

  get showPageNavigation(): boolean {
    return this.viewerMode === 'pdf' && this.totalPages > 1;
  }

  // ========== HTML/Markdown Preview ==========
  get canTogglePreview(): boolean {
    if (this.viewerMode !== 'text') return false;
    const ext = this.getFileExtension(this.data.fileName);
    return ext === 'html' || ext === 'md';
  }

  get previewFileType(): 'html' | 'md' | null {
    const ext = this.getFileExtension(this.data.fileName);
    if (ext === 'html') return 'html';
    if (ext === 'md') return 'md';
    return null;
  }

  togglePreviewMode() {
    this.isPreviewMode = !this.isPreviewMode;
    if (this.isPreviewMode) {
      this.renderPreview();
    }
  }

  private renderPreview() {
    const content = this.textContent || '';
    const ext = this.getFileExtension(this.data.fileName);

    if (ext === 'html') {
      this.htmlPreviewSrcdoc = this.sanitizer.bypassSecurityTrustHtml(content);
    } else if (ext === 'md') {
      const renderer = new marked.Renderer();
      renderer.heading = ({ text, depth }) => {
        const id = text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
        return `<h${depth} id="${id}">${text}</h${depth}>`;
      };
      renderer.link = ({ href, title, text }) => {
        if (href && href.startsWith('#')) {
          return `<a href="${href}" title="${title || ''}">${text}</a>`;
        }
        return `<a href="${href}" title="${title || ''}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      };
      const html = marked.parse(content, { renderer }) as string;
      this.renderedPreviewContent = this.sanitizer.bypassSecurityTrustHtml(html);
    }
  }

  onPreviewClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Handle anchor links within the document
    if (href.startsWith('#')) {
      event.preventDefault();
      const id = href.substring(1);
      const element = (event.currentTarget as HTMLElement).querySelector(`[id="${id}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }
}
