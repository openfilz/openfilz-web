import { Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable, map, skip, take } from 'rxjs';

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';

import { SearchService } from '../../services/search.service';
import { FileIconService } from '../../services/file-icon.service';

import { FileGridComponent } from '../file-grid/file-grid.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { MetadataPanelComponent } from '../metadata-panel/metadata-panel.component';
import { FileOperationsComponent } from '../base/file-operations.component';
import { SearchRefineBarComponent } from '../search-refine-bar/search-refine-bar.component';
import { SearchResultListComponent } from '../search-result-list/search-result-list.component';
import { FileViewerDialogComponent } from '../../dialogs/file-viewer-dialog/file-viewer-dialog.component';
import { ImageGallery, ImageGalleryService, inMemoryImageGallery } from '../../services/image-gallery.service';
import { DocumentSearchInfo, DocumentType, ElementInfo, FileItem, SearchFilters, SearchScope } from '../../models/document.models';
import {
  RELEVANCE_SORT, SortOrder, countActiveFilters, findSortOption
} from '../../models/search-refine';

/** Hits fetched per request; more are loaded as the user scrolls. */
const SEARCH_PAGE_SIZE = 30;
/** Pages fetched in a row without the user scrolling, while the results do not fill the screen. */
const MAX_AUTO_PAGES = 6;
const VIEW_MODE_KEY = 'openfilz.searchViewMode';

interface ResultPage {
  items: FileItem[];
  /** Total across every page, when the back-end says (undefined: count it separately). */
  total?: number;
  hasMore: boolean;
}

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [
    FileGridComponent,
    ToolbarComponent,
    MetadataPanelComponent,
    SearchRefineBarComponent,
    SearchResultListComponent,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    TranslateModule
  ],
  templateUrl: './search-results.component.html',
  styleUrls: ['./search-results.component.css']
})
export class SearchResultsComponent extends FileOperationsComponent implements OnInit, OnDestroy {
  searchQuery = '';

  // Scope-based filter search (not text search)
  scopeMode?: SearchScope;
  scopeFolderId?: string;

  /** Every hit fetched so far, in the back-end's order; `items` holds the ones the refinements let through. */
  private loadedItems: FileItem[] = [];
  private nextPage = 1;
  hasMore = false;
  loadingMore = false;
  loadError = false;
  /** Total number of hits (undefined while unknown). */
  totalCount?: number;
  /** How long the first page took, shown next to the count. */
  searchTimeMs?: number;
  /** Bumped on every new search so late answers of a previous one are dropped. */
  private requestSeq = 0;
  private autoPages = 0;

  readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  private route = inject(ActivatedRoute);
  private imageGallery = inject(ImageGalleryService);
  private searchService = inject(SearchService);
  private fileIconService = inject(FileIconService);
  private destroyRefLocal = inject(DestroyRef);

  @ViewChild('scroller', { static: true }) private scroller?: ElementRef<HTMLElement>;
  private observer?: IntersectionObserver;
  private sentinelEl?: HTMLElement;

  /** The "load more" marker at the bottom: loading starts as it scrolls into view. */
  @ViewChild('sentinel') set sentinel(ref: ElementRef<HTMLElement> | undefined) {
    if (this.sentinelEl) {
      this.observer?.unobserve(this.sentinelEl);
    }
    this.sentinelEl = ref?.nativeElement;
    if (this.sentinelEl) {
      this.ensureObserver()?.observe(this.sentinelEl);
    }
  }

  constructor() {
    super();
    this.viewMode = this.loadViewMode();
  }

  override ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRefLocal)).subscribe(params => {
      this.searchQuery = (params['q'] || '').trim();
      this.scopeMode = params['scope'] as SearchScope | undefined;
      this.scopeFolderId = params['folderId'];
      this.applySortParams(params['sort'], params['order']);
      this.reloadData();
    });

    // The current value was just used by the first load: react to changes only
    this.searchService.filters$.pipe(skip(1), takeUntilDestroyed(this.destroyRefLocal)).subscribe(filters => {
      if (filters.scope === 'CURRENT_ONLY' && this.scopeMode && !this.searchQuery) {
        // User switched back to current folder only — go back to file explorer
        this.backToFolder();
        return;
      }
      if (!this.searchQuery && (filters.scope === 'ALL' || filters.scope === 'CURRENT_AND_SUBFOLDERS')) {
        this.scopeMode = filters.scope;
      }
      this.reloadData();
    });

    // A PDF tool run from the viewer creates / replaces documents
    this.pdfTools.documentsChanged$.pipe(takeUntilDestroyed(this.destroyRefLocal)).subscribe(() => this.reloadData());
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  // ===== State =====

  /** Full-text path: a query, or a document-insights facet (only the search index knows those). */
  get isTextSearch(): boolean {
    return !!this.searchQuery || this.hasFacetFilter;
  }

  /** The filters as the search service holds them. */
  get currentFilters(): SearchFilters {
    return this.searchService.getCurrentFilters();
  }

  /** A document-insights facet (kind / language) is set. */
  get hasFacetFilter(): boolean {
    const filters = this.currentFilters;
    return !!filters.category || !!filters.language;
  }

  get hasActiveFilters(): boolean {
    return countActiveFilters(this.currentFilters) > 0;
  }

  get relevanceAvailable(): boolean {
    return !!this.searchQuery;
  }

  // ===== Sorting =====

  private applySortParams(sort: string | undefined, order: string | undefined): void {
    const option = findSortOption(sort);
    if (option && (option.value !== RELEVANCE_SORT || this.searchQuery)) {
      this.sortBy = option.value;
      this.sortOrder = order === 'ASC' || order === 'DESC' ? order : option.defaultOrder;
      return;
    }
    if (this.searchQuery) {
      // A text query ranks its hits: best match first
      this.sortBy = RELEVANCE_SORT;
      this.sortOrder = 'DESC';
      return;
    }
    const prefs = this.userPreferencesService.getPreferences();
    const fallback = findSortOption(prefs.sortBy);
    this.sortBy = fallback && fallback.value !== RELEVANCE_SORT ? fallback.value : 'name';
    this.sortOrder = fallback ? prefs.sortOrder : 'ASC';
  }

  /** The sort lives in the URL: shareable, and Back restores it. */
  onSearchSortChange(event: { sortBy: string; sortOrder: SortOrder }): void {
    const relevance = event.sortBy === RELEVANCE_SORT;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: event.sortBy, order: relevance ? null : event.sortOrder },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  override onSortChange(event: { sortBy: string, sortOrder: 'ASC' | 'DESC' }): void {
    this.onSearchSortChange(event);
  }

  override onViewModeChange(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // preference only
    }
  }

  private loadViewMode(): 'grid' | 'list' {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      return saved === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  }

  // ===== Filters =====

  onRefineFiltersChange(filters: SearchFilters): void {
    this.searchService.updateFilters(filters);
  }

  onOpenAdvancedFilters(): void {
    this.searchService.requestAdvancedFilters();
  }

  private resetFilters(): void {
    const scope = this.currentFilters.scope;
    this.searchService.updateFilters({
      type: undefined,
      dateModified: 'any',
      owner: '',
      fileType: 'any',
      metadata: [],
      category: undefined,
      language: undefined,
      scope: this.searchQuery ? undefined : scope
    });
  }

  onClearFilters(): void {
    this.resetFilters();
  }

  /** Leave the filter-only listing for the folder it was started from. */
  backToFolder(): void {
    const queryParams: any = {};
    if (this.scopeFolderId) {
      queryParams.folderId = this.scopeFolderId;
    }
    this.router.navigate(['/my-folder'], { queryParams });
  }

  // ===== Loading =====

  override loadItems() {
    this.reloadData();
  }

  override reloadData(): void {
    this.requestSeq++;
    this.loadedItems = [];
    this.items = [];
    this.nextPage = 1;
    this.hasMore = false;
    this.loadingMore = false;
    this.loadError = false;
    this.totalCount = undefined;
    this.searchTimeMs = undefined;
    this.autoPages = 0;
    this.resetSelectionMode();
    this.scrollToTop();

    if (!this.isTextSearch && !this.scopeMode) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.fetchPage();
  }

  /** Next page (the sentinel scrolled into view, or "Load more"). */
  loadMore(fromUser = true): void {
    if (!this.hasMore || this.loading || this.loadingMore) {
      return;
    }
    if (fromUser) {
      this.autoPages = 0;
    }
    this.loadingMore = true;
    this.fetchPage();
  }

  retry(): void {
    if (this.loadedItems.length === 0) {
      this.reloadData();
    } else {
      this.loadMore();
    }
  }

  private fetchPage(): void {
    const seq = this.requestSeq;
    const page = this.nextPage;
    const started = performance.now();
    this.loadError = false;

    if (page === 1 && !this.isTextSearch && this.isAllFoldersScope) {
      // listAllFolder does not count: ask for the total alongside the first page
      this.documentApi.countAllFolder(this.currentFilters).pipe(take(1)).subscribe({
        next: count => {
          if (seq === this.requestSeq) {
            this.totalCount = count;
          }
        },
        error: () => { /* the count is informative only */ }
      });
    }

    this.requestPage(page).subscribe({
      next: result => {
        if (seq !== this.requestSeq) {
          return;
        }
        if (page === 1) {
          this.searchTimeMs = Math.round(performance.now() - started);
        }
        const known = new Set(this.loadedItems.map(i => i.id));
        this.loadedItems = [...this.loadedItems, ...result.items.filter(i => !known.has(i.id))];
        if (result.total !== undefined) {
          this.totalCount = result.total;
        }
        this.hasMore = result.hasMore;
        this.nextPage = page + 1;
        this.loading = false;
        this.loadingMore = false;
        this.items = this.loadedItems;
        this.totalItems = this.items.length;
        this.maybeAutoLoad();
      },
      error: err => {
        if (seq !== this.requestSeq) {
          return;
        }
        console.error('Search failed', err);
        this.loadError = true;
        this.loading = false;
        this.loadingMore = false;
      }
    });
  }

  private get isAllFoldersScope(): boolean {
    return this.scopeMode === 'ALL' || (this.scopeMode === 'CURRENT_AND_SUBFOLDERS' && !this.scopeFolderId);
  }

  private requestPage(page: number): Observable<ResultPage> {
    const filters = this.currentFilters;
    if (this.isTextSearch) {
      const sort = this.sortBy === RELEVANCE_SORT ? null : { field: this.sortBy, order: this.sortOrder };
      return this.searchService.searchDocuments(this.searchQuery, {
        page,
        size: SEARCH_PAGE_SIZE,
        sort,
        filters
      }).pipe(take(1), map(result => ({
        items: (result?.documents ?? []).map(doc => this.transformToFileItem(doc)),
        total: result?.totalHits ?? 0,
        hasMore: (result?.documents?.length ?? 0) > 0 && page * SEARCH_PAGE_SIZE < (result?.totalHits ?? 0)
      })));
    }
    if (this.isAllFoldersScope) {
      return this.documentApi.listAllFolderAndCount(page, SEARCH_PAGE_SIZE, filters, this.sortBy, this.sortOrder)
        .pipe(take(1), map(result => ({
          items: result.listFolder.map(item => this.transformElementToFileItem(item)),
          hasMore: result.listFolder.length === SEARCH_PAGE_SIZE
        })));
    }
    // Inside a specific folder, sub-folders included (take(1): Apollo watch queries never complete)
    const filtersWithRecursive = { ...filters, scope: 'CURRENT_AND_SUBFOLDERS' as SearchScope };
    return this.documentApi.listFolderAndCount(
      this.scopeFolderId, page, SEARCH_PAGE_SIZE, filtersWithRecursive, this.sortBy, this.sortOrder
    ).pipe(take(1), map(result => ({
      items: result.listFolder.map(item => this.transformElementToFileItem(item)),
      total: result.count,
      hasMore: page * SEARCH_PAGE_SIZE < result.count
    })));
  }

  /**
   * Keep loading while the bottom marker is on screen: the observer only reports changes, so a
   * page that does not fill a tall screen would otherwise never load the next one.
   */
  private maybeAutoLoad(): void {
    setTimeout(() => {
      if (this.hasMore && !this.loading && !this.loadingMore && this.autoPages < MAX_AUTO_PAGES && this.sentinelVisible()) {
        this.autoPages++;
        this.loadMore(false);
      }
    });
  }

  private sentinelVisible(): boolean {
    const container = this.scroller?.nativeElement;
    if (!this.sentinelEl || !container) {
      return false;
    }
    const containerRect = container.getBoundingClientRect();
    const rect = this.sentinelEl.getBoundingClientRect();
    return rect.top <= containerRect.bottom + 400;
  }

  private ensureObserver(): IntersectionObserver | undefined {
    if (this.observer || typeof IntersectionObserver === 'undefined') {
      return this.observer;
    }
    this.observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        this.loadMore(true);
      }
    }, { root: this.scroller?.nativeElement ?? null, rootMargin: '0px 0px 400px 0px' });
    return this.observer;
  }

  private scrollToTop(): void {
    this.scroller?.nativeElement.scrollTo?.({ top: 0 });
  }

  // ===== Items =====

  private transformElementToFileItem(item: ElementInfo): FileItem {
    return {
      id: item.id,
      name: item.name,
      type: item.type as DocumentType,
      contentType: item.contentType,
      size: item.size,
      icon: this.fileIconService.getFileIcon(item.name, item.type as DocumentType),
      thumbnailUrl: item.thumbnailUrl,
      favorite: item.favorite,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      createdBy: item.createdBy,
      selected: false
    };
  }

  private transformToFileItem(doc: DocumentSearchInfo): FileItem {
    const fileType = doc.extension ? DocumentType.FILE : DocumentType.FOLDER;
    return {
      id: doc.id,
      name: doc.name,
      type: fileType,
      contentType: doc.contentType,
      size: doc.size,
      icon: this.fileIconService.getFileIcon(doc.name, fileType),
      thumbnailUrl: doc.thumbnailUrl,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      createdBy: doc.createdBy,
      parentId: doc.parentId ?? null,
      contentSnippet: doc.contentSnippet,
      category: doc.category,
      selected: false
    };
  }

  onToggleFavorite(item: FileItem) {
    const action = item.favorite ? 'remove from' : 'add to';
    this.documentApi.toggleFavorite(item.id).subscribe({
      next: () => {
        item.favorite = !item.favorite;
        this.snackBar.open(this.translate.instant(action === 'add to' ? 'operations.addFavoriteSuccess' : 'operations.removeFavoriteSuccess'), this.translate.instant('common.close'), { duration: 3000 });
      },
      error: () => {
        this.snackBar.open(this.translate.instant(action === 'add to' ? 'operations.addFavoriteError' : 'operations.removeFavoriteError'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  /** Open the item's folder with the item focused. */
  onShowInFolder(item: FileItem): void {
    this.cancelPendingItemClick();
    this.closeMetadataPanel();
    this.router.navigate(['/my-folder'], { queryParams: { targetFileId: item.id } });
  }

  override onItemDoubleClick(item: FileItem) {
    // Clear the pending single-click timeout and hide the details panel
    this.cancelPendingItemClick();
    this.closeMetadataPanel();

    // Deselect the item if it was selected
    item.selected = false;

    if (item.type === 'FOLDER') {
      // Navigate to the folder in file explorer
      this.router.navigate(['/my-folder'], {
        queryParams: { folderId: item.id }
      });
    } else {
      // Open file viewer for files
      this.openFileViewer(item);
    }
  }

  private openFileViewer(item: FileItem) {
    this.dialog.open(FileViewerDialogComponent, {
      width: '95vw',
      height: '95vh',
      maxWidth: '1400px',
      maxHeight: '900px',
      panelClass: 'file-viewer-dialog-container',
      data: {
        documentId: item.id,
        fileName: item.name,
        contentType: item.contentType || '',
        fileSize: item.size,
        gallery: this.resultImages()
      }
    });
  }

  /** The images the viewer's previous / next arrows step through: those of the same results as on screen. */
  private resultImages(): ImageGallery | undefined {
    if (this.isTextSearch) {
      // The hits loaded so far, as filtered on screen
      return inMemoryImageGallery(this.items.filter(i => i.type !== 'FOLDER').map(i => ({
        documentId: i.id, fileName: i.name, contentType: i.contentType || '', fileSize: i.size
      })));
    }
    const filters = this.currentFilters;
    if (this.isAllFoldersScope) {
      return this.imageGallery.allFolders(filters, this.sortBy, this.sortOrder);
    }
    if (this.scopeMode === 'CURRENT_AND_SUBFOLDERS') {
      return this.imageGallery.folder(this.scopeFolderId, { ...filters, scope: 'CURRENT_AND_SUBFOLDERS' }, this.sortBy, this.sortOrder);
    }
    return undefined;
  }
}
