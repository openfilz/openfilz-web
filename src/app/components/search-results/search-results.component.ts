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
import { DocumentSearchInfo, DocumentType, ElementInfo, FileItem, ListFolderAndCountResponse, SearchFilters, SearchScope } from '../../models/document.models';

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
    TranslateModule
],
  templateUrl: './search-results.component.html',
  styleUrls: ['./search-results.component.css']
})
export class SearchResultsComponent extends FileOperationsComponent implements OnInit {
  searchQuery = '';
  metadataPanelOpen: boolean = false;
  selectedDocumentForMetadata?: string;

  // Scope-based filter search (not text search)
  scopeMode?: SearchScope;
  scopeFolderId?: string;

  // Remember the original search query so we can restore it after clearing filters
  private originalSearchQuery = '';

  // Click delay handling to distinguish single-click from double-click
  private clickTimeout: any = null;
  private readonly CLICK_DELAY = 250; // milliseconds

  private route = inject(ActivatedRoute);
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

  override reloadData(): void {
    if (this.searchQuery) {
      // When a search query is typed, always use searchDocuments()
      // which properly ANDs the query text with all active filters
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
      (filters.metadata && filters.metadata.length > 0)
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

  openMetadataPanel(documentId: string) {
    this.selectedDocumentForMetadata = documentId;
    this.metadataPanelOpen = true;
  }

  closeMetadataPanel() {
    this.metadataPanelOpen = false;
    this.selectedDocumentForMetadata = undefined;
  }

  onMetadataSaved() {
    this.reloadData();
  }

  onViewProperties(item: FileItem) {
    this.openMetadataPanel(item.id);
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

  override onItemClick(item: FileItem) {
    // Clear any existing timeout
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
    }

    // Capture shift state now (before the timeout fires)
    const shiftHeld = this.shiftHeld;

    // Delay the selection to allow double-click to be detected
    this.clickTimeout = setTimeout(() => {
      const selected = shiftHeld ? true : !item.selected;
      this.applySelection(item, selected, shiftHeld);
      this.clickTimeout = null;
    }, this.CLICK_DELAY);
  }

  override onItemDoubleClick(item: FileItem) {
    // Clear the pending single-click timeout
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }

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
        fileSize: item.size
      }
    });
  }
}
