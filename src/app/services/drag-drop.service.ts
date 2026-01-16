import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FileItem, DocumentType } from '../models/document.models';

export interface DropEvent {
  items: FileItem[];
  targetFolderId: string | null;
}

@Injectable({ providedIn: 'root' })
export class DragDropService {
  private draggedItemsSubject = new BehaviorSubject<FileItem[]>([]);
  private isDraggingSubject = new BehaviorSubject<boolean>(false);
  private isExternalFileDraggingSubject = new BehaviorSubject<boolean>(false);

  readonly draggedItems$ = this.draggedItemsSubject.asObservable();
  readonly isDragging$ = this.isDraggingSubject.asObservable();
  readonly isExternalFileDragging$ = this.isExternalFileDraggingSubject.asObservable();

  private externalDragCounter = 0;
  private ngZone = inject(NgZone);

  constructor() {
    this.initGlobalDragListeners();
  }

  /**
   * Initialize global drag listeners to track external file drags at document level.
   * This allows other components (like overlays) to react to external file drags.
   */
  private initGlobalDragListeners(): void {
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('dragenter', this.onGlobalDragEnter.bind(this));
      document.addEventListener('dragleave', this.onGlobalDragLeave.bind(this));
      document.addEventListener('drop', this.onGlobalDrop.bind(this));
      document.addEventListener('dragend', this.onGlobalDragEnd.bind(this));
    });
  }

  private isExternalFileDrag(evt: DragEvent): boolean {
    if (!evt.dataTransfer?.types) {
      return false;
    }
    const types = Array.from(evt.dataTransfer.types);
    return types.includes('Files') && !types.includes('text/plain');
  }

  private onGlobalDragEnter(evt: DragEvent): void {
    if (!this.isExternalFileDrag(evt)) {
      return;
    }
    this.externalDragCounter++;
    if (this.externalDragCounter === 1) {
      this.ngZone.run(() => {
        this.isExternalFileDraggingSubject.next(true);
      });
    }
  }

  private onGlobalDragLeave(evt: DragEvent): void {
    if (!this.isExternalFileDrag(evt)) {
      return;
    }
    this.externalDragCounter--;
    if (this.externalDragCounter === 0) {
      this.ngZone.run(() => {
        this.isExternalFileDraggingSubject.next(false);
      });
    }
  }

  private onGlobalDrop(evt: DragEvent): void {
    this.externalDragCounter = 0;
    this.ngZone.run(() => {
      this.isExternalFileDraggingSubject.next(false);
    });
  }

  private onGlobalDragEnd(evt: DragEvent): void {
    this.externalDragCounter = 0;
    this.ngZone.run(() => {
      this.isExternalFileDraggingSubject.next(false);
    });
  }

  startDrag(items: FileItem[]): void {
    this.draggedItemsSubject.next(items);
    this.isDraggingSubject.next(true);
  }

  endDrag(): void {
    this.draggedItemsSubject.next([]);
    this.isDraggingSubject.next(false);
  }

  isExternalFileDragging(): boolean {
    return this.isExternalFileDraggingSubject.getValue();
  }

  getDraggedItems(): FileItem[] {
    return this.draggedItemsSubject.getValue();
  }

  isDragging(): boolean {
    return this.isDraggingSubject.getValue();
  }

  isValidDropTarget(
    targetItem: FileItem | null,
    currentFolderId: string | null
  ): boolean {
    const draggedItems = this.getDraggedItems();

    if (draggedItems.length === 0) {
      return false;
    }

    // If target is null, it means root folder - always valid unless we're already at root
    if (targetItem === null) {
      // Cannot drop into root if already at root
      if (currentFolderId === null) {
        return false;
      }
      // Check if any dragged item is being dropped into its current location
      return true;
    }

    // Cannot drop onto a file
    if (targetItem.type !== DocumentType.FOLDER) {
      return false;
    }

    // Cannot drop onto the current folder (same location)
    if (targetItem.id === currentFolderId) {
      return false;
    }

    // Cannot drop a folder onto itself
    const draggedIds = new Set(draggedItems.map(item => item.id));
    if (draggedIds.has(targetItem.id)) {
      return false;
    }

    return true;
  }
}
