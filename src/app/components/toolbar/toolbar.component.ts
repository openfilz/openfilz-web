import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { AppConfig } from '../../config/app.config';
import { TranslatePipe } from '@ngx-translate/core';
import { DocumentTemplateType } from '../../models/document.models';
import { ANY_FILE_TYPE, FILE_TYPE_CATEGORIES, FileTypeCategory, getFileTypeCategory } from '../../models/file-type-filters';
import { FileActionCategory, FileActionDescriptor, FileActionId, SHEET_CATEGORIES, STANDARD_SELECTION_ACTIONS } from '../../models/file-actions';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css'],
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    TranslatePipe,
    CommonModule
],
})
export class ToolbarComponent {
  @Input() viewMode: 'grid' | 'list' = 'grid';
  @Input() hasSelection = false;
  @Input() selectionCount = 0;

  // Page title (optional)
  @Input() pageTitle?: string;
  @Input() pageIcon?: string;

  // Feature toggles
  @Input() showUploadButton = true;
  @Input() showCreateFolderButton = true;
  @Input() showCreateDocumentButton = true;
  @Input() onlyOfficeEnabled = false;
  @Input() showStandardSelectionActions = true; // Show rename, download, move, copy, delete buttons

  // Pagination inputs
  @Input() pageIndex = 0;
  @Input() pageSize = AppConfig.pagination.defaultPageSize;
  @Input() totalItems = 0;
  @Input() isSearchResultsPage = false;

  @Output() createFolder = new EventEmitter<void>();
  @Output() uploadFiles = new EventEmitter<void>();
  @Output() viewModeChange = new EventEmitter<'grid' | 'list'>();
  @Output() openSelected = new EventEmitter<void>();
  @Output() renameSelected = new EventEmitter<void>();
  @Output() downloadSelected = new EventEmitter<void>();
  @Output() moveSelected = new EventEmitter<void>();
  @Output() copySelected = new EventEmitter<void>();
  @Output() deleteSelected = new EventEmitter<void>();
  @Output() detailsSelected = new EventEmitter<void>();
  @Output() clearSelection = new EventEmitter<void>();
  @Output() sortChange = new EventEmitter<{ sortBy: string, sortOrder: 'ASC' | 'DESC' }>();
  @Output() createDocument = new EventEmitter<DocumentTemplateType>();

  @Input() sortBy = 'name';
  @Input() sortOrder: 'ASC' | 'DESC' = 'ASC';

  // Quick file-type filter (folder view only)
  @Input() showTypeFilter = false;
  @Input() activeFileType: string = ANY_FILE_TYPE;
  @Output() fileTypeFilterChange = new EventEmitter<string>();

  readonly fileTypeCategories = FILE_TYPE_CATEGORIES;
  readonly ANY_FILE_TYPE = ANY_FILE_TYPE;

  get activeCategory(): FileTypeCategory | undefined {
    return getFileTypeCategory(this.activeFileType);
  }

  get hasTypeFilter(): boolean {
    return !!this.activeCategory;
  }

  onFileTypeSelected(fileType: string): void {
    this.fileTypeFilterChange.emit(fileType);
  }

  sortOptions = [
    { labelKey: 'common.name', value: 'name' },
    { labelKey: 'common.dateModified', value: 'updatedAt' },
    { labelKey: 'common.size', value: 'size' },
    { labelKey: 'common.type', value: 'type' },
    { labelKey: 'common.owner', value: 'createdBy' },
    { labelKey: 'sortOptions.dateCreated', value: 'createdAt' }
  ];

  documentTypes: { type: DocumentTemplateType; labelKey: string; icon: string; className: string }[] = [
    { type: 'WORD', labelKey: 'toolbar.documentTypes.word', icon: 'description', className: 'icon-word' },
    { type: 'EXCEL', labelKey: 'toolbar.documentTypes.excel', icon: 'table_chart', className: 'icon-excel' },
    { type: 'POWERPOINT', labelKey: 'toolbar.documentTypes.powerpoint', icon: 'slideshow', className: 'icon-powerpoint' },
    { type: 'TEXT', labelKey: 'toolbar.documentTypes.text', icon: 'article', className: 'icon-text' }
  ];

  // Pagination outputs
  @Output() previousPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();
  @Output() pageSizeChange = new EventEmitter<number>();

  // Page size options from global config
  pageSizeOptions = AppConfig.pagination.pageSizeOptions;

  // Menu state for accessibility
  sortMenuOpen = false;
  pageSizeMenuOpen = false;

  // FAB state for mobile
  fabOpen = false;

  // Bottom sheet state for mobile selection actions
  bottomSheetOpen = false;

  onCreateFolder() {
    this.createFolder.emit();
  }

  onUploadFiles() {
    this.uploadFiles.emit();
  }

  // FAB methods
  toggleFab() {
    this.fabOpen = !this.fabOpen;
  }

  closeFab() {
    this.fabOpen = false;
  }

  onUploadFilesFromFab() {
    this.uploadFiles.emit();
    this.closeFab();
  }

  onCreateFolderFromFab() {
    this.createFolder.emit();
    this.closeFab();
  }

  onCreateDocument(type: DocumentTemplateType) {
    this.createDocument.emit(type);
  }

  toggleViewMode() {
    const newMode = this.viewMode === 'grid' ? 'list' : 'grid';
    this.viewModeChange.emit(newMode);
  }

  onOpenSelected() {
    this.openSelected.emit();
  }

  onRenameSelected() {
    this.renameSelected.emit();
  }

  onDownloadSelected() {
    this.downloadSelected.emit();
  }

  onMoveSelected() {
    this.moveSelected.emit();
  }

  onCopySelected() {
    this.copySelected.emit();
  }

  onDeleteSelected() {
    this.deleteSelected.emit();
  }

  onClearSelection() {
    this.clearSelection.emit();
  }

  onSortChange(sortBy: string) {
    this.sortBy = sortBy;
    this.emitSortChange();
  }

  toggleSortOrder() {
    this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
    this.emitSortChange();
  }

  private emitSortChange() {
    this.sortChange.emit({ sortBy: this.sortBy, sortOrder: this.sortOrder });
  }

  // Pagination methods
  onPreviousPage() {
    if (this.hasPreviousPage()) {
      this.previousPage.emit();
    }
  }

  onNextPage() {
    if (this.hasNextPage()) {
      this.nextPage.emit();
    }
  }

  hasPreviousPage(): boolean {
    return this.pageIndex > 0;
  }

  hasNextPage(): boolean {
    const totalPages = Math.ceil(this.totalItems / this.pageSize);
    return this.pageIndex < totalPages - 1;
  }

  getStartIndex(): number {
    return this.pageIndex * this.pageSize + 1;
  }

  getEndIndex(): number {
    return Math.min((this.pageIndex + 1) * this.pageSize, this.totalItems);
  }

  onPageSizeChange(newPageSize: number) {
    this.pageSizeChange.emit(newPageSize);
  }

  getSortLabelKey(): string {
    const option = this.sortOptions.find(opt => opt.value === this.sortBy);
    return option ? option.labelKey : 'common.name';
  }

  // Bottom sheet methods for mobile selection actions
  toggleBottomSheet(): void {
    this.bottomSheetOpen = !this.bottomSheetOpen;

    // Prevent body scroll when sheet is open
    if (this.bottomSheetOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  closeBottomSheet(): void {
    if (this.bottomSheetOpen) {
      this.bottomSheetOpen = false;
      document.body.style.overflow = '';
    }
  }

  // Selection actions are descriptor-driven so downstream forks can extend
  // the array instead of forking the templates.
  readonly selectionActionDefs: FileActionDescriptor[] = STANDARD_SELECTION_ACTIONS;
  readonly sheetCategories = SHEET_CATEGORIES;

  isActionEnabled(action: FileActionDescriptor): boolean {
    return !action.singleOnly || this.selectionCount === 1;
  }

  get primarySelectionActions(): FileActionDescriptor[] {
    return this.selectionActionDefs.filter(a => a.placement === 'primary' && this.isActionEnabled(a));
  }

  get overflowSelectionActions(): FileActionDescriptor[] {
    return this.selectionActionDefs.filter(a => a.placement === 'overflow' && this.isActionEnabled(a));
  }

  sheetActionsFor(category: FileActionCategory): FileActionDescriptor[] {
    return this.selectionActionDefs.filter(a => a.category === category);
  }

  onAction(action: FileActionId): void {
    switch (action) {
      case 'open':
        if (this.selectionCount === 1) {
          this.onOpenSelected();
        }
        break;
      case 'move':
        this.onMoveSelected();
        break;
      case 'copy':
        this.onCopySelected();
        break;
      case 'rename':
        if (this.selectionCount === 1) {
          this.onRenameSelected();
        }
        break;
      case 'details':
        if (this.selectionCount === 1) {
          this.detailsSelected.emit();
        }
        break;
      case 'download':
        this.onDownloadSelected();
        break;
      case 'delete':
        this.onDeleteSelected();
        break;
    }

    // Auto-close sheet after action
    this.closeBottomSheet();
  }

  getAvailableActionsCount(): number {
    return this.selectionActionDefs.filter(a => this.isActionEnabled(a)).length;
  }
}