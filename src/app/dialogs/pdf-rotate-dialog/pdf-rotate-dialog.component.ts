import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PdfToolsService } from '../../services/pdf-tools.service';
import { OutputMode, PdfInfo, PdfToolResult, RotateRequest } from '../../models/pdf-tools.models';
import { parsePageRanges } from '../../utils/pdf-page-ranges';

export interface PdfRotateDialogData {
  items: { id: string; name: string }[];
}

type PagesMode = 'all' | 'odd' | 'even' | 'custom';

/**
 * Rotate all or selected pages of one or several PDFs — the quick fix for scans. In place (new
 * version) by default, or as new documents next to the originals.
 */
@Component({
  selector: 'app-pdf-rotate-dialog',
  standalone: true,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, TranslatePipe
  ],
  templateUrl: './pdf-rotate-dialog.component.html',
  styleUrls: ['./pdf-rotate-dialog.component.css']
})
export class PdfRotateDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<PdfRotateDialogComponent, PdfToolResult>);
  readonly data = inject<PdfRotateDialogData>(MAT_DIALOG_DATA);
  private readonly pdfTools = inject(PdfToolsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  readonly angles: { value: number; icon: string; key: string }[] = [
    { value: 90, icon: 'rotate_right', key: 'cw' },
    { value: 180, icon: 'sync', key: 'half' },
    { value: 270, icon: 'rotate_left', key: 'ccw' }
  ];
  readonly pageModes: PagesMode[] = ['all', 'odd', 'even', 'custom'];

  angle = 90;
  pagesMode: PagesMode = 'all';
  custom = '';
  customError = '';
  saveMode: OutputMode = 'NEW_VERSION';
  acknowledgeSignature = false;
  loading = true;
  infos: PdfInfo[] = [];
  loadErrors: string[] = [];
  saving = false;
  /** Last refusal from the API, shown in the footer (a snackbar is hidden behind this dialog). */
  saveError = '';

  ngOnInit(): void {
    forkJoin(this.data.items.map(item => this.pdfTools.info(item.id).pipe(
      catchError(err => of(this.pdfTools.errorMessage(err)))
    ))).subscribe(results => {
      for (const result of results) {
        if (typeof result === 'string') this.loadErrors.push(result);
        else if (result.encrypted) this.loadErrors.push(this.translate.instant('pdfTools.common.encryptedErrorNamed', { name: result.name }));
        else this.infos.push(result);
      }
      if (this.anySigned || this.anyActiveEnvelope) this.saveMode = 'NEW_DOCUMENT';
      this.loading = false;
    });
  }

  get single(): boolean {
    return this.data.items.length === 1;
  }

  get anySigned(): boolean {
    return this.infos.some(i => i.signed);
  }

  /**
   * At least one selected PDF is in a running e-Sign envelope: the API refuses to replace its
   * content (ACTIVE_SIGNATURE_ENVELOPE), so "save as new version" is off the table.
   */
  get anyActiveEnvelope(): boolean {
    return this.infos.some(i => i.activeSignatureEnvelope);
  }

  /** Switch destination; the previous refusal no longer applies. */
  setSaveMode(mode: OutputMode): void {
    if (mode === 'NEW_VERSION' && this.anyActiveEnvelope) return;
    this.saveMode = mode;
    this.saveError = '';
  }

  get pageCount(): number {
    return this.single ? (this.infos[0]?.pageCount ?? 0) : 0;
  }

  get canRotate(): boolean {
    if (this.saving || this.loading || this.loadErrors.length > 0 || this.infos.length === 0) return false;
    if (this.pagesMode === 'custom' && (!this.custom.trim() || this.customError)) return false;
    if (this.saveMode === 'NEW_VERSION' && this.anyActiveEnvelope) return false;
    if (this.saveMode === 'NEW_VERSION' && this.anySigned && !this.acknowledgeSignature) return false;
    return true;
  }

  validateCustom(): void {
    if (this.pagesMode !== 'custom' || !this.custom.trim()) {
      this.customError = '';
      return;
    }
    // With several documents the selection applies to each; validate against the smallest.
    const minPages = Math.min(...this.infos.map(i => i.pageCount));
    const result = parsePageRanges(this.custom, minPages);
    this.customError = result.error
      ? this.translate.instant('pdfTools.common.invalidRange', { detail: result.error })
      : '';
  }

  rotate(): void {
    if (!this.canRotate) return;
    const pages = this.pagesMode === 'all' ? null : this.pagesMode === 'custom' ? this.custom.trim() : this.pagesMode;
    const request: RotateRequest = {
      documentIds: this.infos.map(i => i.documentId),
      angle: this.angle,
      pages,
      output: this.saveMode === 'NEW_VERSION'
        ? { mode: 'NEW_VERSION', acknowledgeSignatureLoss: this.anySigned ? true : undefined }
        : { mode: 'NEW_DOCUMENT', allowDuplicateFileNames: true }
    };
    this.saving = true;
    this.saveError = '';
    this.pdfTools.rotate(request).subscribe({
      next: (response) => {
        this.saving = false;
        this.snackBar.open(this.translate.instant('pdfTools.done.rotate', { count: response.outputs.length }),
          this.translate.instant('common.close'), { duration: 3000 });
        this.dialogRef.close({ success: true, response, mode: this.saveMode });
      },
      error: (err) => {
        this.saving = false;
        // Shown in the footer, not only as a snackbar: the snackbar renders behind the
        // dialog and the user never sees why the operation was refused.
        this.saveError = this.pdfTools.errorMessage(err);
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close({ success: false });
  }
}
