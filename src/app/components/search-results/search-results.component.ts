import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import { SearchService } from '../../services/search.service';
import { DocumentApiService } from '../../services/document-api.service';
import { FileIconService } from '../../services/file-icon.service';

import { FileListComponent } from '../file-list/file-list.component';
import { FileGridComponent } from '../file-grid/file-grid.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { MetadataPanelComponent } from '../metadata-panel/metadata-panel.component';
import { FileOperationsComponent } from '../base/file-operations.component';
import { FileViewerDialogComponent } from '../../dialogs/file-viewer-dialog/file-viewer-dialog.component';
import { DocumentSearchInfo, DocumentType, FileItem } from '../../models/document.models';

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
    TranslateModule
],
  templateUrl: './search-results.component.html',
  styleUrls: ['./search-results.component.css']
})
export class SearchResultsComponent extends FileOperationsComponent implements OnInit {
  searchQuery = '';
  metadataPanelOpen: boolean = false;
  selectedDocumentForMetadata?: string;

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
      this.searchQuery = params['q'];
      if (this.searchQuery) {
        this.reloadData();
      }
    });

    this.searchService.filters$.subscribe(() => {
      if (this.searchQuery) {
        this.reloadData();
      }
    });

    this.searchService.sort$.subscribe(sort => {
      this.sortBy = sort.sortBy;
      this.sortOrder = sort.sortOrder;
      if (this.searchQuery) {
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
        this.snackBar.open(`Successfully ${action === 'add to' ? 'added to' : 'removed from'} favorites`, 'Close', { duration: 3000 });
      },
      error: () => {
        this.snackBar.open(`Failed to ${action} favorites`, 'Close', { duration: 3000 });
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
