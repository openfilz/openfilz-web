import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFJS_WORKER_SRC } from '../../utils/pdfjs-worker';
import { DocumentApiService } from '../../services/document-api.service';
import { PdfToolsService } from '../../services/pdf-tools.service';
import { PdfInfo, PdfToolResult, SplitMode, SplitRequest } from '../../models/pdf-tools.models';
import { PdfGridPage, PdfPageGridComponent } from '../../components/pdf-page-grid/pdf-page-grid.component';
import { chunkPages, cutPages, parsePageRanges, range } from '../../utils/pdf-page-ranges';
import { FolderTreeDialogComponent } from '../folder-tree-dialog/folder-tree-dialog.component';

export interface PdfSplitDialogData {
  documentId: string;
  documentName: string;
}

interface SplitPart {
  pages: number[];
  title?: string;
}

interface ModeOption {
  id: SplitMode;
  icon: string;
  key: string;
}

/**
 * Split one PDF into several new documents: every N pages, at pages picked on a thumbnail strip,
 * by explicit ranges, one per page, or at bookmarks — with a live preview of the resulting names.
 */
@Component({
  selector: 'app-pdf-split-dialog',
  standalone: true,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule,
    MatInputModule, MatProgressSpinnerModule, TranslatePipe, PdfPageGridComponent
  ],
  templateUrl: './pdf-split-dialog.component.html',
  styleUrls: ['./pdf-split-dialog.component.css']
})
export class PdfSplitDialogComponent implements OnInit, OnDestroy {
  readonly dialogRef = inject(MatDialogRef<PdfSplitDialogComponent, PdfToolResult>);
  readonly data = inject<PdfSplitDialogData>(MAT_DIALOG_DATA);
  private readonly pdfTools = inject(PdfToolsService);
  private readonly documentApi = inject(DocumentApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  readonly modes: ModeOption[] = [
    { id: 'EVERY_N_PAGES', icon: 'view_module', key: 'everyN' },
    { id: 'AT_PAGES', icon: 'content_cut', key: 'atPages' },
    { id: 'PAGE_RANGES', icon: 'format_list_numbered', key: 'ranges' },
    { id: 'EVERY_PAGE', icon: 'looks_one', key: 'everyPage' },
    { id: 'BY_OUTLINE_LEVEL', icon: 'bookmark', key: 'bookmarks' }
  ];

  loading = true;
  error = '';
  info?: PdfInfo;
  readonly docs = new Map<string, pdfjsLib.PDFDocumentProxy>();
  pages: PdfGridPage[] = [];
  readonly cuts = new Set<number>();

  mode: SplitMode = 'EVERY_N_PAGES';
  n = 2;
  rangesText = '';
  rangesError = '';
  outlineLevel = 1;
  namePattern = '{name}-{index}';
  createSubfolder = false;
  /** undefined = same folder as the source; null = root; string = chosen folder */
  folderId: string | null | undefined = undefined;
  saving = false;

  constructor() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }

  ngOnInit(): void {
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
        try {
          const doc = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
          this.docs.set(info.documentId, doc);
          this.pages = info.pages.map((p, i) => ({
            key: `p${i}`, sourceId: info.documentId, page: p.number, rotation: 0,
            baseRotation: p.rotation, width: p.width, height: p.height, selected: false
          }));
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

  // ── derived ─────────────────────────────────────────────────────────────

  get baseName(): string {
    return this.data.documentName.replace(/\.pdf$/i, '');
  }

  get pageCount(): number {
    return this.info?.pageCount ?? 0;
  }

  get hasOutline(): boolean {
    return (this.info?.outline ?? []).some(e => e.page != null);
  }

  get outlineLevels(): number[] {
    const max = Math.max(1, ...(this.info?.outline ?? []).filter(e => e.page != null).map(e => e.level));
    return range(1, Math.min(max, 4));
  }

  get folderChosen(): boolean {
    return this.folderId !== undefined;
  }

  /** The parts the current settings produce (empty when the settings are invalid). */
  get parts(): SplitPart[] {
    const count = this.pageCount;
    if (count < 1) return [];
    switch (this.mode) {
      case 'EVERY_N_PAGES':
        return this.n >= 1 ? chunkPages(count, Math.floor(this.n)).map(pages => ({ pages })) : [];
      case 'EVERY_PAGE':
        return chunkPages(count, 1).map(pages => ({ pages }));
      case 'AT_PAGES':
        return cutPages(count, Array.from(this.cuts).map(i => i + 1)).map(pages => ({ pages }));
      case 'PAGE_RANGES': {
        const tokens = this.rangesText.split(/[;|\n]/).map(s => s.trim()).filter(s => s.length > 0);
        const parts: SplitPart[] = [];
        for (const token of tokens) {
          const result = parsePageRanges(token, count);
          if (result.error) return [];
          parts.push({ pages: result.pages });
        }
        return parts;
      }
      case 'BY_OUTLINE_LEVEL': {
        const starts = new Map<number, string>();
        (this.info?.outline ?? [])
          .filter(e => e.level <= this.outlineLevel && e.page != null)
          .sort((a, b) => (a.page ?? 0) - (b.page ?? 0))
          .forEach(e => { if (!starts.has(e.page!)) starts.set(e.page!, e.title); });
        if (starts.size === 0) return [];
        const startPages = Array.from(starts.keys());
        const parts: SplitPart[] = [];
        if (startPages[0] > 1) parts.push({ pages: range(1, startPages[0] - 1) });
        startPages.forEach((from, i) => {
          const to = i + 1 < startPages.length ? startPages[i + 1] - 1 : count;
          parts.push({ pages: range(from, to), title: starts.get(from) });
        });
        return parts;
      }
      default:
        return [];
    }
  }

  partName(part: SplitPart, index: number, total: number): string {
    const width = String(total).length;
    const pattern = this.namePattern.trim() || '{name}-{index}';
    const title = part.title?.trim() || String(index);
    let name = pattern
      .replace(/\{name\}/g, this.baseName)
      .replace(/\{index\}/g, String(index).padStart(width, '0'))
      .replace(/\{first\}/g, String(part.pages[0]))
      .replace(/\{last\}/g, String(part.pages[part.pages.length - 1]))
      .replace(/\{title\}/g, title)
      .replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    return name;
  }

  get previewParts(): SplitPart[] {
    return this.parts;
  }

  get canSplit(): boolean {
    if (this.saving || this.loading || !!this.error || !this.info) return false;
    if (this.mode === 'PAGE_RANGES' && !!this.rangesError) return false;
    if (this.mode === 'BY_OUTLINE_LEVEL' && !this.hasOutline) return false;
    return this.parts.length >= 1;
  }

  // ── edits ───────────────────────────────────────────────────────────────

  selectMode(mode: SplitMode): void {
    this.mode = mode;
  }

  validateRanges(): void {
    const tokens = this.rangesText.split(/[;|\n]/).map(s => s.trim()).filter(s => s.length > 0);
    for (const token of tokens) {
      const result = parsePageRanges(token, this.pageCount);
      if (result.error) {
        this.rangesError = this.translate.instant('pdfTools.common.invalidRange', { detail: result.error });
        return;
      }
    }
    this.rangesError = '';
  }

  toggleCut(index: number): void {
    if (this.cuts.has(index)) this.cuts.delete(index);
    else this.cuts.add(index);
  }

  clearCuts(): void {
    this.cuts.clear();
  }

  chooseFolder(): void {
    const ref = this.dialog.open(FolderTreeDialogComponent, {
      width: '700px',
      data: { title: 'pdfTools.common.chooseFolder', actionType: 'copy', excludeIds: [] }
    });
    ref.afterClosed().subscribe((folderId: string | null | undefined) => {
      if (folderId !== undefined) this.folderId = folderId;
    });
  }

  resetFolder(): void {
    this.folderId = undefined;
  }

  // ── split ───────────────────────────────────────────────────────────────

  split(): void {
    if (!this.canSplit || !this.info) return;
    const request: SplitRequest = {
      documentId: this.info.documentId,
      mode: this.mode,
      n: this.mode === 'EVERY_N_PAGES' ? Math.floor(this.n) : null,
      pages: this.mode === 'AT_PAGES' ? Array.from(this.cuts).map(i => i + 1).sort((a, b) => a - b) : null,
      ranges: this.mode === 'PAGE_RANGES'
        ? this.rangesText.split(/[;|\n]/).map(s => s.trim()).filter(s => s.length > 0) : null,
      outlineLevel: this.mode === 'BY_OUTLINE_LEVEL' ? this.outlineLevel : null,
      output: {
        folderId: this.folderChosen ? this.folderId : undefined,
        namePattern: this.namePattern.trim() || null,
        createSubfolder: this.createSubfolder,
        allowDuplicateFileNames: false
      }
    };
    this.saving = true;
    this.pdfTools.split(request).subscribe({
      next: (response) => {
        this.saving = false;
        this.snackBar.open(this.translate.instant('pdfTools.done.split', { count: response.outputs.length }),
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
