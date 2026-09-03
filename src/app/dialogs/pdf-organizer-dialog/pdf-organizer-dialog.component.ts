import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { moveItemInArray } from '@angular/cdk/drag-drop';
import { forkJoin } from 'rxjs';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFJS_WORKER_SRC } from '../../utils/pdfjs-worker';
import { DocumentApiService } from '../../services/document-api.service';
import { PdfToolsService } from '../../services/pdf-tools.service';
import { OrganizeRequest, OutputMode, PdfInfo, PdfToolResult } from '../../models/pdf-tools.models';
import { PdfGridPage, PdfPageGridComponent } from '../../components/pdf-page-grid/pdf-page-grid.component';
import { formatPageRanges, parsePageRanges } from '../../utils/pdf-page-ranges';

export interface PdfOrganizerDialogData {
  documentId: string;
  documentName: string;
}

/**
 * Visual page editor for one PDF: reorder (drag), rotate, delete, duplicate and extract pages,
 * then save as a new version of the document (default, reversible through the version history)
 * or as a new document. The model lives here (with undo / redo); the grid renders and reports.
 * Nothing touches the server until Save.
 */
@Component({
  selector: 'app-pdf-organizer-dialog',
  standalone: true,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, MatMenuModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, TranslatePipe, PdfPageGridComponent
  ],
  templateUrl: './pdf-organizer-dialog.component.html',
  styleUrls: ['./pdf-organizer-dialog.component.css']
})
export class PdfOrganizerDialogComponent implements OnInit, OnDestroy {
  readonly dialogRef = inject(MatDialogRef<PdfOrganizerDialogComponent, PdfToolResult>);
  readonly data = inject<PdfOrganizerDialogData>(MAT_DIALOG_DATA);
  private readonly pdfTools = inject(PdfToolsService);
  private readonly documentApi = inject(DocumentApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  loading = true;
  error = '';
  info?: PdfInfo;
  readonly docs = new Map<string, pdfjsLib.PDFDocumentProxy>();
  pages: PdfGridPage[] = [];
  private original = '';
  private history: PdfGridPage[][] = [];
  private future: PdfGridPage[][] = [];

  thumbWidth = 160;
  readonly minThumb = 90;
  readonly maxThumb = 320;
  rangeText = '';
  rangeError = '';
  saving = false;
  saveMode: OutputMode = 'NEW_VERSION';
  newName = '';
  acknowledgeSignature = false;
  /** Last refusal from the API, shown in the footer (a snackbar is hidden behind this dialog). */
  saveError = '';

  private keySeq = 0;

  constructor() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }

  ngOnInit(): void {
    this.newName = this.baseName + ' (edited).pdf';
    forkJoin({
      info: this.pdfTools.info(this.data.documentId),
      blob: this.documentApi.downloadDocument(this.data.documentId)
    }).subscribe({
      next: async ({ info, blob }) => {
        this.info = info;
        if (info.encrypted) {
          this.error = this.translate.instant('pdfTools.common.encryptedError');
          this.loading = false;
          return;
        }
        if (info.signed || info.activeSignatureEnvelope) {
          this.saveMode = 'NEW_DOCUMENT';
        }
        try {
          const doc = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
          this.docs.set(info.documentId, doc);
          this.pages = info.pages.map(p => ({
            key: this.nextKey(),
            sourceId: info.documentId,
            page: p.number,
            rotation: 0,
            baseRotation: p.rotation,
            width: p.width,
            height: p.height,
            selected: false
          }));
          this.original = this.snapshot();
        } catch {
          this.error = this.translate.instant('pdfTools.common.loadError');
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = this.pdfTools.errorMessage(err);
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.docs.forEach(doc => doc.destroy().catch(() => { /* ignore */ }));
    this.docs.clear();
  }

  // ── derived state ───────────────────────────────────────────────────────

  get baseName(): string {
    return this.data.documentName.replace(/\.pdf$/i, '');
  }

  get dirty(): boolean {
    return this.snapshot() !== this.original;
  }

  get selectedCount(): number {
    return this.pages.filter(p => p.selected).length;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get signed(): boolean {
    return this.info?.signed === true;
  }

  /**
   * An e-Sign envelope is still running on this PDF: the API refuses to replace its content
   * (ACTIVE_SIGNATURE_ENVELOPE), so "save as new version" is off the table until it ends.
   */
  get activeEnvelope(): boolean {
    return this.info?.activeSignatureEnvelope === true;
  }

  get canSave(): boolean {
    if (this.saving || this.pages.length === 0 || !!this.error) return false;
    if (this.saveMode === 'NEW_DOCUMENT') return this.newName.trim().length > 0;
    if (this.activeEnvelope) return false;
    if (this.signed && !this.acknowledgeSignature) return false;
    return this.dirty;
  }

  /** Switch destination; the previous refusal no longer applies. */
  setSaveMode(mode: OutputMode): void {
    if (mode === 'NEW_VERSION' && this.activeEnvelope) return;
    this.saveMode = mode;
    this.saveError = '';
  }

  private snapshot(): string {
    return JSON.stringify(this.pages.map(p => [p.page, p.rotation]));
  }

  private nextKey(): string {
    return `p${++this.keySeq}`;
  }

  // ── history ─────────────────────────────────────────────────────────────

  private commit(mutate: () => void): void {
    this.history.push(this.pages.map(p => ({ ...p })));
    if (this.history.length > 100) this.history.shift();
    this.future = [];
    mutate();
  }

  undo(): void {
    const previous = this.history.pop();
    if (!previous) return;
    this.future.push(this.pages.map(p => ({ ...p })));
    this.pages = previous;
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(this.pages.map(p => ({ ...p })));
    this.pages = next;
  }

  // ── selection ───────────────────────────────────────────────────────────

  selectAll(selected: boolean): void {
    this.pages.forEach(p => p.selected = selected);
  }

  invertSelection(): void {
    this.pages.forEach(p => p.selected = !p.selected);
  }

  selectParity(odd: boolean): void {
    this.pages.forEach((p, i) => p.selected = ((i + 1) % 2 === 1) === odd);
  }

  applyRange(): void {
    const result = parsePageRanges(this.rangeText, this.pages.length);
    if (result.error) {
      this.rangeError = this.translate.instant('pdfTools.common.invalidRange', { detail: result.error });
      return;
    }
    this.rangeError = '';
    const wanted = new Set(result.pages);
    this.pages.forEach((p, i) => p.selected = wanted.has(i + 1));
  }

  onSelectionChange(): void {
    // The grid mutates `selected` in place; nothing to sync, getters re-evaluate.
  }

  // ── edits ───────────────────────────────────────────────────────────────

  private selectedPages(): PdfGridPage[] {
    return this.pages.filter(p => p.selected);
  }

  rotateSelected(delta: number): void {
    const targets = this.selectedPages();
    if (targets.length === 0) return;
    this.commit(() => targets.forEach(p => p.rotation = normalize(p.rotation + delta)));
  }

  deleteSelected(): void {
    const targets = this.selectedPages();
    if (targets.length === 0) return;
    this.commit(() => this.pages = this.pages.filter(p => !p.selected));
  }

  duplicateSelected(): void {
    const targets = this.selectedPages();
    if (targets.length === 0) return;
    this.commit(() => {
      const next: PdfGridPage[] = [];
      for (const p of this.pages) {
        next.push(p);
        if (p.selected) {
          next.push({ ...p, key: this.nextKey(), selected: false });
        }
      }
      this.pages = next;
    });
  }

  onReorder(event: { from: number; to: number }): void {
    this.commit(() => {
      const copy = [...this.pages];
      moveItemInArray(copy, event.from, event.to);
      this.pages = copy;
    });
  }

  onRotatePage(event: { page: PdfGridPage; delta: number }): void {
    this.commit(() => {
      const target = this.pages.find(p => p.key === event.page.key);
      if (target) target.rotation = normalize(target.rotation + event.delta);
    });
  }

  onRemovePage(page: PdfGridPage): void {
    this.commit(() => this.pages = this.pages.filter(p => p.key !== page.key));
  }

  onDuplicatePage(page: PdfGridPage): void {
    this.commit(() => {
      const index = this.pages.findIndex(p => p.key === page.key);
      if (index < 0) return;
      const copy = [...this.pages];
      copy.splice(index + 1, 0, { ...page, key: this.nextKey(), selected: false });
      this.pages = copy;
    });
  }

  onThumbSize(value: number): void {
    this.thumbWidth = Math.min(this.maxThumb, Math.max(this.minThumb, Number(value) || this.thumbWidth));
  }

  // ── save ────────────────────────────────────────────────────────────────

  /** Copy the selected pages (in grid order) into a new document; the original is untouched. */
  extractSelected(): void {
    const targets = this.selectedPages();
    if (targets.length === 0 || !this.info) return;
    const ranges = formatPageRanges(targets.map(p => p.page));
    const request: OrganizeRequest = {
      documentId: this.info.documentId,
      pages: targets.map(p => ({ page: p.page, rotation: p.rotation })),
      output: { mode: 'NEW_DOCUMENT', name: `${this.baseName} (p. ${ranges}).pdf`, allowDuplicateFileNames: true }
    };
    this.run(request, 'NEW_DOCUMENT');
  }

  save(): void {
    if (!this.canSave || !this.info) return;
    const request: OrganizeRequest = {
      documentId: this.info.documentId,
      pages: this.pages.map(p => ({ page: p.page, rotation: p.rotation })),
      output: this.saveMode === 'NEW_DOCUMENT'
        ? { mode: 'NEW_DOCUMENT', name: this.newName.trim(), allowDuplicateFileNames: false }
        : { mode: 'NEW_VERSION', acknowledgeSignatureLoss: this.signed ? true : undefined }
    };
    this.run(request, this.saveMode);
  }

  private run(request: OrganizeRequest, mode: OutputMode): void {
    this.saving = true;
    this.saveError = '';
    this.pdfTools.organize(request).subscribe({
      next: (response) => {
        this.saving = false;
        const output = response.outputs[0];
        const message = mode === 'NEW_VERSION'
          ? this.translate.instant('pdfTools.done.organize')
          : this.translate.instant('pdfTools.done.organizeNew', { name: output?.name ?? '' });
        this.snackBar.open(message, this.translate.instant('common.close'), { duration: 3000 });
        this.dialogRef.close({ success: true, response, mode });
      },
      error: (err) => {
        this.saving = false;
        // Shown in the footer, not only as a snackbar: the snackbar renders behind this
        // full-height dialog and the user never sees why the save was refused.
        this.saveError = this.pdfTools.errorMessage(err);
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close({ success: false });
  }
}

function normalize(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}
