import { Directive, HostListener, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CopyRequest, DocumentType, FileItem, MoveRequest, RenameRequest } from '../../models/document.models';
import { DocumentApiService } from '../../services/document-api.service';
import { RenameDialogComponent, RenameDialogData } from '../../dialogs/rename-dialog/rename-dialog.component';
import { FolderTreeDialogComponent } from '../../dialogs/folder-tree-dialog/folder-tree-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../dialogs/confirm-dialog/confirm-dialog.component';
import { Observable } from "rxjs";
import { AppConfig } from '../../config/app.config';
import { Router } from "@angular/router";
import { UserPreferencesService } from '../../services/user-preferences.service';
import { SettingsService } from '../../services/settings.service';
import { TranslateService } from '@ngx-translate/core';

@Directive()
export abstract class FileOperationsComponent implements OnInit {
  viewMode: 'grid' | 'list' = 'grid';
  loading = false;
  isDownloading = false;
  items: FileItem[] = [];
  totalItems = 0;
  lastSelectedIndex = -1;
  protected shiftHeld = false;
  pageSize = AppConfig.pagination.defaultPageSize;
  pageIndex = 0;
  sortBy: string = 'name';
  sortOrder: 'ASC' | 'DESC' = 'ASC';

  protected router = inject(Router);
  protected documentApi = inject(DocumentApiService);
  protected dialog = inject(MatDialog);
  protected snackBar = inject(MatSnackBar);
  protected userPreferencesService = inject(UserPreferencesService);
  protected settingsService = inject(SettingsService);
  protected translate = inject(TranslateService);

  constructor() {
    const prefs = this.userPreferencesService.getPreferences();
    this.pageSize = prefs.pageSize;
    this.sortBy = prefs.sortBy;
    this.sortOrder = prefs.sortOrder;
  }

  abstract reloadData(): void;

  ngOnInit(): void {
    // Subscribe to preferences changes to keep UI in sync
    this.userPreferencesService.preferences$.subscribe(prefs => {
      let needsReload = false;
      if (this.pageSize !== prefs.pageSize) {
        this.pageSize = prefs.pageSize;
        this.pageIndex = 0; // Reset to first page on page size change
        needsReload = true;
      }
      if (this.sortBy !== prefs.sortBy || this.sortOrder !== prefs.sortOrder) {
        this.sortBy = prefs.sortBy;
        this.sortOrder = prefs.sortOrder;
        needsReload = true;
      }

      if (needsReload) {
        this.reloadData();
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.shiftHeld = true;
    }
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.shiftHeld = false;
    }
  }

  @HostListener('window:blur')
  onWindowBlur() {
    this.shiftHeld = false;
  }

  get hasSelectedItems(): boolean {
    return this.items.some(item => item.selected);
  }

  get selectedItems(): FileItem[] {
    return this.items.filter(item => item.selected);
  }

  onViewModeChange(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
  }

  onSortChange(event: { sortBy: string, sortOrder: 'ASC' | 'DESC' }) {
    this.sortBy = event.sortBy;
    this.sortOrder = event.sortOrder;
    this.userPreferencesService.setSort(this.sortBy, this.sortOrder);
    this.reloadData();
  }

  protected applySelection(item: FileItem, selected: boolean, shiftKey: boolean): void {
    const currentIndex = this.items.indexOf(item);

    if (shiftKey && this.lastSelectedIndex >= 0 && this.lastSelectedIndex < this.items.length && currentIndex >= 0) {
      const start = Math.min(this.lastSelectedIndex, currentIndex);
      const end = Math.max(this.lastSelectedIndex, currentIndex);
      for (let i = start; i <= end; i++) {
        this.items[i].selected = selected;
      }
    } else {
      item.selected = selected;
    }

    if (currentIndex >= 0) {
      this.lastSelectedIndex = currentIndex;
    }
  }

  onItemClick(item: FileItem): void {
    const selected = this.shiftHeld ? true : !item.selected;
    this.applySelection(item, selected, this.shiftHeld);
  }

  onSelectionChange(event: { item: FileItem, selected: boolean }): void {
    this.applySelection(event.item, event.selected, this.shiftHeld);
  }

  onSelectAll(selected: boolean): void {
    this.items.forEach(item => item.selected = selected);
    this.lastSelectedIndex = -1;
  }

  onRenameItem(item: FileItem): void {
    const dialogRef = this.dialog.open(RenameDialogComponent, {
      width: '400px',
      data: { name: item.name, type: item.type } as RenameDialogData
    });

    dialogRef.afterClosed().subscribe(newName => {
      if (newName) {
        const request: RenameRequest = { newName };
        const renameObservable = item.type === 'FOLDER'
          ? this.documentApi.renameFolder(item.id, request)
          : this.documentApi.renameFile(item.id, request);

        renameObservable.subscribe({
          next: () => {
            this.snackBar.open(this.translate.instant('operations.renameSuccess'), this.translate.instant('common.close'), { duration: 3000 });
            this.reloadData();
          },
          error: () => this.snackBar.open(this.translate.instant('operations.renameError'), this.translate.instant('common.close'), { duration: 3000 })
        });
      }
    });
  }

  onDownloadItem(item: FileItem): void {
    this.isDownloading = true;
    item.selected = false;
    this.documentApi.downloadDocument(item.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.name + (item.type === 'FILE' ? '' : '.zip');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.isDownloading = false;
      },
      error: () => {
        this.snackBar.open(this.translate.instant('operations.downloadError'), this.translate.instant('common.close'), { duration: 3000 });
        this.isDownloading = false;
      }
    });
  }

  onMoveItem(item: FileItem): void {
    const dialogRef = this.dialog.open(FolderTreeDialogComponent, {
      width: '700px',
      data: { title: 'dialogs.folderTree.moveItem', actionType: 'move', excludeIds: [item.id] }
    });

    dialogRef.afterClosed().subscribe(targetFolderId => {
      if (targetFolderId !== undefined) {
        const request: MoveRequest = { documentIds: [item.id], targetFolderId: targetFolderId || undefined };
        const moveObservable = item.type === 'FOLDER'
          ? this.documentApi.moveFolders(request)
          : this.documentApi.moveFiles(request);
        moveObservable.subscribe({
          next: () => {
            this.snackBar.open(this.translate.instant('operations.moveSuccess'), this.translate.instant('common.close'), { duration: 3000 });
            this.reloadData();
          },
          error: () => this.snackBar.open(this.translate.instant('operations.moveError'), this.translate.instant('common.close'), { duration: 3000 })
        });
      }
    });
  }

  onCopyItem(item: FileItem): void {
    const dialogRef = this.dialog.open(FolderTreeDialogComponent, {
      width: '700px',
      data: { title: 'dialogs.folderTree.copyItem', actionType: 'copy', excludeIds: [] }
    });

    dialogRef.afterClosed().subscribe(targetFolderId => {
      if (targetFolderId !== undefined) {
        const request: CopyRequest = { documentIds: [item.id], targetFolderId: targetFolderId || undefined };
        const copyObservable: Observable<any> = item.type === DocumentType.FOLDER
          ? this.documentApi.copyFolders(request)
          : this.documentApi.copyFiles(request);
        copyObservable.subscribe({
          next: () => {
            this.snackBar.open(this.translate.instant('operations.copySuccess'), this.translate.instant('common.close'), { duration: 3000 });
            this.reloadData();
          },
          error: () => this.snackBar.open(this.translate.instant('operations.copyError'), this.translate.instant('common.close'), { duration: 3000 })
        });
      }
    });
  }

  onDeleteItem(item: FileItem): void {
    const isRecycleBinEnabled = this.settingsService.isRecycleBinEnabled;
    const emptyBinInterval = this.settingsService.emptyBinInterval;

    const dialogData: ConfirmDialogData = {
      title: isRecycleBinEnabled ? 'delete.deleteConfirmItem' : 'recycleBin.deleteConfirmItem',
      messageParams: { name: item.name },
      message: isRecycleBinEnabled ? 'delete.deleteConfirmItem' : 'recycleBin.deleteConfirmItem',
      details: isRecycleBinEnabled ? 'delete.deleteDetailsBin' : 'recycleBin.deleteDetails',
      detailsParams: isRecycleBinEnabled ? { emptyBinInterval: emptyBinInterval } : undefined,
      type: 'danger',
      confirmText: 'common.delete',
      cancelText: 'common.cancel'
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: dialogData
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.deleteItems([item]);
      }
    });
  }

  onDownloadSelected(): void {
    const selected = this.selectedItems;
    if (selected.length === 1) {
      this.onDownloadItem(selected[0]);
    } else if (selected.length > 1) {
      this.isDownloading = true;
      const documentIds = selected.map(item => item.id);
      this.selectedItems.forEach(item => item.selected = false);
      this.documentApi.downloadMultipleDocuments(documentIds).subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'documents.zip';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.isDownloading = false;
        },
        error: () => {
          this.snackBar.open(this.translate.instant('operations.downloadMultipleError'), this.translate.instant('common.close'), { duration: 3000 });
          this.isDownloading = false;
        }
      });
    }
  }

  onMoveSelected(): void {
    const selected = this.selectedItems;
    if (selected.length > 0) {
      const dialogRef = this.dialog.open(FolderTreeDialogComponent, {
        width: '700px',
        data: {
          title: 'dialogs.folderTree.moveItems',
          titleParams: { count: selected.length },
          actionType: 'move',
          excludeIds: selected.map(item => item.id)
        }
      });
      dialogRef.afterClosed().subscribe(targetFolderId => {
        if (targetFolderId !== undefined) {
          this.performBulkMove(selected, targetFolderId);
        }
      });
    }
  }

  onCopySelected(): void {
    const selected = this.selectedItems;
    if (selected.length > 0) {
      const dialogRef = this.dialog.open(FolderTreeDialogComponent, {
        width: '700px',
        data: {
          title: 'dialogs.folderTree.copyItems',
          titleParams: { count: selected.length },
          actionType: 'copy',
          excludeIds: []
        }
      });
      dialogRef.afterClosed().subscribe(targetFolderId => {
        if (targetFolderId !== undefined) {
          this.performBulkCopy(selected, targetFolderId);
        }
      });
    }
  }

  onRenameSelected(): void {
    if (this.selectedItems.length === 1) {
      this.onRenameItem(this.selectedItems[0]);
    }
  }

  onDeleteSelected(): void {
    const selected = this.selectedItems;
    if (selected.length > 0) {
      const isRecycleBinEnabled = this.settingsService.isRecycleBinEnabled;
      const emptyBinInterval = this.settingsService.emptyBinInterval;

      const dialogData: ConfirmDialogData = {
        title: isRecycleBinEnabled ? 'delete.deleteConfirmMessage' : 'recycleBin.deleteConfirmMessage',
        messageParams: { count: selected.length },
        message: isRecycleBinEnabled ? 'delete.deleteConfirmMessage' : 'recycleBin.deleteConfirmMessage',
        details: isRecycleBinEnabled ? 'delete.deleteDetailsBin' : 'recycleBin.deleteDetails',
        detailsParams: isRecycleBinEnabled ? { emptyBinInterval: emptyBinInterval } : undefined,
        type: 'danger',
        confirmText: 'common.delete',
        cancelText: 'common.cancel'
      };
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '450px',
        data: dialogData
      });
      dialogRef.afterClosed().subscribe(confirmed => {
        if (confirmed) {
          this.deleteItems(selected);
        }
      });
    }
  }

  private deleteItems(itemsToDelete: FileItem[]): void {
    const folders = itemsToDelete.filter(item => item.type === 'FOLDER');
    const files = itemsToDelete.filter(item => item.type === 'FILE');
    const observables = [];
    if (folders.length > 0) {
      observables.push(this.documentApi.deleteFolders({ documentIds: folders.map(f => f.id) }));
    }
    if (files.length > 0) {
      observables.push(this.documentApi.deleteFiles({ documentIds: files.map(f => f.id) }));
    }
    observables.forEach(obs => obs.subscribe({
      next: () => {
        this.snackBar.open(this.translate.instant('operations.deleteSuccess'), this.translate.instant('common.close'), { duration: 3000 });
        this.reloadData();
      },
      error: () => this.snackBar.open(this.translate.instant('operations.deleteError'), this.translate.instant('common.close'), { duration: 3000 })
    }));
  }

  private performBulkMove(itemsToMove: FileItem[], targetFolderId: string | null): void {
    const folders = itemsToMove.filter(item => item.type === 'FOLDER');
    const files = itemsToMove.filter(item => item.type === 'FILE');
    const request: MoveRequest = { documentIds: [], targetFolderId: targetFolderId || undefined };
    if (folders.length > 0) {
      this.documentApi.moveFolders({ ...request, documentIds: folders.map(f => f.id) }).subscribe(this.bulkOperationObserver('move'));
    }
    if (files.length > 0) {
      this.documentApi.moveFiles({ ...request, documentIds: files.map(f => f.id) }).subscribe(this.bulkOperationObserver('move'));
    }
  }

  private performBulkCopy(itemsToCopy: FileItem[], targetFolderId: string | null): void {
    const folders = itemsToCopy.filter(item => item.type === 'FOLDER');
    const files = itemsToCopy.filter(item => item.type === 'FILE');
    const request: CopyRequest = { documentIds: [], targetFolderId: targetFolderId || undefined };
    if (folders.length > 0) {
      this.documentApi.copyFolders({ ...request, documentIds: folders.map(f => f.id) }).subscribe(this.bulkOperationObserver('copy'));
    }
    if (files.length > 0) {
      this.documentApi.copyFiles({ ...request, documentIds: files.map(f => f.id) }).subscribe(this.bulkOperationObserver('copy'));
    }
  }

  private bulkOperationObserver(action: 'move' | 'copy') {
    const successKey = action === 'move' ? 'operations.moveMultipleSuccess' : 'operations.copyMultipleSuccess';
    const errorKey = action === 'move' ? 'operations.moveMultipleError' : 'operations.copyMultipleError';
    return {
      next: () => {
        this.snackBar.open(this.translate.instant(successKey), this.translate.instant('common.close'), { duration: 3000 });
        this.reloadData();
      },
      error: () => this.snackBar.open(this.translate.instant(errorKey), this.translate.instant('common.close'), { duration: 3000 })
    };
  }


  onClearSelection() {
    this.onSelectAll(false);
  }

  onPreviousPage() {
    if (this.pageIndex > 0) {
      this.pageIndex--;
      this.lastSelectedIndex = -1;
      this.loadItems();
    }
  }

  onNextPage() {
    const totalPages = Math.ceil(this.totalItems / this.pageSize);
    if (this.pageIndex < totalPages - 1) {
      this.pageIndex++;
      this.lastSelectedIndex = -1;
      this.loadItems();
    }
  }

  onPageSizeChange(newPageSize: number) {
    this.pageSize = newPageSize;
    this.userPreferencesService.setPageSize(newPageSize);
    this.pageIndex = 0;
    this.lastSelectedIndex = -1;
    this.loadItems();
  }

  onItemDoubleClick(item: FileItem): void {
    if (item.type === 'FOLDER') {
      this.router.navigate(['/my-folder'], { queryParams: { folderId: item.id } });
    } else {
      this.onDownloadItem(item);
    }
  }

  abstract loadItems(): void;
}
