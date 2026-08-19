import { Component, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatSortModule, Sort } from '@angular/material/sort';
import { FileItem } from '../../models/document.models';
import { FileActionDescriptor, FileActionId, STANDARD_ITEM_ACTIONS } from '../../models/file-actions';
import { FileIconService } from '../../services/file-icon.service';
import { TouchDetectionService } from '../../services/touch-detection.service';
import { TranslatePipe } from '@ngx-translate/core';
import { FileDraggableDirective } from '../../directives/file-draggable.directive';
import { FolderDropZoneDirective } from '../../directives/folder-drop-zone.directive';
import { AuthImageDirective } from '../../directives/auth-image.directive';
import { DropEvent } from '../../services/drag-drop.service';

@Component({
  selector: 'app-file-list',
  standalone: true,
  templateUrl: './file-list.component.html',
  styleUrls: ['./file-list.component.css'],
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    TranslatePipe,
    FileDraggableDirective,
    FolderDropZoneDirective,
    AuthImageDirective
  ],
})
export class FileListComponent {
  @Input() items: FileItem[] = [];
  @Input() fileOver: boolean = false;
  @Input() showFavoriteButton: boolean = true; // Control favorite button visibility
  @Input() showItemActions: boolean = true; // Kebab + context menu (off in recycle bin)
  @Input() selectionCount = 0; // Number of currently selected items (multi-select hides per-item menu)
  @Input() sortBy: string = 'name';
  @Input() sortOrder: 'ASC' | 'DESC' = 'ASC';
  @Input() currentFolderId: string | null = null; // Current folder for drop zone validation

  @Output() itemClick = new EventEmitter<FileItem>();
  @Output() itemDoubleClick = new EventEmitter<FileItem>();
  @Output() selectionChange = new EventEmitter<{ item: FileItem, selected: boolean }>();
  @Output() selectAll = new EventEmitter<boolean>();
  @Output() rename = new EventEmitter<FileItem>();
  @Output() download = new EventEmitter<FileItem>();
  @Output() move = new EventEmitter<FileItem>();
  @Output() copy = new EventEmitter<FileItem>();
  @Output() delete = new EventEmitter<FileItem>();
  @Output() toggleFavorite = new EventEmitter<FileItem>();
  @Output() viewProperties = new EventEmitter<FileItem>();
  @Output() sortChange = new EventEmitter<{ sortBy: string, sortOrder: 'ASC' | 'DESC' }>();
  @Output() itemsDroppedOnFolder = new EventEmitter<DropEvent>();

  // Keyboard navigation
  focusedIndex = 0;

  get displayedColumns(): string[] {
    const columns = ['drag', 'select'];
    if (this.showFavoriteButton) {
      columns.push('favorite');
    }
    columns.push('name', 'size', 'type');
    if (this.showItemActions) {
      columns.push('actions');
    }
    return columns;
  }

  /** Per-item kebab + right-click menu: shown only when 0 or 1 items are selected. */
  get showItemMenu(): boolean {
    return this.showItemActions && this.selectionCount <= 1;
  }


  private fileIconService = inject(FileIconService);
  private touchDetectionService = inject(TouchDetectionService
  );

  constructor() { }

  get allSelected(): boolean {
    return this.items.length > 0 && this.items.every(item => item.selected);
  }

  get someSelected(): boolean {
    return this.items.some(item => item.selected);
  }

  onItemClick(item: FileItem) {
    this.itemClick.emit(item);
  }

  onItemDoubleClick(item: FileItem) {
    this.itemDoubleClick.emit(item);
  }

  onIconClick(event: Event, item: FileItem) {
    if (!this.touchDetectionService.isTouchDevice()) {
      // On desktop, let the click bubble to the row so clicking the icon
      // selects (single click) / opens (double click) like the rest of the row.
      return;
    }

    event.stopPropagation(); // Prevent parent click handler

    // On touch devices, single tap on icon = open
    // Add ripple effect
    const iconElement = event.currentTarget as HTMLElement;
    iconElement.classList.add('ripple');

    // Remove ripple class after animation completes
    setTimeout(() => {
      iconElement.classList.remove('ripple');
    }, 600);

    // Navigate immediately (same as double-click)
    this.itemDoubleClick.emit(item);
  }

  onSelectionChange(item: FileItem, selected: boolean) {
    this.selectionChange.emit({ item, selected });
  }

  // ===== Per-item actions (kebab + right-click context menu) =====

  @ViewChild('contextMenuTrigger') contextMenuTrigger?: MatMenuTrigger;
  readonly itemActions: FileActionDescriptor[] = STANDARD_ITEM_ACTIONS;
  contextMenuPosition = { x: 0, y: 0 };
  /** Item the shared actions menu currently targets (set by kebab click or right-click) */
  menuItem?: FileItem;

  onContextMenu(event: MouseEvent, item: FileItem) {
    if (!this.showItemMenu) return;
    event.preventDefault();
    event.stopPropagation();
    this.menuItem = item;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    this.contextMenuTrigger?.openMenu();
  }

  onKebabClick(event: Event, item: FileItem) {
    event.stopPropagation();
    this.menuItem = item;
  }

  onMenuAction(actionId: FileActionId) {
    const item = this.menuItem;
    if (!item) return;
    switch (actionId) {
      case 'open':
        this.itemDoubleClick.emit(item);
        break;
      case 'download':
        this.download.emit(item);
        break;
      case 'rename':
        this.rename.emit(item);
        break;
      case 'move':
        this.move.emit(item);
        break;
      case 'copy':
        this.copy.emit(item);
        break;
      case 'details':
        this.viewProperties.emit(item);
        break;
      case 'delete':
        this.delete.emit(item);
        break;
    }
  }

  onSelectAll(selected: boolean) {
    this.selectAll.emit(selected);
  }

  onRename(item: FileItem) {
    this.rename.emit(item);
  }

  onDownload(item: FileItem) {
    this.download.emit(item);
  }

  onMove(item: FileItem) {
    this.move.emit(item);
  }

  onCopy(item: FileItem) {
    this.copy.emit(item);
  }

  onDelete(item: FileItem) {
    this.delete.emit(item);
  }

  onToggleFavorite(event: Event, item: FileItem) {
    event.stopPropagation();
    this.toggleFavorite.emit(item);
  }

  onViewProperties(item: FileItem) {
    this.viewProperties.emit(item);
  }

  onItemsDropped(event: DropEvent) {
    this.itemsDroppedOnFolder.emit(event);
  }

  getFileIcon(fileName: string, type: 'FILE' | 'FOLDER'): string {
    return this.fileIconService.getFileIcon(fileName, type);
  }

  getFileColor(fileName: string, type: 'FILE' | 'FOLDER'): string {
    return this.fileIconService.getFileColor(fileName, type);
  }

  formatFileSize(bytes: number): string {
    return this.fileIconService.getFileSize(bytes);
  }

  getFileTypeFromName(fileName: string): string {
    const extension = this.fileIconService.getFileExtension(fileName).toUpperCase();
    return extension ? `${extension} File` : 'File';
  }

  getFileExtension(fileName: string): string {
    return this.fileIconService.getFileExtension(fileName);
  }

  /**
   * Handle thumbnail loading error by clearing the URL to show fallback icon
   */
  onThumbnailError(event: Event, item: FileItem) {
    item.thumbnailUrl = undefined;
  }

  onSortChange(sort: Sort) {
    this.sortChange.emit({
      sortBy: sort.active,
      sortOrder: sort.direction.toUpperCase() as 'ASC' | 'DESC'
    });
  }

  // Keyboard navigation methods
  @HostListener('keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (this.items.length === 0) return;

    const target = event.target as HTMLElement;
    // Only handle if focus is on a table row
    if (!target.classList.contains('file-row') && !target.closest('.file-row')) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveFocusDown();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveFocusUp();
        break;
      case ' ':
        event.preventDefault();
        if (this.items[this.focusedIndex]) {
          const item = this.items[this.focusedIndex];
          this.onSelectionChange(item, !item.selected);
        }
        break;
      case 'Home':
        event.preventDefault();
        this.focusedIndex = 0;
        this.focusRow(this.focusedIndex);
        break;
      case 'End':
        event.preventDefault();
        this.focusedIndex = this.items.length - 1;
        this.focusRow(this.focusedIndex);
        break;
    }
  }

  private moveFocusDown() {
    if (this.focusedIndex < this.items.length - 1) {
      this.focusedIndex++;
      this.focusRow(this.focusedIndex);
    }
  }

  private moveFocusUp() {
    if (this.focusedIndex > 0) {
      this.focusedIndex--;
      this.focusRow(this.focusedIndex);
    }
  }

  private focusRow(index: number) {
    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
      const tableElement = document.querySelector('.file-list-table');
      if (tableElement) {
        const rows = tableElement.querySelectorAll('.file-row');
        if (rows[index]) {
          (rows[index] as HTMLElement).focus();
        }
      }
    });
  }

  getTabIndex(index: number): number {
    return index === this.focusedIndex ? 0 : -1;
  }

  isFocused(index: number): boolean {
    return index === this.focusedIndex;
  }
}