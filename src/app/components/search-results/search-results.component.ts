import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { SearchService } from '../../services/search.service';
import { DocumentApiService } from '../../services/document-api.service';
import { FileIconService } from '../../services/file-icon.service';

import { FileListComponent } from '../file-list/file-list.component';
import { FileGridComponent } from '../file-grid/file-grid.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { MetadataPanelComponent } from '../metadata-panel/metadata-panel.component';
import { FileOperationsComponent } from '../base/file-operations.component';
import { FileViewerDialogComponent } from '../../dialogs/file-viewer-dialog/file-viewer-dialog.component';
import { ImageGallery, ImageGalleryService, inMemoryImageGallery } from '../../services/image-gallery.service';
import { DocumentSearchInfo, DocumentType, ElementInfo, FileItem, ListFolderAndCountResponse, SearchFilters, SearchScope } from '../../models/document.models';
import { InsightFacetChipsComponent, InsightFacetField } from '../insight-facet-chips/insight-facet-chips.component';

import { UserPreferencesService } from '../../services/user-preferences.service';

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [
    FileListComponent,
    FileGridComponent,
    ToolbarComponent,
    MetadataPanelComponent,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule,
    InsightFacetChipsComponent
],
  templateUrl: './search-results.component.html',
  styleUrls: ['./search-results.component.css']
})
export class SearchResultsComponent extends FileOperationsComponent implements OnInit {
  searchQuery = '';

  // Scope-based filter search (not text search)
  scopeMode?: SearchScope;
  scopeFolderId?: string;

  // Remember the original search query so we can restore it after clearing filters
  private originalSearchQuery = '';

  private route = inject(ActivatedRoute);
  private imageGallery = inject(ImageGalleryService);
  private searchService = inject(SearchService);
  private fileIconService = inject(FileIconService);

  constructor() {
    super();
  }

  override ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.searchQuery = params['q'] || '';
      this.scopeMode = params['scope'] as SearchScope | undefined;
      this.scopeFolderId = params['folderId'];
      // Remember the search query so we can restore it after clearing filters
      if (this.searchQuery) {
        this.originalSearchQuery = this.searchQuery;
      }
      this.reloadData();
    });

    this.searchService.filters$.subscribe(filters => {
      if (filters.scope === 'CURRENT_ONLY' && this.scopeMode) {
        // User switched back to current folder only — go back to file explorer
        const queryParams: any = {};
        if (this.scopeFolderId) {
          queryParams.folderId = this.scopeFolderId;
        }
        this.router.navigate(['/my-folder'], { queryParams });
        return;
      }
      if (filters.scope === 'ALL' || filters.scope === 'CURRENT_AND_SUBFOLDERS') {
        // Update scope mode from filters and reload
        this.scopeMode = filters.scope;
        this.reloadData();
      } else if (this.scopeMode) {
        // In scope mode, react to other filter changes (metadata, type, etc.)
        this.reloadData();
      } else if (this.searchQuery) {
        this.reloadData();
      }
    });

    this.searchService.sort$.subscribe(sort => {
      this.sortBy = sort.sortBy;
      this.sortOrder = sort.sortOrder;
      if (this.searchQuery || this.scopeMode) {
        this.reloadData();
      }
    });
  }

  override onSortChange(event: { sortBy: string, sortOrder: 'ASC' | 'DESC' }): void {
    this.searchService.updateSort(event.sortBy, event.sortOrder);
  }

  override loadItems() {
    this.reloadData();
  }

  /** The filters as the search service holds them (the facet chips render from here). */
  get currentFilters(): SearchFilters {
    return this.searchService.getCurrentFilters();
  }

  /** A document-insights facet (kind / language) is set: only the search index knows those. */
  get hasFacetFilter(): boolean {
    const filters = this.currentFilters;
    return !!filters.category || !!filters.language;
  }

  /** "x" on a facet chip: drop that facet, keep everything else. */
  onRemoveFacet(field: InsightFacetField): void {
    this.searchService.updateFilters({ ...this.currentFilters, [field]: undefined });
  }

  override reloadData(): void {
    if (this.searchQuery || this.hasFacetFilter) {
      // When a search query is typed, always use searchDocuments()
      // which properly ANDs the query text with all active filters.
      // A kind / language facet lives in the search index only, so it takes the same path
      // (whole library, the scope is pinned to ALL by the filter panel).
      this.reloadSearchData();
    } else if (this.scopeMode) {
      // Filter-only mode (no query text): use scope-based search
      this.reloadScopeData();
    }
  }

  private reloadSearchData(): void {
    this.loading = true;
    this.searchService.searchDocuments(this.searchQuery).subscribe({
      next: (result) => {
        this.totalItems = result.totalHits;
        this.items = result.documents.map(doc => this.transformToFileItem(doc));
        this.resetSelectionMode();
        this.loading = false;
      },
      error: (err) => {
        console.error('Search failed', err);
        this.loading = false;
      }
    });
  }

  private reloadScopeData(): void {
    this.loading = true;
    const currentFilters = this.searchService.getCurrentFilters();

    if (this.scopeMode === 'ALL' || (this.scopeMode === 'CURRENT_AND_SUBFOLDERS' && !this.scopeFolderId)) {
      // ALL scope, or CURRENT_AND_SUBFOLDERS at root level (no folder) → search all files
      this.documentApi.listAllFolderAndCount(
        this.pageIndex + 1, this.pageSize, currentFilters, this.sortBy, this.sortOrder
      ).subscribe({
        next: (result: ListFolderAndCountResponse) => {
          this.totalItems = result.count;
          this.items = result.listFolder.map(item => this.transformElementToFileItem(item));
          this.resetSelectionMode();
          this.loading = false;
        },
        error: (err) => {
          console.error('Scope search failed', err);
          this.loading = false;
        }
      });
    } else if (this.scopeMode === 'CURRENT_AND_SUBFOLDERS') {
      // Use listFolderAndCount with recursive: true (inside a specific folder)
      const filtersWithRecursive = { ...currentFilters, scope: 'CURRENT_AND_SUBFOLDERS' as SearchScope };
      this.documentApi.listFolderAndCount(
        this.scopeFolderId, this.pageIndex + 1, this.pageSize, filtersWithRecursive, this.sortBy, this.sortOrder
      ).subscribe({
        next: (result: ListFolderAndCountResponse) => {
          this.totalItems = result.count;
          this.items = result.listFolder.map(item => this.transformElementToFileItem(item));
          this.resetSelectionMode();
          this.loading = false;
        },
        error: (err) => {
          console.error('Scope search failed', err);
          this.loading = false;
        }
      });
    }
  }

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
      selected: false
    };
  }

  get hasActiveFilters(): boolean {
    const filters = this.searchService.getCurrentFilters();
    return !!(
      filters.type ||
      (filters.dateModified && filters.dateModified !== 'any') ||
      filters.owner ||
      (filters.fileType && filters.fileType !== 'any') ||
      (filters.metadata && filters.metadata.length > 0) ||
      filters.category || filters.language
    );
  }

  private resetFilters(): void {
    this.searchService.updateFilters({
      type: undefined,
      dateModified: 'any',
      owner: '',
      fileType: 'any',
      metadata: [],
      scope: undefined
    });
  }

  onClearFilters(): void {
    // Reset local scope state
    this.scopeMode = undefined;

    if (this.originalSearchQuery) {
      // Had a search query: restore query, reset filters (which triggers reload via filters$ subscription)
      this.searchQuery = this.originalSearchQuery;
      this.resetFilters();
      // The filters$ subscription will detect searchQuery is set and call reloadSearchData()
    } else {
      // Filter-only mode: reset filters and navigate back to My Folder
      this.resetFilters();
      const queryParams: any = {};
      if (this.scopeFolderId) {
        queryParams.folderId = this.scopeFolderId;
      }
      this.router.navigate(['/my-folder'], { queryParams });
    }
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
    if (this.searchQuery || this.hasFacetFilter) {
      // Full-text results are not paged: all of them are already here
      return inMemoryImageGallery(this.items.filter(i => i.type !== 'FOLDER').map(i => ({
        documentId: i.id, fileName: i.name, contentType: i.contentType || '', fileSize: i.size
      })));
    }
    const filters = this.currentFilters;
    if (this.scopeMode === 'ALL' || (this.scopeMode === 'CURRENT_AND_SUBFOLDERS' && !this.scopeFolderId)) {
      return this.imageGallery.allFolders(filters, this.sortBy, this.sortOrder);
    }
    if (this.scopeMode === 'CURRENT_AND_SUBFOLDERS') {
      return this.imageGallery.folder(this.scopeFolderId, { ...filters, scope: 'CURRENT_AND_SUBFOLDERS' }, this.sortBy, this.sortOrder);
    }
    return undefined;
  }
}
