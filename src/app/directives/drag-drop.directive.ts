import {Directive, EventEmitter, HostBinding, HostListener, Output} from '@angular/core';

@Directive({
  selector: '[appDragDrop]',
  standalone: true
})
export class DragDropDirective {
  @Output() filesDropped = new EventEmitter<FileList>();
  /**
   * Emitted when the drop contains at least one directory. Carries the
   * `FileSystemEntry` roots (files and folders) so the consumer can recreate the
   * local folder tree and upload each file into its matching parent folder.
   * Plain file drops (no folders) keep using `filesDropped`.
   */
  @Output() entriesDropped = new EventEmitter<FileSystemEntry[]>();
  @Output() fileOverChange = new EventEmitter<boolean>();
  @HostBinding('class.file-over') fileOver: boolean = false;

  private counter = 0;

  /**
   * Check if the drag event is from an external file (OS file system)
   * vs an internal drag operation (moving files within the app)
   */
  private isExternalFileDrag(evt: DragEvent): boolean {
    if (!evt.dataTransfer?.types) {
      return false;
    }
    // External file drags have 'Files' type
    // Internal drags have 'text/plain' (set by FileDraggableDirective)
    const types = Array.from(evt.dataTransfer.types);
    return types.includes('Files') && !types.includes('text/plain');
  }

  @HostListener('dragenter', ['$event'])
  onDragEnter(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();

    // Only show upload overlay for external file drags
    if (!this.isExternalFileDrag(evt)) {
      return;
    }

    this.counter++;
    if (!this.fileOver) {
      this.fileOver = true;
      this.fileOverChange.emit(true);
    }
  }

  @HostListener('dragover', ['$event'])
  onDragOver(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();

    // Only handle external file drags
    if (!this.isExternalFileDrag(evt)) {
      return;
    }

    this.counter--;
    if (this.counter === 0) {
      this.fileOver = false;
      this.fileOverChange.emit(false);
    }
  }

  @HostListener('drop', ['$event'])
  onDrop(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();

    // Only handle external file drops
    if (!this.isExternalFileDrag(evt)) {
      return;
    }

    this.fileOver = false;
    this.fileOverChange.emit(false);
    this.counter = 0;

    if (!evt.dataTransfer) {
      return;
    }

    // Extract FileSystemEntry roots synchronously: dataTransfer.items is cleared once
    // the event handler returns, so the references must be captured here (the async
    // directory traversal can happen later on the entries we keep).
    const entries = this.extractEntries(evt.dataTransfer);
    const hasDirectory = entries.some(entry => entry.isDirectory);

    if (hasDirectory) {
      this.entriesDropped.emit(entries);
      return;
    }

    if (evt.dataTransfer.files && evt.dataTransfer.files.length > 0) {
      this.filesDropped.emit(evt.dataTransfer.files);
    }
  }

  /**
   * Read the `FileSystemEntry` for every dropped item via `webkitGetAsEntry()`.
   * Returns an empty array in browsers that don't support the (de-facto standard)
   * Filesystem-entry API, so the caller falls back to the flat `files` list.
   */
  private extractEntries(dataTransfer: DataTransfer): FileSystemEntry[] {
    if (!dataTransfer.items) {
      return [];
    }
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind !== 'file') {
        continue;
      }
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        entries.push(entry);
      }
    }
    return entries;
  }
}
