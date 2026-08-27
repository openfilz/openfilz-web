import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import * as pdfjsLib from 'pdfjs-dist';

import { DocumentApiService } from '../../services/document-api.service';
import { SettingsService } from '../../services/settings.service';
import { SignatureService } from '../../services/signature.service';
import {
  FIELD_TYPE_ICONS,
  isChoiceFieldType,
  SIGNATURE_FIELD_TYPES,
  SignatureAuthMethod,
  SignatureFieldType,
  SignatureRecipientRole,
  SignatureTemplateDTO
} from '../../models/signature.models';
import {
  clampBox, cssToPdf, defaultFieldSize, MIN_FIELD_SIZE, pdfToPercentStyle
} from '../../utils/signature-geometry';
import {
  buildCreateRequest, buildTemplateRequest, EnvelopeDraft, EnvelopeProblem, newRecipient, nextLocalId,
  PlacedField, RecipientRow, recipientColor, templateToRecipients, validateDraft
} from '../../utils/signature-envelope';
import { PDFJS_WORKER_SRC } from '../../utils/pdfjs-worker';
import { TemplateNameDialogComponent } from './template-name-dialog.component';
import { SealNoticeComponent } from '../../components/seal-notice/seal-notice.component';

export interface RequestSignatureDialogData {
  documentId: string;
  documentName: string;
}

type DragMode = 'place' | 'move' | 'resize';

interface DragState {
  mode: DragMode;
  /** Field type being placed (mode = place). */
  type?: SignatureFieldType;
  /** Field being moved / resized. */
  field?: PlacedField;
  recipient: number;
  /** Pointer offset inside the field at drag start, as a fraction of the page (mode = move). */
  offX: number;
  offY: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

/**
 * e-Sign envelope builder: recipients + fields placed on a pdf.js rendering of
 * the document. Drag from the palette to place a field for the active recipient;
 * drag a placed field to move it, its corner handle to resize it; click to edit
 * its properties. Pointer events (not HTML5 DnD) so it works on touch screens.
 */
@Component({
  selector: 'app-request-signature-dialog',
  standalone: true,
  templateUrl: './request-signature-dialog.component.html',
  styleUrls: ['./request-signature-dialog.component.css'],
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatTooltipModule, TranslatePipe,
    SealNoticeComponent
  ]
})
export class RequestSignatureDialogComponent implements OnInit, OnDestroy {
  @ViewChild('pdfCanvas') pdfCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('dialogContent') dialogContent?: ElementRef<HTMLElement>;
  @ViewChild('pdfStage') pdfStage?: ElementRef<HTMLElement>;

  private dialogRef = inject(MatDialogRef<RequestSignatureDialogComponent>);
  readonly data: RequestSignatureDialogData = inject(MAT_DIALOG_DATA);
  private documentApi = inject(DocumentApiService);
  private signatureApi = inject(SignatureService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private settingsService = inject(SettingsService);

  // ── Envelope state ──────────────────────────────────────────────────────
  title = '';
  message = '';
  expiresInDays: number | null = 30;
  sequential = false;
  reminderDays: number | null = null;

  /** Whether this deployment can honour a reminder cadence at all (Enterprise scheduler). */
  readonly remindersActive = inject(SettingsService).areSignatureRemindersActive;
  recipients: RecipientRow[] = [newRecipient()];
  activeRecipient = 0;
  templateId?: string;

  readonly fieldTypes = SIGNATURE_FIELD_TYPES;
  readonly fieldIcons = FIELD_TYPE_ICONS;
  readonly roles: SignatureRecipientRole[] = ['SIGNER', 'CC'];
  /** Filtered by what the server advertises on /settings — never offer an undeliverable channel. */
  readonly authMethods: SignatureAuthMethod[] =
      (['NONE', 'EMAIL_OTP', 'SMS_OTP'] as SignatureAuthMethod[])
          .filter(m => this.settingsService.signatureAuthMethods.includes(m));

  // ── Templates ───────────────────────────────────────────────────────────
  templates: SignatureTemplateDTO[] = [];
  selectedTemplateId: string | null = null;
  savingTemplate = false;

  // ── PDF ─────────────────────────────────────────────────────────────────
  loadingPdf = true;
  pdfError = false;
  sending = false;
  private pdfDoc?: pdfjsLib.PDFDocumentProxy;
  currentPage = 1;
  totalPages = 0;
  zoom = 1;
  readonly zoomSteps = [0.5, 0.75, 1, 1.25, 1.5, 2];
  private renderTask?: pdfjsLib.RenderTask;
  private renderSeq = 0;

  // ── Drag / selection ────────────────────────────────────────────────────
  drag: DragState | null = null;
  ghostX = 0;
  ghostY = 0;
  ghostLabel = '';
  ghostIcon = '';
  selectedField: PlacedField | null = null;
  /** Newline-joined choices for the RADIO/SELECT editor. */
  choicesText = '';
  showProblems = false;

  constructor() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }

  ngOnInit(): void {
    this.title = this.data.documentName?.replace(/\.pdf$/i, '') ?? 'Document';
    this.documentApi.downloadDocument(this.data.documentId).subscribe({
      next: async (blob) => {
        try {
          const buf = await blob.arrayBuffer();
          this.pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
          this.totalPages = this.pdfDoc.numPages;
          this.loadingPdf = false;
          setTimeout(() => this.renderPage(), 50);
        } catch {
          this.pdfError = true;
          this.loadingPdf = false;
        }
      },
      error: () => { this.pdfError = true; this.loadingPdf = false; }
    });
    this.signatureApi.listTemplates().subscribe({
      next: (t) => this.templates = t ?? [],
      error: () => { /* templates are optional */ }
    });
  }

  ngOnDestroy(): void {
    this.renderTask?.cancel();
    this.pdfDoc?.destroy().catch(() => { /* ignore */ });
  }

  // ── Recipients ──────────────────────────────────────────────────────────

  color(i: number): string { return recipientColor(i); }

  addRecipient(): void {
    this.recipients.push(newRecipient());
    this.activeRecipient = this.recipients.length - 1;
  }

  removeRecipient(i: number): void {
    if (this.recipients.length === 1) return;
    if (this.selectedField && this.recipients[i].fields.includes(this.selectedField)) this.selectedField = null;
    this.recipients.splice(i, 1);
    if (this.activeRecipient >= this.recipients.length) {
      this.activeRecipient = Math.max(0, this.recipients.length - 1);
    }
  }

  moveRecipient(i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= this.recipients.length) return;
    const [r] = this.recipients.splice(i, 1);
    this.recipients.splice(j, 0, r);
    if (this.activeRecipient === i) this.activeRecipient = j;
    else if (this.activeRecipient === j) this.activeRecipient = i;
  }

  onRoleChange(r: RecipientRow): void {
    // CC recipients carry no fields (server rule) — drop any already placed.
    if (r.role === 'CC' && r.fields.length) {
      if (this.selectedField && r.fields.includes(this.selectedField)) this.selectedField = null;
      r.fields = [];
    }
  }

  recipientLabel(r: RecipientRow, i: number): string {
    return r.name?.trim() || r.email?.trim() || `${this.translate.instant('signature.request.signer')} ${i + 1}`;
  }

  fieldCount(r: RecipientRow): number { return r.fields.length; }

  // ── Templates ───────────────────────────────────────────────────────────

  applyTemplate(id: string | null): void {
    this.selectedTemplateId = id;
    const tpl = this.templates.find(t => t.id === id);
    if (!tpl) { this.templateId = undefined; return; }
    this.templateId = tpl.id;
    this.recipients = templateToRecipients(tpl);
    if (!this.recipients.length) this.recipients = [newRecipient()];
    this.activeRecipient = 0;
    this.selectedField = null;
    if (tpl.message) this.message = tpl.message;
    if (tpl.expiresInDays) this.expiresInDays = tpl.expiresInDays;
    this.sequential = !!tpl.sequential;
  }

  saveAsTemplate(): void {
    const problems = validateDraft(this.draft).filter(p => !p.key.endsWith('invalidEmail') && !p.key.endsWith('duplicateEmail')
      && !p.key.endsWith('titleRequired') && !p.key.endsWith('phoneRequired'));
    if (problems.length) {
      this.showProblems = true;
      this.toast('signature.request.errors.fixBeforeTemplate');
      return;
    }
    this.dialog.open(TemplateNameDialogComponent, { width: '420px', data: { name: this.title } })
      .afterClosed().subscribe((name?: string) => {
        if (!name) return;
        this.savingTemplate = true;
        const req = buildTemplateRequest(name, this.draft, this.data.documentId);
        this.signatureApi.createTemplate(req).subscribe({
          next: (t) => {
            this.savingTemplate = false;
            this.templates = [t, ...this.templates];
            this.selectedTemplateId = t.id;
            this.templateId = t.id;
            this.toast('signature.templates.saved');
          },
          error: (err) => {
            this.savingTemplate = false;
            this.toastError(err, 'signature.templates.saveError');
          }
        });
      });
  }

  // ── PDF rendering ───────────────────────────────────────────────────────

  async prevPage(): Promise<void> {
    if (this.currentPage > 1) { this.currentPage--; await this.renderPage(); }
  }

  async nextPage(): Promise<void> {
    if (this.currentPage < this.totalPages) { this.currentPage++; await this.renderPage(); }
  }

  async goToPage(p: number): Promise<void> {
    const page = Math.min(Math.max(Math.floor(p || 1), 1), this.totalPages || 1);
    if (page !== this.currentPage) { this.currentPage = page; await this.renderPage(); }
  }

  async zoomIn(): Promise<void> {
    const next = this.zoomSteps.find(z => z > this.zoom + 1e-6);
    if (next) { this.zoom = next; await this.renderPage(); }
  }

  async zoomOut(): Promise<void> {
    const prev = [...this.zoomSteps].reverse().find(z => z < this.zoom - 1e-6);
    if (prev) { this.zoom = prev; await this.renderPage(); }
  }

  get canZoomIn(): boolean { return this.zoom < this.zoomSteps[this.zoomSteps.length - 1] - 1e-6; }
  get canZoomOut(): boolean { return this.zoom > this.zoomSteps[0] + 1e-6; }

  private async renderPage(): Promise<void> {
    if (!this.pdfDoc || !this.pdfCanvas) return;
    const seq = ++this.renderSeq;
    this.renderTask?.cancel();
    const page = await this.pdfDoc.getPage(this.currentPage);
    if (seq !== this.renderSeq) return;
    const viewport = page.getViewport({ scale: 1.2 * this.zoom });
    const canvas = this.pdfCanvas.nativeElement;
    const ctx = canvas.getContext('2d')!;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    this.renderTask = page.render({ canvasContext: ctx, viewport });
    try {
      await this.renderTask.promise;
    } catch {
      // cancelled by a newer render — ignore
    }
  }

  // ── Field placement: pointer-based drag (mouse + touch) ─────────────────

  /** Start placing a new field of `type` for the active recipient (drag from the palette). */
  startPlace(type: SignatureFieldType, event: PointerEvent): void {
    if (this.activeRow?.role === 'CC') {
      this.toast('signature.request.errors.ccHasFieldsShort');
      return;
    }
    event.preventDefault();
    this.drag = {
      mode: 'place', type, recipient: this.activeRecipient, offX: 0, offY: 0,
      startClientX: event.clientX, startClientY: event.clientY, moved: false
    };
    this.ghostLabel = this.translate.instant('signature.fieldTypes.' + type);
    this.ghostIcon = FIELD_TYPE_ICONS[type];
    this.ghostX = event.clientX;
    this.ghostY = event.clientY;
  }

  /** Keyboard alternative to drag: place the field centred on the current page. */
  placeAtCenter(type: SignatureFieldType): void {
    if (this.activeRow?.role === 'CC') {
      this.toast('signature.request.errors.ccHasFieldsShort');
      return;
    }
    const size = defaultFieldSize(type);
    this.addField(this.activeRecipient, type, clampBox({ x: 0.5 - size.w / 2, y: 0.5 - size.h / 2, ...size }));
  }

  startMove(recipient: number, field: PlacedField, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const rect = this.pageRect();
    if (!rect) return;
    this.activeRecipient = recipient;
    const px = (event.clientX - rect.left) / rect.width;
    const pyTop = (event.clientY - rect.top) / rect.height;
    const fieldTop = 1 - field.y - field.h;
    this.drag = {
      mode: 'move', field, recipient, offX: px - field.x, offY: pyTop - fieldTop,
      startClientX: event.clientX, startClientY: event.clientY, moved: false
    };
  }

  startResize(recipient: number, field: PlacedField, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.activeRecipient = recipient;
    this.drag = {
      mode: 'resize', field, recipient, offX: 0, offY: 0,
      startClientX: event.clientX, startClientY: event.clientY, moved: false
    };
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    event.preventDefault();
    if (Math.abs(event.clientX - d.startClientX) > 3 || Math.abs(event.clientY - d.startClientY) > 3) d.moved = true;
    if (d.mode === 'place') {
      this.ghostX = event.clientX;
      this.ghostY = event.clientY;
      this.autoScrollNearEdges(event.clientY);
      return;
    }
    const rect = this.pageRect();
    if (!rect || !d.field) return;
    const px = (event.clientX - rect.left) / rect.width;
    const pyTop = (event.clientY - rect.top) / rect.height;
    if (d.mode === 'move') {
      const top = pyTop - d.offY;
      const box = clampBox({ x: px - d.offX, y: 1 - top - d.field.h, w: d.field.w, h: d.field.h });
      Object.assign(d.field, box);
    } else {
      const fieldTop = 1 - d.field.y - d.field.h;
      const w = Math.max(MIN_FIELD_SIZE.w, Math.min(px - d.field.x, 1 - d.field.x));
      const h = Math.max(MIN_FIELD_SIZE.h, Math.min(pyTop - fieldTop, 1 - fieldTop));
      d.field.w = w;
      d.field.h = h;
      d.field.y = 1 - fieldTop - h;
    }
  }

  @HostListener('document:pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.mode === 'place') {
      const rect = this.pageRect();
      if (!rect || !d.type) return;
      // Only place when the drop lands on the PDF; a tap that never reaches it is a no-op.
      if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) {
        if (!d.moved) this.placeAtCenter(d.type);
        return;
      }
      const size = defaultFieldSize(d.type);
      const css = {
        left: event.clientX - rect.left - (size.w * rect.width) / 2,
        top: event.clientY - rect.top - (size.h * rect.height) / 2,
        width: size.w * rect.width,
        height: size.h * rect.height
      };
      this.addField(d.recipient, d.type, cssToPdf(css, rect.width, rect.height));
    } else if (d.field && !d.moved) {
      // A click (no movement) toggles the property popover.
      this.selectField(this.selectedField === d.field ? null : d.field);
    } else if (d.field) {
      Object.assign(d.field, clampBox(d.field));
    }
  }

  @HostListener('document:pointercancel')
  onPointerCancel(): void {
    this.drag = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedField) this.selectedField = null;
  }

  private addField(recipient: number, type: SignatureFieldType, box: { x: number; y: number; w: number; h: number }): void {
    const row = this.recipients[recipient];
    if (!row || row.role === 'CC') return;
    const field: PlacedField = {
      localId: nextLocalId(), type, page: this.currentPage - 1, ...box, required: true,
      options: isChoiceFieldType(type) ? { choices: [] } : undefined
    };
    row.fields.push(field);
    this.selectField(field);
  }

  removeField(r: RecipientRow, field: PlacedField, event?: Event): void {
    event?.stopPropagation();
    r.fields = r.fields.filter(f => f !== field);
    if (this.selectedField === field) this.selectedField = null;
  }

  selectField(field: PlacedField | null): void {
    this.selectedField = field;
    this.choicesText = (field?.options?.choices ?? []).join('\n');
  }

  onChoicesChange(): void {
    if (!this.selectedField) return;
    this.selectedField.options = {
      ...(this.selectedField.options ?? {}),
      choices: this.choicesText.split('\n').map(c => c.trim()).filter(Boolean)
    };
  }

  isChoice(type: SignatureFieldType): boolean { return isChoiceFieldType(type); }

  /** Overlay style for a field on the current page (hidden when on another page). */
  fieldStyle(f: PlacedField, recipient: number): Record<string, string> {
    if (f.page !== this.currentPage - 1) return { display: 'none' };
    const c = recipientColor(recipient);
    return { ...pdfToPercentStyle(f), '--rc': c };
  }

  /** Popover anchored under the selected field (percent of the page). */
  popoverStyle(f: PlacedField): Record<string, string> {
    const top = (1 - f.y) * 100;
    const left = f.x * 100;
    return { top: `calc(${Math.min(top, 80)}% + 6px)`, left: `${Math.min(left, 55)}%` };
  }

  /** Which recipient owns the selected field (for the popover colour). */
  get selectedOwner(): number {
    return this.recipients.findIndex(r => this.selectedField && r.fields.includes(this.selectedField));
  }

  fieldsOnPage(r: RecipientRow): number {
    return r.fields.filter(f => f.page === this.currentPage - 1).length;
  }

  private pageRect(): DOMRect | null {
    return this.pdfCanvas?.nativeElement.getBoundingClientRect() ?? null;
  }

  private get activeRow(): RecipientRow | undefined {
    return this.recipients[this.activeRecipient];
  }

  /** Auto-scroll the dialog body when dragging near its top/bottom edge (stacked mobile layout). */
  private autoScrollNearEdges(clientY: number): void {
    const sc = this.dialogContent?.nativeElement;
    if (!sc) return;
    const rect = sc.getBoundingClientRect();
    const edge = 56;
    if (clientY > rect.bottom - edge) sc.scrollTop += 14;
    else if (clientY < rect.top + edge) sc.scrollTop -= 14;
  }

  // ── Validation + submit ─────────────────────────────────────────────────

  get draft(): EnvelopeDraft {
    return {
      title: this.title, message: this.message, expiresInDays: this.expiresInDays,
      sequential: this.sequential, reminderDays: this.reminderDays, recipients: this.recipients,
      templateId: this.templateId
    };
  }

  get problems(): EnvelopeProblem[] {
    return validateDraft(this.draft);
  }

  get canSend(): boolean {
    return !this.sending && this.problems.length === 0;
  }

  hasProblem(recipient: number): boolean {
    return this.showProblems && this.problems.some(p => p.recipient === recipient);
  }

  send(): void {
    if (this.sending) return;
    if (this.problems.length) {
      this.showProblems = true;
      return;
    }
    this.sending = true;
    const req = buildCreateRequest(this.data.documentId, this.draft, true);
    this.signatureApi.createEnvelope(req).subscribe({
      next: (env) => {
        this.toast('signature.request.sent');
        this.dialogRef.close({ success: true, envelope: env });
      },
      error: (err) => {
        this.sending = false;
        this.toastError(err, 'signature.request.sendError');
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  private toast(key: string): void {
    this.snackBar.open(this.translate.instant(key), this.translate.instant('common.close'), { duration: 4000 });
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = SignatureService.serverMessage(err);
    const msg = this.translate.instant(SignatureService.errorKey(err, fallback));
    this.snackBar.open(detail ? `${msg} — ${detail}` : msg, this.translate.instant('common.close'), { duration: 6000 });
  }
}
