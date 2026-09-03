import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PdfToolsService } from '../../services/pdf-tools.service';
import { MergeRequest, PdfInfo, PdfToolResult } from '../../models/pdf-tools.models';
import { parsePageRanges } from '../../utils/pdf-page-ranges';
import { FolderTreeDialogComponent } from '../folder-tree-dialog/folder-tree-dialog.component';
import { formatFileSize } from '../../utils/file-size.util';

export interface PdfMergeDialogData {
  items: { id: string; name: string; size?: number }[];
}

interface MergeRow {
  id: string;
  name: string;
  size?: number;
  info?: PdfInfo;
  loading: boolean;
  error?: string;
  /** Optional page selection for this source ("" = every page) */
  pages: string;
  pagesError?: string;
}

/**
 * Merge the selected PDFs into a new document: drag to order, optional page selection per file,
 * optional bookmark per file, name and destination folder.
 */
@Component({
  selector: 'app-pdf-merge-dialog',
  standalone: true,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule,
    MatInputModule, MatProgressSpinnerModule, DragDropModule, TranslatePipe
  ],
  templateUrl: './pdf-merge-dialog.component.html',
  styleUrls: ['./pdf-merge-dialog.component.css']
})
export class PdfMergeDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<PdfMergeDialogComponent, PdfToolResult>);
  readonly data = inject<PdfMergeDialogData>(MAT_DIALOG_DATA);
  private readonly pdfTools = inject(PdfToolsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  rows: MergeRow[] = [];
  addOutline = false;
  outputName = '';
  /** undefined = same folder as the first file; null = root; string = chosen folder */
  folderId: string | null | undefined = undefined;
  saving = false;

  ngOnInit(): void {
    this.rows = this.data.items.map(item => ({ id: item.id, name: item.name, size: item.size, loading: true, pages: '' }));
    this.outputName = this.rows[0]?.name.replace(/\.pdf$/i, '') + ' (merged).pdf';
    for (const row of this.rows) {
      this.pdfTools.info(row.id).subscribe({
        next: (info) => {
          row.info = info;
          row.loading = false;
          if (info.encrypted) row.error = this.translate.instant('pdfTools.common.encryptedError');
        },
        error: (err) => {
          row.loading = false;
          row.error = this.pdfTools.errorMessage(err);
        }
      });
    }
  }

  // ── derived ─────────────────────────────────────────────────────────────

  get loadingAny(): boolean {
    return this.rows.some(r => r.loading);
  }

  get totalPages(): number {
    return this.rows.reduce((sum, r) => sum + this.pagesOf(r), 0);
  }

  pagesOf(row: MergeRow): number {
    if (!row.info) return 0;
    const result = parsePageRanges(row.pages, row.info.pageCount);
    return result.error ? 0 : result.pages.length;
  }

  get canMerge(): boolean {
    return !this.saving && !this.loadingAny && this.rows.length >= 2 && this.outputName.trim().length > 0
      && this.rows.every(r => !!r.info && !r.error && !r.pagesError);
  }

  get folderChosen(): boolean {
    return this.folderId !== undefined;
  }

  size(bytes?: number): string {
    return bytes != null ? formatFileSize(bytes) : '';
  }

  // ── edits ───────────────────────────────────────────────────────────────

  validatePages(row: MergeRow): void {
    if (!row.info) return;
    const result = parsePageRanges(row.pages, row.info.pageCount);
    row.pagesError = result.error
      ? this.translate.instant('pdfTools.common.invalidRange', { detail: result.error })
      : undefined;
  }

  drop(event: CdkDragDrop<MergeRow[]>): void {
    moveItemInArray(this.rows, event.previousIndex, event.currentIndex);
  }

  move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.rows.length) return;
    moveItemInArray(this.rows, index, target);
  }

  remove(index: number): void {
    if (this.rows.length <= 2) return;
    this.rows.splice(index, 1);
  }

  chooseFolder(): void {
    const ref = this.dialog.open(FolderTreeDialogComponent, {
      width: '700px',
      data: { title: 'pdfTools.common.chooseFolder', actionType: 'copy', excludeIds: [] }
    });
    ref.afterClosed().subscribe((folderId: string | null | undefined) => {
      if (folderId !== undefined) {
        this.folderId = folderId;
      }
    });
  }

  resetFolder(): void {
    this.folderId = undefined;
  }

  // ── merge ───────────────────────────────────────────────────────────────

  merge(): void {
    if (!this.canMerge) return;
    const request: MergeRequest = {
      sources: this.rows.map(r => ({ documentId: r.id, pages: r.pages.trim() || null })),
      addOutline: this.addOutline,
      output: {
        mode: 'NEW_DOCUMENT',
        folderId: this.folderChosen ? this.folderId : undefined,
        name: this.outputName.trim(),
        allowDuplicateFileNames: false
      }
    };
    this.saving = true;
    this.pdfTools.merge(request).subscribe({
      next: (response) => {
        this.saving = false;
        const output = response.outputs[0];
        this.snackBar.open(this.translate.instant('pdfTools.done.merge', { name: output?.name ?? '' }),
          this.translate.instant('common.close'), { duration: 3000 });
        this.dialogRef.close({ success: true, response, mode: 'NEW_DOCUMENT' });
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(this.pdfTools.errorMessage(err), this.translate.instant('common.close'), { duration: 5000 });
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close({ success: false });
  }
}
