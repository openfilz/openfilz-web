import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { SignatureService } from '../../services/signature.service';
import {
  InstantiateTemplateRequest, SignatureEnvelopeDTO, SignatureTemplateDTO, TemplateRoleBinding
} from '../../models/signature.models';
import { recipientColor, validEmail } from '../../utils/signature-envelope';

export interface UseTemplateDialogData {
  template: SignatureTemplateDTO;
  /** Document to instantiate on; defaults to the template's own source document. */
  sourceDocId?: string;
  sourceDocName?: string;
}

interface BindingRow extends TemplateRoleBinding {
  roleLabel: string;
  kind: 'SIGNER' | 'CC';
  needsPhone: boolean;
}

/**
 * "Use template": bind each template role to a real person, then create + send the
 * envelope with POST /signature-templates/{id}/envelopes.
 */
@Component({
  selector: 'app-use-template-dialog',
  standalone: true,
  templateUrl: './use-template-dialog.component.html',
  styleUrls: ['./use-template-dialog.component.css'],
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatProgressSpinnerModule, MatSnackBarModule, TranslatePipe
  ]
})
export class UseTemplateDialogComponent {
  private ref = inject(MatDialogRef<UseTemplateDialogComponent, SignatureEnvelopeDTO | undefined>);
  readonly data = inject<UseTemplateDialogData>(MAT_DIALOG_DATA);
  private api = inject(SignatureService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  title = this.data.template.name;
  message = this.data.template.message ?? '';
  expiresInDays: number | null = this.data.template.expiresInDays ?? 30;
  sending = false;

  readonly bindings: BindingRow[] = [...(this.data.template.roles ?? [])]
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map(r => ({
      role: r.name, roleLabel: r.name, email: '', name: '',
      kind: r.role ?? 'SIGNER', needsPhone: r.authMethod === 'SMS_OTP', phone: ''
    }));

  color(i: number): string { return recipientColor(i); }

  get sourceDocId(): string | undefined {
    return this.data.sourceDocId ?? this.data.template.sourceDocId;
  }

  get canSend(): boolean {
    return !this.sending && !!this.sourceDocId && !!this.title.trim()
      && this.bindings.every(b => validEmail(b.email) && (!b.needsPhone || !!b.phone?.trim()));
  }

  send(): void {
    if (!this.canSend) return;
    this.sending = true;
    const req: InstantiateTemplateRequest = {
      sourceDocId: this.data.sourceDocId,
      title: this.title.trim(),
      message: this.message.trim() || undefined,
      expiresInDays: this.expiresInDays ?? undefined,
      recipients: this.bindings.map(b => ({
        role: b.role,
        name: b.name?.trim() || undefined,
        email: b.email.trim(),
        phone: b.needsPhone ? b.phone?.trim() : undefined
      })),
      send: true
    };
    this.api.instantiateTemplate(this.data.template.id, req).subscribe({
      next: (env) => {
        this.snackBar.open(this.translate.instant('signature.request.sent'),
          this.translate.instant('common.close'), { duration: 4000 });
        this.ref.close(env);
      },
      error: (err) => {
        this.sending = false;
        const detail = SignatureService.serverMessage(err);
        const msg = this.translate.instant(SignatureService.errorKey(err, 'signature.request.sendError'));
        this.snackBar.open(detail ? `${msg} — ${detail}` : msg, this.translate.instant('common.close'), { duration: 6000 });
      }
    });
  }

  cancel(): void { this.ref.close(); }
}
