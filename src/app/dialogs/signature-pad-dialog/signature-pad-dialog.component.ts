import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslatePipe } from '@ngx-translate/core';
import { SignatureFieldType } from '../../models/signature.models';

export interface SignaturePadDialogData {
  /** SIGNATURE / INITIALS offer draw + type + upload; IMAGE / STAMP offer upload only. */
  fieldType: SignatureFieldType;
  /** Pre-filled typed name (recipient name). */
  suggestedName?: string;
  /** Whether to show the "apply to all my X fields" checkbox. */
  offerApplyToAll?: boolean;
  /** Aspect ratio (w/h) of the target field, used to size the pad. */
  aspect?: number;
}

export interface SignaturePadResult {
  /** PNG data URL. */
  image: string;
  applyToAll: boolean;
}

export type PadMode = 'draw' | 'type' | 'upload';

/** Max width of uploaded images (downscaled client-side to keep payloads small). */
export const MAX_UPLOAD_WIDTH = 600;

/**
 * Capture a signature / initials / stamp image: draw with pointer events, type a
 * name rendered in a script font, or upload an image (downscaled to 600px wide).
 */
@Component({
  selector: 'app-signature-pad-dialog',
  standalone: true,
  templateUrl: './signature-pad-dialog.component.html',
  styleUrls: ['./signature-pad-dialog.component.css'],
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatTabsModule, TranslatePipe
  ]
})
export class SignaturePadDialogComponent implements AfterViewInit {
  @ViewChild('pad') pad?: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  private ref = inject(MatDialogRef<SignaturePadDialogComponent, SignaturePadResult | undefined>);
  readonly data = inject<SignaturePadDialogData>(MAT_DIALOG_DATA);

  readonly imageOnly = this.data.fieldType === 'IMAGE' || this.data.fieldType === 'STAMP';
  readonly isInitials = this.data.fieldType === 'INITIALS';

  /**
   * Initials open on "type": they are pre-filled from the name the sender entered, so the
   * signer usually just confirms. A signature opens on "draw", the expected gesture there.
   */
  readonly modes: PadMode[] = this.imageOnly ? ['upload']
      : this.isInitials ? ['type', 'draw', 'upload'] : ['draw', 'type', 'upload'];
  mode: PadMode = this.modes[0];

  /** Initials derived from the recipient name — kept so the signer can restore them after editing. */
  readonly suggestion = this.isInitials ? initialsOf(this.data.suggestedName) : (this.data.suggestedName ?? '');
  typedName = this.suggestion;
  /** Repeated initials are identical by nature: adopt once, apply to every field by default. */
  applyToAll = this.isInitials && !!this.data.offerApplyToAll;
  hasStroke = false;
  uploadPreview: string | null = null;
  uploadError = '';

  readonly maxTypedLength = this.isInitials ? 6 : 255;
  /** Initials get a squarer pad so the glyphs fill their (small, near-square) field box. */
  readonly padW = this.isInitials ? 300 : 480;
  readonly padH = this.isInitials ? 240 : 180;

  private drawing = false;

  ngAfterViewInit(): void {
    if (this.mode === 'draw') this.initPad();
  }

  onTabChange(index: number): void {
    this.mode = this.modes[index];
    if (this.mode === 'draw') setTimeout(() => this.initPad());
  }

  /** Initials are conventionally uppercase and short — normalise as the signer types. */
  onTypedInput(value: string): void {
    this.typedName = this.isInitials
        ? value.replace(/\s+/g, '').toUpperCase().slice(0, this.maxTypedLength)
        : value;
  }

  restoreSuggestion(): void {
    this.typedName = this.suggestion;
  }

  get canRestoreSuggestion(): boolean {
    return !!this.suggestion && this.typedName.trim() !== this.suggestion;
  }

  /** Placeholder / label keys differ per field type ("draw your signature" vs "your initials"). */
  get drawPlaceholderKey(): string {
    return this.isInitials ? 'signature.pad.drawInitialsPlaceholder' : 'signature.sign.drawPlaceholder';
  }

  // ── Draw ────────────────────────────────────────────────────────────────

  private initPad(): void {
    const ctx = this.ctx();
    if (ctx) this.applyPen(ctx);
  }

  /** 2D context of the pad, or null when the canvas is not (yet) renderable. */
  private ctx(): CanvasRenderingContext2D | null {
    return this.pad?.nativeElement.getContext('2d') ?? null;
  }

  private applyPen(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }

  padDown(e: PointerEvent): void {
    const c = this.pad?.nativeElement;
    const ctx = this.ctx();
    if (!c || !ctx) return;
    c.setPointerCapture?.(e.pointerId);
    this.drawing = true;
    this.applyPen(ctx);
    const { x, y } = this.pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A dot for taps.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    this.hasStroke = true;
  }

  padMove(e: PointerEvent): void {
    const ctx = this.ctx();
    if (!this.drawing || !ctx) return;
    const { x, y } = this.pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  padUp(): void { this.drawing = false; }

  clearPad(): void {
    const c = this.pad?.nativeElement;
    this.ctx()?.clearRect(0, 0, c?.width ?? 0, c?.height ?? 0);
    this.hasStroke = false;
  }

  private pos(e: PointerEvent): { x: number; y: number } {
    const c = this.pad!.nativeElement;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }

  // ── Upload ──────────────────────────────────────────────────────────────

  pickFile(): void { this.fileInput?.nativeElement.click(); }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.uploadError = 'signature.pad.notAnImage'; return; }
    if (file.size > 5 * 1024 * 1024) { this.uploadError = 'signature.pad.tooLarge'; return; }
    this.uploadError = '';
    try {
      this.uploadPreview = await downscaleImage(file, MAX_UPLOAD_WIDTH);
    } catch {
      this.uploadError = 'signature.pad.readError';
    }
  }

  clearUpload(): void { this.uploadPreview = null; }

  // ── Result ──────────────────────────────────────────────────────────────

  get canApply(): boolean {
    switch (this.mode) {
      case 'draw': return this.hasStroke;
      case 'type': return !!this.typedName.trim();
      case 'upload': return !!this.uploadPreview;
    }
  }

  apply(): void {
    if (!this.canApply) return;
    let image: string;
    if (this.mode === 'draw') image = this.pad!.nativeElement.toDataURL('image/png');
    else if (this.mode === 'type') image = renderTypedSignature(this.typedName.trim(), this.padW, this.padH);
    else image = this.uploadPreview!;
    this.ref.close({ image, applyToAll: this.applyToAll });
  }

  cancel(): void { this.ref.close(); }
}

/** "Jane Q. Doe" → "JQD". */
export function initialsOf(name?: string): string {
  return (name ?? '').split(/[\s-]+/).filter(Boolean).map(p => p[0].toUpperCase()).join('').slice(0, 4);
}

/** 1×1 transparent PNG — only used when the canvas has no 2D context (never in a real browser). */
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Render typed text as a transparent PNG data URL in a script font. */
export function renderTypedSignature(text: string, w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return TRANSPARENT_PNG;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = Math.floor(h * 0.45);
  const family = "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'URW Chancery L', cursive";
  do {
    ctx.font = `italic ${size}px ${family}`;
    size -= 2;
  } while (ctx.measureText(text).width > w * 0.9 && size > 10);
  ctx.fillText(text, w / 2, h / 2);
  return c.toDataURL('image/png');
}

/** Read an image file and downscale it (keeping aspect ratio) to at most `maxWidth` px wide. */
export function downscaleImage(file: File, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => {
        if (img.naturalWidth <= maxWidth && file.type === 'image/png') {
          resolve(dataUrl);
          return;
        }
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
