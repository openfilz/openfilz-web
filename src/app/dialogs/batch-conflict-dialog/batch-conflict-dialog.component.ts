import { Component, inject } from '@angular/core';

import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import { FileIconService } from '../../services/file-icon.service';

export type ConflictAction = 'replace' | 'skip';

/** One filename collision detected before a multi-file upload. */
export interface BatchConflictItem {
  /** The file the user selected for upload. */
  file: File;
  fileName: string;
  /** Id of the existing document that would be replaced. */
  existingDocumentId: string;
  /** Size of the existing document (bytes), if known. */
  existingSize: number;
  /** Last-modified ISO timestamp of the existing document, if known. */
  existingUpdatedAt?: string;
  /** Size of the incoming file (bytes). */
  newSize: number;
}

export interface BatchConflictDialogData {
  conflicts: BatchConflictItem[];
  /** Number of non-conflicting files that will upload regardless of the choices here. */
  cleanCount: number;
}

export interface BatchConflictDecision {
  file: File;
  fileName: string;
  existingDocumentId: string;
  action: ConflictAction;
}

export interface BatchConflictDialogResult {
  decisions: BatchConflictDecision[];
}

/**
 * Batch resolution dialog shown when several uploaded files collide with existing
 * names in the target folder. Each conflict gets its own Replace / Skip toggle, with
 * "Replace all" / "Skip all" bulk shortcuts. Non-conflicting files are uploaded
 * regardless and are not listed here.
 */
@Component({
  selector: 'app-batch-conflict-dialog',
  standalone: true,
  templateUrl: './batch-conflict-dialog.component.html',
  styleUrls: ['./batch-conflict-dialog.component.css'],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    TranslateModule
  ],
})
export class BatchConflictDialogComponent {
  readonly dialogRef = inject(MatDialogRef<BatchConflictDialogComponent>);
  readonly data = inject<BatchConflictDialogData>(MAT_DIALOG_DATA);
  private readonly fileIcons = inject(FileIconService);

  /** Per-conflict chosen action, index-aligned with data.conflicts. Defaults to Replace. */
  readonly actions: ConflictAction[] = this.data.conflicts.map(() => 'replace');

  fileIcon(name: string): string {
    return this.fileIcons.getFileIcon(name, 'FILE');
  }

  iconColor(name: string): string {
    return this.fileIcons.getFileColor(name, 'FILE');
  }

  formatSize(bytes: number): string {
    return this.fileIcons.getFileSize(bytes);
  }

  get replaceCount(): number {
    return this.actions.filter(a => a === 'replace').length;
  }

  get skipCount(): number {
    return this.actions.filter(a => a === 'skip').length;
  }

  setAll(action: ConflictAction): void {
    this.actions.fill(action);
  }

  setAction(index: number, action: ConflictAction | null): void {
    if (action) {
      this.actions[index] = action;
    }
  }

  onApply(): void {
    const decisions: BatchConflictDecision[] = this.data.conflicts.map((conflict, index) => ({
      file: conflict.file,
      fileName: conflict.fileName,
      existingDocumentId: conflict.existingDocumentId,
      action: this.actions[index]
    }));
    this.dialogRef.close({ decisions } as BatchConflictDialogResult);
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }
}
