import { Component, OnInit, inject } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { DocumentApiService } from '../../services/document-api.service';
import { FileGridComponent } from '../../components/file-grid/file-grid.component';
import { FileListComponent } from '../../components/file-list/file-list.component';
import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { MetadataPanelComponent } from '../../components/metadata-panel/metadata-panel.component';
import { ElementInfo, FileItem, ListFolderAndCountResponse, SearchFilters } from '../../models/document.models';
import { FileIconService } from '../../services/file-icon.service';
import { BreadcrumbService } from '../../services/breadcrumb.service';
import { AppConfig } from '../../config/app.config';
import { FileOperationsComponent } from "../../components/base/file-operations.component";
import { ActivatedRoute, Router } from "@angular/router";
import { SearchService } from "../../services/search.service";
import { MatDialog } from "@angular/material/dialog";
import { FileViewerDialogComponent } from '../../dialogs/file-viewer-dialog/file-viewer-dialog.component';
import { TranslatePipe } from '@ngx-translate/core';

import { UserPreferencesService } from '../../services/user-preferences.service';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    FileGridComponent,
    FileListComponent,
    ToolbarComponent,
    MetadataPanelComponent,
    TranslatePipe
],
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.css']
})
export class FavoritesComponent extends FileOperationsComponent implements OnInit {

  currentFilters?: SearchFilters;

  private route = inject(ActivatedRoute);
  private searchService = inject(SearchService);
  private fileIconService = inject(FileIconService);


  constructor() {
    super();
  }

  override ngOnInit() {
    this.searchService.filters$.subscribe((filters: SearchFilters | undefined) => {
      this.currentFilters = filters;
      this.loadFavorites();
    });
  }

  override loadItems() {
    this.loadFavorites();
  }

  override reloadData() {
    this.loadFavorites();
  }



  loadFavorites() {
    this.loading = true;
    this.documentApi.listFavoritesAndCount(this.pageIndex + 1, this.pageSize, this.currentFilters, this.sortBy, this.sortOrder).subscribe({
      next: (listAndCount: ListFolderAndCountResponse) => {
        this.totalItems = listAndCount.count;
        this.pageIndex = 0;
        this.populateFolderContents(listAndCount.listFolder);
      },
      error: (error) => {
        this.snackBar.open(this.translate.instant('favorites.loadError'), this.translate.instant('common.close'), { duration: 3000 });
        this.loading = false;
      }
    });
  }

  private populateFolderContents(response: ElementInfo[]) {
    this.items = response.map(item => ({
      ...item,
      selected: false,
      icon: this.fileIconService.getFileIcon(item.name, item.type)
    }));
    this.resetSelectionMode();
    this.loading = false;
  }


  onToggleFavorite(item: FileItem) {
    this.documentApi.toggleFavorite(item.id).subscribe({
      next: (isFavorited) => {
        if (!isFavorited) {
          // Item was unfavorited, remove from list
          this.items = this.items.filter(i => i.id !== item.id);
          this.snackBar.open(this.translate.instant('favorites.unfavoriteSuccess', { name: item.name }), this.translate.instant('common.close'), { duration: 2000 });
        }
      },
      error: (error) => {
        console.error('Error toggling favorite:', error);
        this.snackBar.open(this.translate.instant('favorites.unfavoriteError'), this.translate.instant('common.close'), { duration: 3000 });
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
      this.router.navigate(['/my-folder'], { queryParams: { folderId: item.id } });
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
