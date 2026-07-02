import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
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
export class ToolbarComponent implements AfterViewInit, OnChanges, OnDestroy {
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

  /** Display order for the desktop contextual icon bar (danger last). */
  private readonly DESKTOP_ACTION_ORDER: FileActionId[] =
    ['open', 'download', 'rename', 'move', 'copy', 'details', 'delete'];

  /**
   * How many action icons fit inline in the toolbar; the rest spill into the
   * "More actions" overflow menu. Recomputed on resize / selection change so
   * that on a wide screen every action shows as an icon (no overflow menu),
   * and the menu only appears when horizontal space runs out.
   */
  visibleSelectionCount = Number.MAX_SAFE_INTEGER;

  @ViewChild('desktopSelection') private desktopSelectionRef?: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);

  isActionEnabled(action: FileActionDescriptor): boolean {
    return !action.singleOnly || this.selectionCount === 1;
  }

  /** All enabled desktop selection actions, in display order. */
  get desktopSelectionActions(): FileActionDescriptor[] {
    return this.DESKTOP_ACTION_ORDER
      .map(id => this.selectionActionDefs.find(a => a.id === id))
      .filter((a): a is FileActionDescriptor => !!a && this.isActionEnabled(a));
  }

  /** Actions rendered as inline icon buttons (fit within the available width). */
  get visibleSelectionActions(): FileActionDescriptor[] {
    return this.desktopSelectionActions.slice(0, this.visibleSelectionCount);
  }

  /** Actions that did not fit and are shown in the "More actions" menu. */
  get overflowSelectionActions(): FileActionDescriptor[] {
    return this.desktopSelectionActions.slice(this.visibleSelectionCount);
  }

  ngAfterViewInit(): void {
    // Re-flow the contextual action bar whenever the toolbar's width changes.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.measureSelectionOverflow());
      this.resizeObserver.observe(this.host.nativeElement);
    }
    this.scheduleMeasure();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Selection count changes the number of available actions (1 vs many).
    if (changes['hasSelection'] || changes['selectionCount']) {
      this.scheduleMeasure();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  /** Measure after the current change-detection pass has rendered the icons. */
  private scheduleMeasure(): void {
    setTimeout(() => this.measureSelectionOverflow(), 0);
  }

  /**
   * Fit as many action icons inline as the available width allows, reserving a
   * slot for the overflow button only when some actions don't fit.
   */
  private measureSelectionOverflow(): void {
    if (!this.hasSelection) return;
    const container = this.desktopSelectionRef?.nativeElement;
    if (!container) return;

    const available = container.clientWidth;
    // Hidden (mobile bottom-sheet mode) or not laid out yet → show everything.
    if (available <= 0) {
      this.setVisibleCount(Number.MAX_SAFE_INTEGER);
      return;
    }

    const total = this.desktopSelectionActions.length;
    const btn = container.querySelector('.selection-action-btn') as HTMLElement | null;
    const gap = 4; // matches .selection-actions gap
    const buttonWidth = (btn ? btn.offsetWidth : 44) + gap;
    if (buttonWidth <= 0) return;

    let fit = Math.floor(available / buttonWidth);
    if (fit >= total) {
      fit = total; // everything fits → no overflow menu
    } else {
      // Leave room for the "More actions" button (plus its divider ~9px).
      fit = Math.max(1, Math.floor((available - buttonWidth - 9) / buttonWidth));
    }
    this.setVisibleCount(fit);
  }

  private setVisibleCount(count: number): void {
    if (count !== this.visibleSelectionCount) {
      this.visibleSelectionCount = count;
      this.cdr.detectChanges();
    }
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