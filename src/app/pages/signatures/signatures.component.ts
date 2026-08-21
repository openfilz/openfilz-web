import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { SignatureService } from '../../services/signature.service';
import {
  SignatureEnvelopeDTO, SignatureEnvelopeStatus, SignatureEventDTO, SignatureRecipientDTO, SignatureTemplateDTO
} from '../../models/signature.models';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../dialogs/confirm-dialog/confirm-dialog.component';
import { TemplateNameDialogComponent } from '../../dialogs/request-signature-dialog/template-name-dialog.component';
import { UseTemplateDialogComponent, UseTemplateDialogData } from '../../dialogs/use-template-dialog/use-template-dialog.component';
import { recipientColor } from '../../utils/signature-envelope';

/**
 * e-Sign hub: envelopes waiting for my signature, envelopes I sent (with a detail
 * drawer: recipients + audit events), and my reusable templates.
 */
@Component({
  selector: 'app-signatures',
  standalone: true,
  templateUrl: './signatures.component.html',
  styleUrls: ['./signatures.component.css'],
  imports: [
    CommonModule, MatTabsModule, MatTableModule, MatButtonModule, MatIconModule, MatDialogModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatTooltipModule, MatMenuModule, TranslatePipe
  ]
})
export class SignaturesComponent implements OnInit {
  private api = inject(SignatureService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  loadingSent = true;
  loadingToSign = true;
  loadingTemplates = true;
  sent: SignatureEnvelopeDTO[] = [];
  toSign: SignatureEnvelopeDTO[] = [];
  templates: SignatureTemplateDTO[] = [];

  /** Optional status filter for the Sent tab. */
  sentFilter: SignatureEnvelopeStatus | null = null;
  readonly statuses: SignatureEnvelopeStatus[] = ['DRAFT', 'SENT', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED'];

  /** Envelope whose detail drawer is open (null = closed). */
  detail: SignatureEnvelopeDTO | null = null;
  detailEvents: SignatureEventDTO[] = [];
  loadingDetail = false;
  busy = new Set<string>();

  sentColumns = ['title', 'recipients', 'status', 'created', 'expires', 'actions'];
  toSignColumns = ['title', 'from', 'status', 'expires', 'actions'];
  templateColumns = ['name', 'roles', 'fields', 'updated', 'actions'];
  recipientColumns = ['order', 'recipient', 'role', 'auth', 'status', 'viewed', 'signed', 'reminders', 'fields', 'actions'];

  ngOnInit(): void {
    this.reloadSent();
    this.reloadToSign();
    this.reloadTemplates();
  }

  // ── Loading ─────────────────────────────────────────────────────────────

  reloadSent(): void {
    this.loadingSent = true;
    this.api.listSent(this.sentFilter ?? undefined).subscribe({
      next: (e) => {
        this.sent = e ?? [];
        this.loadingSent = false;
        if (this.detail) {
          const fresh = this.sent.find(x => x.id === this.detail!.id);
          if (fresh) this.detail = fresh;
        }
      },
      error: () => { this.loadingSent = false; }
    });
  }

  setSentFilter(status: SignatureEnvelopeStatus | null): void {
    this.sentFilter = status;
    this.reloadSent();
  }

  reloadToSign(): void {
    this.loadingToSign = true;
    this.api.listToSign().subscribe({
      next: (e) => { this.toSign = e ?? []; this.loadingToSign = false; },
      error: () => { this.loadingToSign = false; }
    });
  }

  reloadTemplates(): void {
    this.loadingTemplates = true;
    this.api.listTemplates().subscribe({
      next: (t) => { this.templates = t ?? []; this.loadingTemplates = false; },
      error: () => { this.loadingTemplates = false; }
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  color(i: number): string { return recipientColor(i); }

  signers(e: SignatureEnvelopeDTO): SignatureRecipientDTO[] {
    return e.recipients.filter(r => r.role !== 'CC');
  }

  signedCount(e: SignatureEnvelopeDTO): string {
    const s = this.signers(e);
    return `${s.filter(r => r.status === 'SIGNED').length}/${s.length}`;
  }

  progressPct(e: SignatureEnvelopeDTO): number {
    const s = this.signers(e);
    return s.length ? Math.round(100 * s.filter(r => r.status === 'SIGNED').length / s.length) : 0;
  }

  canCancel(e: SignatureEnvelopeDTO): boolean {
    return e.status === 'SENT' || e.status === 'DRAFT';
  }

  canResend(e: SignatureEnvelopeDTO, r: SignatureRecipientDTO): boolean {
    return e.status === 'SENT' && r.role !== 'CC' && r.status !== 'SIGNED' && r.status !== 'DECLINED'
      && (!e.sequential || r.orderIndex === e.currentOrder);
  }

  isBusy(key: string): boolean { return this.busy.has(key); }

  sortedRecipients(e: SignatureEnvelopeDTO): SignatureRecipientDTO[] {
    return [...e.recipients].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  /** Recipient display for an event actor (falls back to the raw actor string). */
  actorLabel(ev: SignatureEventDTO): string {
    return ev.actor ?? '';
  }

  // ── Detail drawer ───────────────────────────────────────────────────────

  openDetail(e: SignatureEnvelopeDTO): void {
    if (this.detail?.id === e.id) { this.closeDetail(); return; }
    this.detail = e;
    this.detailEvents = [];
    this.loadingDetail = true;
    this.api.events(e.id).subscribe({
      next: (ev) => { this.detailEvents = ev ?? []; this.loadingDetail = false; },
      error: () => { this.loadingDetail = false; }
    });
  }

  closeDetail(): void {
    this.detail = null;
    this.detailEvents = [];
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  cancel(e: SignatureEnvelopeDTO): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: this.translate.instant('signature.list.cancel'),
        message: this.translate.instant('signature.list.cancelConfirm', { title: e.title }),
        type: 'danger', icon: 'cancel',
        confirmText: this.translate.instant('signature.list.cancel'),
        cancelText: this.translate.instant('common.cancel')
      } as ConfirmDialogData
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.busy.add(e.id);
      this.api.cancel(e.id).subscribe({
        next: () => {
          this.busy.delete(e.id);
          this.toast('signature.list.cancelled');
          this.reloadSent();
        },
        error: (err) => { this.busy.delete(e.id); this.toastError(err, 'signature.list.cancelError'); }
      });
    });
  }

  resend(e: SignatureEnvelopeDTO, r: SignatureRecipientDTO): void {
    const key = `${e.id}:${r.id}`;
    this.busy.add(key);
    this.api.resend(e.id, r.id).subscribe({
      next: (fresh) => {
        this.busy.delete(key);
        this.toast('signature.list.resent');
        if (this.detail?.id === fresh.id) this.detail = fresh;
        this.sent = this.sent.map(x => x.id === fresh.id ? fresh : x);
      },
      error: (err) => { this.busy.delete(key); this.toastError(err, 'signature.list.resendError'); }
    });
  }

  sendDraft(e: SignatureEnvelopeDTO): void {
    this.busy.add(e.id);
    this.api.send(e.id).subscribe({
      next: () => { this.busy.delete(e.id); this.toast('signature.request.sent'); this.reloadSent(); },
      error: (err) => { this.busy.delete(e.id); this.toastError(err, 'signature.request.sendError'); }
    });
  }

  downloadSigned(e: SignatureEnvelopeDTO): void {
    const key = `${e.id}:dl`;
    this.busy.add(key);
    this.api.downloadSignedDocument(e.id).subscribe({
      next: (blob) => {
        this.busy.delete(key);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${e.title || 'signed'}-signed.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (err) => { this.busy.delete(key); this.toastError(err, 'signature.list.downloadError'); }
    });
  }

  openSigned(e: SignatureEnvelopeDTO): void {
    if (!e.signedDocId) return;
    this.router.navigate(['/my-folder'], { queryParams: { targetFileId: e.signedDocId, openViewer: true } });
  }

  openSource(e: SignatureEnvelopeDTO): void {
    this.router.navigate(['/my-folder'], { queryParams: { targetFileId: e.sourceDocId, openViewer: true } });
  }

  // ── Templates ───────────────────────────────────────────────────────────

  useTemplate(t: SignatureTemplateDTO): void {
    this.dialog.open(UseTemplateDialogComponent, {
      width: '640px', maxWidth: '96vw', autoFocus: false,
      data: { template: t } as UseTemplateDialogData
    }).afterClosed().subscribe(env => {
      if (env) this.reloadSent();
    });
  }

  renameTemplate(t: SignatureTemplateDTO): void {
    this.dialog.open(TemplateNameDialogComponent, { width: '420px', data: { name: t.name } })
      .afterClosed().subscribe((name?: string) => {
        if (!name || name === t.name) return;
        this.busy.add(t.id);
        this.api.updateTemplate(t.id, {
          name, description: t.description, sourceDocId: t.sourceDocId, roles: t.roles, fields: t.fields,
          message: t.message, expiresInDays: t.expiresInDays, sequential: t.sequential
        }).subscribe({
          next: () => { this.busy.delete(t.id); this.toast('signature.templates.renamed'); this.reloadTemplates(); },
          error: (err) => { this.busy.delete(t.id); this.toastError(err, 'signature.templates.saveError'); }
        });
      });
  }

  deleteTemplate(t: SignatureTemplateDTO): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: this.translate.instant('signature.templates.delete'),
        message: this.translate.instant('signature.templates.deleteConfirm', { name: t.name }),
        type: 'danger', icon: 'delete',
        confirmText: this.translate.instant('common.delete'),
        cancelText: this.translate.instant('common.cancel')
      } as ConfirmDialogData
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.busy.add(t.id);
      this.api.deleteTemplate(t.id).subscribe({
        next: () => { this.busy.delete(t.id); this.toast('signature.templates.deleted'); this.reloadTemplates(); },
        error: (err) => { this.busy.delete(t.id); this.toastError(err, 'signature.templates.deleteError'); }
      });
    });
  }

  // ── Toasts ──────────────────────────────────────────────────────────────

  private toast(key: string): void {
    this.snackBar.open(this.translate.instant(key), this.translate.instant('common.close'), { duration: 3500 });
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = SignatureService.serverMessage(err);
    const msg = this.translate.instant(SignatureService.errorKey(err, fallback));
    this.snackBar.open(detail ? `${msg} — ${detail}` : msg, this.translate.instant('common.close'), { duration: 6000 });
  }
}
