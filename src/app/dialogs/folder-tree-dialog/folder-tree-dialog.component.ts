import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, debounceTime } from 'rxjs';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';

import { DocumentApiService } from '../../services/document-api.service';
import { DocumentType } from '../../models/document.models';

export interface FolderTreeDialogData {
  title: string;
  titleParams?: any;
  actionType: 'move' | 'copy';
  currentFolderId?: string;
  excludeIds?: string[];
  /**
   * Only offer folders the user may write into. Set it wherever the picked folder is written to
   * later (workflow hot folders, MOVE_TO_FOLDER destinations) — offering a read-only shared folder
   * there just defers the refusal to the moment the workflow runs.
   */
  writableOnly?: boolean;
}

interface FolderItem {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

type FolderSortField = 'name' | 'updatedAt' | 'createdAt';

const SORT_STORAGE_KEY = 'folderDialogSort';

interface BreadcrumbItem {
  id?: string;
  name: string;
}

@Component({
  selector: 'app-folder-tree-dialog',
  standalone: true,
  templateUrl: './folder-tree-dialog.component.html',
  styleUrls: ['./folder-tree-dialog.component.css'],
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatMenuModule,
    MatTooltipModule,
    DatePipe,
    TranslatePipe
]
})
export class FolderTreeDialogComponent implements OnInit {
  folders: FolderItem[] = [];
  breadcrumbs: BreadcrumbItem[] = [{ name: 'dialogs.folderTree.root' }];
  currentFolderId?: string;
  selectedFolderId?: string;
  loading = true;

  totalItems = 0;
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions: number[] = [10, 20, 50, 70, 100];

  /** What the user typed; {@link appliedFilter} is what the displayed page was loaded with. */
  nameFilter = '';
  appliedFilter = '';
  sortBy: FolderSortField = 'name';
  sortOrder: 'ASC' | 'DESC' = 'ASC';
  readonly sortOptions: { value: FolderSortField; label: string }[] = [
    { value: 'name', label: 'dialogs.folderTree.sortName' },
    { value: 'updatedAt', label: 'dialogs.folderTree.sortUpdated' },
    { value: 'createdAt', label: 'dialogs.folderTree.sortCreated' }
  ];

  private readonly filterChanges = new Subject<string>();
  private loadSubscription?: Subscription;
  private destroyRef = inject(DestroyRef);

  private dialogRef = inject(MatDialogRef<FolderTreeDialogComponent>);
  readonly data = inject<FolderTreeDialogData>(MAT_DIALOG_DATA);
  private documentApi = inject(DocumentApiService);

  get direction(): 'ltr' | 'rtl' {
    return (document.documentElement.dir as 'ltr' | 'rtl') || 'ltr';
  }

  constructor() { }

  ngOnInit() {
    const storedPageSize = localStorage.getItem('folderDialogItemsPerPage');
    if (storedPageSize) {
      this.pageSize = parseInt(storedPageSize, 10);
    }
    this.restoreSort();
    this.filterChanges.pipe(
      debounceTime(300),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(value => {
      if (value.trim() !== this.appliedFilter) {
        this.loadFolders(this.currentFolderId, true);
      }
    });
    this.loadFolders();
  }

  loadFolders(folderId?: string, resetPagination: boolean = true) {
    this.loading = true;
    this.currentFolderId = folderId;

    if (resetPagination) {
      this.pageIndex = 0;
    }

    // A newer request (typing, sorting, paging) supersedes the one in flight: never let a slow
    // stale response overwrite the current page.
    this.loadSubscription?.unsubscribe();
    this.appliedFilter = this.nameFilter.trim();

    // Filter on type server-side: filtering FILEs out of an untyped page on the client left the
    // count (and so the paginator) sized on every document, with near-empty or blank pages.
    this.loadSubscription = this.documentApi.listFolderAndCount(folderId, this.pageIndex + 1, this.pageSize, { type: DocumentType.FOLDER, nameLike: this.appliedFilter || undefined }, this.sortBy, this.sortOrder, this.data.writableOnly).subscribe({
      next: (response) => {
        const visible = response.listFolder.filter(item => !this.data.excludeIds?.includes(item.id));
        // Excluded folders (e.g. the ones being moved) are hidden, so drop them from the count too.
        this.totalItems = response.count - (response.listFolder.length - visible.length);

        this.folders = visible.map(item => ({
          id: item.id,
          name: item.name,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }));
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  onFolderClick(folder: FolderItem) {
    this.selectedFolderId = folder.id;
  }

  onFolderDoubleClick(folder: FolderItem) {
    this.enterFolder(folder);
  }

  enterFolder(folder: FolderItem) {
    this.selectedFolderId = undefined;
    this.nameFilter = '';
    this.breadcrumbs.push({
      id: folder.id,
      name: folder.name
    });
    this.loadFolders(folder.id, true);
  }

  onBreadcrumbClick(index: number) {
    this.selectedFolderId = undefined;
    this.nameFilter = '';
    this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
    const targetBreadcrumb = this.breadcrumbs[index];
    this.loadFolders(targetBreadcrumb.id, true);
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    if (event.pageSize) {
      localStorage.setItem('folderDialogItemsPerPage', String(event.pageSize));
    }
    this.loadFolders(this.currentFolderId, false);
  }

  onFilterInput(value: string) {
    this.nameFilter = value;
    this.filterChanges.next(value);
  }

  /** Enter applies the filter right away instead of waiting for the debounce. */
  applyFilterNow() {
    if (this.nameFilter.trim() !== this.appliedFilter) {
      this.loadFolders(this.currentFolderId, true);
    }
  }

  clearFilter() {
    this.nameFilter = '';
    this.applyFilterNow();
  }

  get sortLabel(): string {
    return this.sortOptions.find(o => o.value === this.sortBy)?.label ?? 'dialogs.folderTree.sortName';
  }

  onSortFieldChange(field: FolderSortField) {
    if (field === this.sortBy) {
      return;
    }
    this.sortBy = field;
    // Names read naturally A→Z; dates are most useful newest first.
    this.sortOrder = field === 'name' ? 'ASC' : 'DESC';
    this.onSortChanged();
  }

  toggleSortOrder() {
    this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
    this.onSortChanged();
  }

  private onSortChanged() {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ sortBy: this.sortBy, sortOrder: this.sortOrder }));
    } catch { /* storage unavailable: the choice just isn't remembered */ }
    this.loadFolders(this.currentFolderId, true);
  }

  private restoreSort() {
    try {
      const stored = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) ?? 'null');
      if (stored && this.sortOptions.some(o => o.value === stored.sortBy)) {
        this.sortBy = stored.sortBy;
        this.sortOrder = stored.sortOrder === 'DESC' ? 'DESC' : 'ASC';
      }
    } catch { /* ignore a corrupt entry */ }
  }

  getActionButtonText(): string {
    return this.data.actionType === 'move' ? 'dialogs.folderTree.moveToHere' : 'dialogs.folderTree.copyToHere';
  }

  getActionIcon(): string {
    return this.data.actionType === 'move' ? 'drive_file_move' : 'content_copy';
  }

  getDialogIcon(): string {
    return this.data.actionType === 'move' ? 'drive_file_move' : 'content_copy';
  }

  getDialogSubtitle(): string {
    return this.data.actionType === 'move'
      ? 'dialogs.folderTree.moveSubtitle'
      : 'dialogs.folderTree.copySubtitle';
  }

  onAction() {
    this.dialogRef.close(this.selectedFolderId ?? this.currentFolderId ?? null);
  }

  onCancel() {
    this.dialogRef.close();
  }
}
