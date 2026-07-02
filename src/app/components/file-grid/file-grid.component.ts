import { Component, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { FileItem } from '../../models/document.models';
import { FileActionDescriptor, FileActionId, STANDARD_ITEM_ACTIONS } from '../../models/file-actions';
import { FileIconService } from '../../services/file-icon.service';
import { TouchDetectionService } from '../../services/touch-detection.service';

import { FileDraggableDirective } from '../../directives/file-draggable.directive';
import { FolderDropZoneDirective } from '../../directives/folder-drop-zone.directive';
import { AuthImageDirective } from '../../directives/auth-image.directive';
import { DropEvent } from '../../services/drag-drop.service';

@Component({
  selector: 'app-file-grid',
  standalone: true,
  templateUrl: './file-grid.component.html',
  styleUrls: ['./file-grid.component.css'],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    TranslateModule,
    FileDraggableDirective,
    FolderDropZoneDirective,
    AuthImageDirective
  ],
})
export class FileGridComponent {
  @Input() items: FileItem[] = [];
  @Input() fileOver: boolean = false;
  @Input() showFavoriteButton: boolean = true; // Control favorite button visibility
  @Input() showItemActions: boolean = true; // Kebab + context menu (off in recycle bin)
  @Input() selectionCount = 0; // Number of currently selected items (multi-select hides per-item menu)
  @Input() currentFolderId: string | null = null; // Current folder for drop zone validation

  /** Per-item kebab + right-click menu: shown only when 0 or 1 items are selected. */
  get showItemMenu(): boolean {
    return this.showItemActions && this.selectionCount <= 1;
  }

  @Output() itemClick = new EventEmitter<FileItem>();
  @Output() itemDoubleClick = new EventEmitter<FileItem>();
  @Output() selectionChange = new EventEmitter<{ item: FileItem, selected: boolean }>();
  @Output() rename = new EventEmitter<FileItem>();
  @Output() download = new EventEmitter<FileItem>();
  @Output() move = new EventEmitter<FileItem>();
  @Output() copy = new EventEmitter<FileItem>();
  @Output() delete = new EventEmitter<FileItem>();
  @Output() toggleFavorite = new EventEmitter<FileItem>();
  @Output() viewProperties = new EventEmitter<FileItem>();
  @Output() itemsDroppedOnFolder = new EventEmitter<DropEvent>();

  // Keyboard navigation
  focusedIndex = 0;
  private gridColumns = 5; // Approximate columns, will be calculated dynamically



  private fileIconService = inject(FileIconService);
  private touchDetectionService = inject(TouchDetectionService);

  constructor() { }

  onItemClick(item: FileItem) {
    this.itemClick.emit(item);
  }

  onItemDoubleClick(item: FileItem) {
    this.itemDoubleClick.emit(item);
  }

  onIconClick(event: Event, item: FileItem) {
    if (!this.touchDetectionService.isTouchDevice()) {
      // On desktop, let the click bubble to the item box so clicking the icon
      // selects (single click) / opens (double click) like the rest of the box.
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
    event.stopPropagation(); // Prevent item click
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

  /**
   * Handle thumbnail loading error by clearing the URL to show fallback icon
   */
  onThumbnailError(event: Event, item: FileItem) {
    // Clear thumbnail URL to show fallback icon
    item.thumbnailUrl = undefined;
  }

  // Keyboard navigation methods
  @HostListener('keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (this.items.length === 0) return;

    const target = event.target as HTMLElement;
    // Only handle if focus is on a file item
    if (!target.classList.contains('file-item') && !target.closest('.file-item')) {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        this.moveFocusRight();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.moveFocusLeft();
        break;
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
        this.focusItem(this.focusedIndex);
        break;
      case 'End':
        event.preventDefault();
        this.focusedIndex = this.items.length - 1;
        this.focusItem(this.focusedIndex);
        break;
    }
  }

  private moveFocusRight() {
    if (this.focusedIndex < this.items.length - 1) {
      this.focusedIndex++;
      this.focusItem(this.focusedIndex);
    }
  }

  private moveFocusLeft() {
    if (this.focusedIndex > 0) {
      this.focusedIndex--;
      this.focusItem(this.focusedIndex);
    }
  }

  private moveFocusDown() {
    const newIndex = this.focusedIndex + this.gridColumns;
    if (newIndex < this.items.length) {
      this.focusedIndex = newIndex;
      this.focusItem(this.focusedIndex);
    } else {
      // Move to last item
      this.focusedIndex = this.items.length - 1;
      this.focusItem(this.focusedIndex);
    }
  }

  private moveFocusUp() {
    const newIndex = this.focusedIndex - this.gridColumns;
    if (newIndex >= 0) {
      this.focusedIndex = newIndex;
      this.focusItem(this.focusedIndex);
    } else {
      // Move to first item
      this.focusedIndex = 0;
      this.focusItem(this.focusedIndex);
    }
  }

  private focusItem(index: number) {
    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
      const gridElement = document.querySelector('.file-grid');
      if (gridElement) {
        const fileItems = gridElement.querySelectorAll('.file-item');
        if (fileItems[index]) {
          (fileItems[index] as HTMLElement).focus();
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