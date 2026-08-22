import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import * as pdfjsLib from 'pdfjs-dist';

import { SignatureService } from '../../services/signature.service';
import {
  ApplySignatureRequest, FIELD_TYPE_ICONS, isAutoFieldType, isImageFieldType, PublicSignatureView,
  SignatureFieldDTO, SignatureFieldValue
} from '../../models/signature.models';
import { pdfToPercentStyle } from '../../utils/signature-geometry';
import { PDFJS_WORKER_SRC } from '../../utils/pdfjs-worker';
import { APP_LANGUAGES, AppLanguage, applyDocumentLanguage, DEFAULT_LANGUAGE, findLanguage } from '../../i18n/languages';
import {
  SignaturePadDialogComponent, SignaturePadDialogData, SignaturePadResult
} from '../../dialogs/signature-pad-dialog/signature-pad-dialog.component';
import { DeclineDialogComponent } from './decline-dialog.component';

/** Local value of a field while the signer fills the document. */
export interface FieldEntry {
  value?: string;
  valueImage?: string;
}

/** High-level page state derived from the view (drives which panel is shown). */
export type SignPhase =
  | 'loading' | 'error' | 'otp' | 'waiting' | 'signing' | 'signed' | 'declined' | 'closed';

/** Scale used when rasterising pages; overlays are positioned in percent so it only affects sharpness. */
const RENDER_SCALE = 1.4;

/**
 * Public, unauthenticated signing experience: `/sign?token=…` reached from the invitation
 * email. The single-use token is the authenticator — no OIDC session, no app shell.
 *
 * Flow: mark viewed → (OTP step when required) → every page of the PDF rendered with this
 * recipient's fields as interactive overlays (other recipients' fields read-only) → Sign
 * (posts `{ fields: [...] }`) or Decline (with an optional reason).
 */
@Component({
  selector: 'app-sign',
  standalone: true,
  templateUrl: './sign.component.html',
  styleUrls: ['./sign.component.css'],
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatCheckboxModule, MatDialogModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatProgressSpinnerModule, MatRadioModule, MatSelectModule,
    MatMenuModule, MatSnackBarModule, MatTooltipModule, TranslatePipe
  ]
})
export class SignComponent implements OnInit, OnDestroy {
  @ViewChildren('pageCanvas') pageCanvases?: QueryList<ElementRef<HTMLCanvasElement>>;

  private route = inject(ActivatedRoute);
  private api = inject(SignatureService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  token = '';
  loading = true;
  /** i18n key of a fatal error (invalid / expired link). */
  error = '';
  view?: PublicSignatureView;

  // ── OTP step ────────────────────────────────────────────────────────────
  otpCode = '';
  otpSent = false;
  otpBusy = false;
  /** i18n key of the last OTP problem (403 wrong code, 410 expired, 429 too many). */
  otpError = '';

  // ── Document ────────────────────────────────────────────────────────────
  /** 0-based page indexes (one entry per rendered page). */
  pages: number[] = [];
  pdfLoading = false;
  pdfError = false;
  private pdfDoc?: pdfjsLib.PDFDocumentProxy;
  private renderGeneration = 0;

  // ── Field values ────────────────────────────────────────────────────────
  readonly entries = new Map<string, FieldEntry>();
  readonly fieldIcons = FIELD_TYPE_ICONS;
  /** Field whose inline editor is open (TEXT/NUMBER/…); null = none. */
  activeFieldId: string | null = null;

  submitting = false;
  /** True only while the sign() call is in flight (seal pipeline can take seconds). */
  signing = false;

  constructor() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    this.initLanguage();
  }

  /** Languages the signer can pick from — the invitation locale is only a starting point. */
  readonly languages = APP_LANGUAGES;
  currentLanguage: AppLanguage = APP_LANGUAGES.find(l => l.code === DEFAULT_LANGUAGE)!;

  /**
   * This page renders outside the authenticated shell, so the header's language bootstrap
   * never runs. Mirror its precedence: saved preference → browser language → English.
   */
  private initLanguage(): void {
    const saved = findLanguage(localStorage.getItem('preferredLanguage'));
    const browser = findLanguage(this.translate.getBrowserLang());
    this.applyLanguage(saved ?? browser ?? this.currentLanguage);
  }

  /** Signer-facing language switch: the recipient may not read the sender's language. */
  switchLanguage(lang: AppLanguage): void {
    this.applyLanguage(lang);
    localStorage.setItem('preferredLanguage', lang.code);
  }

  private applyLanguage(lang: AppLanguage): void {
    this.currentLanguage = lang;
    this.translate.use(lang.code);
    applyDocumentLanguage(lang.code);
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.error = 'signature.sign.missingToken';
      this.loading = false;
      return;
    }
    this.api.markViewed(this.token).subscribe({
      next: (v) => { this.loading = false; this.applyView(v); },
      error: (err) => {
        this.error = (err as HttpErrorResponse)?.status === 410
          ? 'signature.sign.linkExpired' : 'signature.sign.invalidLink';
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.renderGeneration++;
    this.pdfDoc?.destroy().catch(() => { /* ignore */ });
  }

  // ── Derived state ───────────────────────────────────────────────────────

  get phase(): SignPhase {
    if (this.loading) return 'loading';
    if (this.error || !this.view) return 'error';
    const v = this.view;
    if (v.recipientStatus === 'SIGNED') return 'signed';
    if (v.recipientStatus === 'DECLINED') return 'declined';
    if (v.envelopeStatus !== 'SENT') return 'closed';
    if (v.otpRequired && !v.otpVerified) return 'otp';
    if (!v.myTurn) return 'waiting';
    return 'signing';
  }

  /** Signer may fill fields and submit. */
  get canAct(): boolean { return this.phase === 'signing'; }

  /** Fields this recipient must / may fill (DATE_SIGNED is server-filled and excluded). */
  get editableFields(): SignatureFieldDTO[] {
    return (this.view?.fields ?? []).filter(f => !isAutoFieldType(f.type));
  }

  get requiredFields(): SignatureFieldDTO[] {
    return this.editableFields.filter(f => f.required);
  }

  get completedRequired(): number {
    return this.requiredFields.filter(f => this.isFilled(f)).length;
  }

  get allRequiredDone(): boolean {
    return this.completedRequired === this.requiredFields.length;
  }

  get progressPct(): number {
    const total = this.requiredFields.length;
    return total ? Math.round(100 * this.completedRequired / total) : 100;
  }

  get canSign(): boolean {
    return this.canAct && !this.submitting && this.allRequiredDone;
  }

  /** Fields (mine + others) located on `page`. */
  myFieldsOn(page: number): SignatureFieldDTO[] {
    return (this.view?.fields ?? []).filter(f => f.page === page);
  }

  otherFieldsOn(page: number): SignatureFieldDTO[] {
    return (this.view?.otherFields ?? []).filter(f => f.page === page);
  }

  fieldStyle(f: SignatureFieldDTO): Record<string, string> {
    return pdfToPercentStyle(f);
  }

  fieldLabel(f: SignatureFieldDTO): string {
    return f.label || this.translate.instant('signature.fieldTypes.' + f.type);
  }

  entry(f: SignatureFieldDTO): FieldEntry {
    let e = this.entries.get(f.id);
    if (!e) {
      e = {};
      this.entries.set(f.id, e);
    }
    return e;
  }

  /** A field counts as filled when it carries a usable value for its type (mirrors the server rule). */
  isFilled(f: SignatureFieldDTO): boolean {
    if (isAutoFieldType(f.type)) return true;
    const e = this.entries.get(f.id);
    if (!e) return false;
    if (isImageFieldType(f.type)) {
      if (e.valueImage) return true;
      // SIGNATURE / INITIALS also accept a typed value.
      return (f.type === 'SIGNATURE' || f.type === 'INITIALS') && !!e.value?.trim();
    }
    if (f.type === 'CHECKBOX') return f.required ? e.value === 'true' : e.value != null;
    return !!e.value?.trim();
  }

  isImage(f: SignatureFieldDTO): boolean { return isImageFieldType(f.type); }
  isAuto(f: SignatureFieldDTO): boolean { return isAutoFieldType(f.type); }
  isChecked(f: SignatureFieldDTO): boolean { return this.entries.get(f.id)?.value === 'true'; }
  isInline(f: SignatureFieldDTO): boolean {
    return f.type === 'TEXT' || f.type === 'NUMBER' || f.type === 'EMAIL' || f.type === 'PHONE';
  }
  choices(f: SignatureFieldDTO): string[] { return f.options?.choices ?? []; }

  inputType(f: SignatureFieldDTO): string {
    switch (f.type) {
      case 'NUMBER': return 'number';
      case 'EMAIL': return 'email';
      case 'PHONE': return 'tel';
      default: return 'text';
    }
  }

  /** Value rendered inside an already-filled field (mine after signing, or other recipients'). */
  displayValue(f: SignatureFieldDTO): string {
    if (f.type === 'CHECKBOX') return f.value === 'true' ? '☑' : '☐';
    return f.value ?? '';
  }

  // ── Field editing ───────────────────────────────────────────────────────

  onFieldClick(f: SignatureFieldDTO): void {
    if (!this.canAct || this.isAuto(f)) return;
    if (this.isImage(f)) {
      this.openPad(f);
    } else if (f.type === 'CHECKBOX') {
      this.toggleCheckbox(f);
    } else {
      this.activeFieldId = this.activeFieldId === f.id ? null : f.id;
    }
  }

  toggleCheckbox(f: SignatureFieldDTO): void {
    const e = this.entry(f);
    e.value = e.value === 'true' ? 'false' : 'true';
  }

  setValue(f: SignatureFieldDTO, value: string): void {
    this.entry(f).value = value;
  }

  closeEditor(): void { this.activeFieldId = null; }

  openPad(f: SignatureFieldDTO): void {
    const siblings = this.editableFields.filter(o => o.type === f.type && o.id !== f.id);
    this.dialog.open<SignaturePadDialogComponent, SignaturePadDialogData, SignaturePadResult | undefined>(
      SignaturePadDialogComponent, {
        width: '560px', maxWidth: '96vw', autoFocus: false,
        data: {
          fieldType: f.type,
          suggestedName: this.view?.recipientName || this.view?.recipientEmail,
          offerApplyToAll: siblings.length > 0,
          aspect: f.h ? f.w / f.h : undefined
        }
      }).afterClosed().subscribe(result => {
      if (!result) return;
      this.entry(f).valueImage = result.image;
      this.entry(f).value = undefined;
      if (result.applyToAll) {
        for (const s of siblings) {
          this.entry(s).valueImage = result.image;
          this.entry(s).value = undefined;
        }
      }
    });
  }

  clearField(f: SignatureFieldDTO, event?: Event): void {
    event?.stopPropagation();
    this.entries.delete(f.id);
  }

  // ── OTP ─────────────────────────────────────────────────────────────────

  requestOtp(): void {
    if (this.otpBusy) return;
    this.otpBusy = true;
    this.otpError = '';
    this.api.requestOtp(this.token).subscribe({
      next: () => { this.otpBusy = false; this.otpSent = true; this.toast('signature.sign.otpSent'); },
      error: (err) => { this.otpBusy = false; this.otpError = this.otpErrorKey(err); }
    });
  }

  verifyOtp(): void {
    const code = this.otpCode.trim();
    if (this.otpBusy || !code) return;
    this.otpBusy = true;
    this.otpError = '';
    this.api.verifyOtp(this.token, code).subscribe({
      next: (v) => { this.otpBusy = false; this.otpCode = ''; this.applyView(v); },
      error: (err) => { this.otpBusy = false; this.otpError = this.otpErrorKey(err); }
    });
  }

  private otpErrorKey(err: unknown): string {
    switch ((err as HttpErrorResponse)?.status) {
      case 403: return 'signature.sign.otpInvalid';
      case 410: return 'signature.sign.otpExpired';
      case 429: return 'signature.sign.otpTooMany';
      default: return 'signature.sign.otpError';
    }
  }

  // ── Sign / decline ──────────────────────────────────────────────────────

  /** Payload for POST /sign — one entry per editable field that carries a value. */
  buildPayload(): ApplySignatureRequest {
    const fields: SignatureFieldValue[] = [];
    for (const f of this.editableFields) {
      const e = this.entries.get(f.id);
      if (!e) continue;
      const fv: SignatureFieldValue = { fieldId: f.id };
      if (e.valueImage) fv.valueImage = e.valueImage;
      if (e.value?.trim()) fv.value = e.value.trim();
      if (fv.value === undefined && fv.valueImage === undefined) continue;
      fields.push(fv);
    }
    return { fields };
  }

  sign(): void {
    if (!this.canSign) return;
    this.submitting = true;
    this.signing = true;
    this.activeFieldId = null;
    this.api.sign(this.token, this.buildPayload()).subscribe({
      next: (v) => {
        this.submitting = false;
        this.signing = false;
        this.applyView(v, false);
        this.toast('signature.sign.signed');
      },
      error: (err) => {
        this.submitting = false;
        this.signing = false;
        this.toastError(err, 'signature.sign.signError');
      }
    });
  }

  decline(): void {
    if (!this.canAct || this.submitting) return;
    this.dialog.open<DeclineDialogComponent, undefined, { reason?: string } | undefined>(
      DeclineDialogComponent, { width: '460px', maxWidth: '96vw' }
    ).afterClosed().subscribe(result => {
      if (!result) return;
      this.submitting = true;
      this.api.decline(this.token, { reason: result.reason }).subscribe({
        next: (v) => {
          this.submitting = false;
          this.applyView(v, false);
          this.toast('signature.sign.declined');
        },
        error: (err) => {
          this.submitting = false;
          this.toastError(err, 'signature.sign.signError');
        }
      });
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Install a fresh view; loads the document the first time the signer can see it. */
  private applyView(v: PublicSignatureView, loadDoc = true): void {
    this.view = v;
    // Keep already captured values for fields that are still unfilled; adopt server values.
    for (const f of v.fields ?? []) {
      if (f.value || f.valueImage) this.entries.set(f.id, { value: f.value, valueImage: f.valueImage });
    }
    if (loadDoc && !this.pdfDoc && !this.pdfLoading && this.phase !== 'otp') this.loadPdf();
  }

  private loadPdf(): void {
    this.pdfLoading = true;
    this.pdfError = false;
    this.api.loadDocument(this.token).subscribe({
      next: async (blob) => {
        try {
          const buf = await blob.arrayBuffer();
          this.pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
          this.pages = Array.from({ length: this.pdfDoc.numPages }, (_, i) => i);
          this.pdfLoading = false;
          // Canvases exist once the @for has rendered — defer to the next macrotask.
          setTimeout(() => this.renderAllPages());
        } catch {
          this.pdfError = true;
          this.pdfLoading = false;
        }
      },
      error: () => { this.pdfError = true; this.pdfLoading = false; }
    });
  }

  private async renderAllPages(): Promise<void> {
    const doc = this.pdfDoc;
    const canvases = this.pageCanvases?.toArray() ?? [];
    if (!doc || !canvases.length) return;
    const gen = ++this.renderGeneration;
    for (let i = 0; i < canvases.length; i++) {
      if (gen !== this.renderGeneration) return;
      try {
        const page = await doc.getPage(i + 1);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = canvases[i].nativeElement;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      } catch {
        // best-effort: a page that fails to render keeps its blank canvas
      }
    }
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
