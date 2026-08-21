import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';

/** Asks the signer for an (optional) decline reason. Resolves with `{ reason }` or undefined when dismissed. */
@Component({
  selector: 'app-decline-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'signature.sign.declineBtn' | translate }}</h2>
    <div mat-dialog-content>
      <p class="lead">{{ 'signature.sign.declinePrompt' | translate }}</p>
      <mat-form-field appearance="outline" class="ff">
        <mat-label>{{ 'signature.sign.declineReason' | translate }}</mat-label>
        <textarea matInput [(ngModel)]="reason" rows="3" maxlength="1000" cdkFocusInitial></textarea>
      </mat-form-field>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="ref.close()">{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button color="warn" type="button" (click)="ref.close({ reason: reason.trim() || undefined })">
        {{ 'signature.sign.declineConfirm' | translate }}
      </button>
    </div>
  `,
  styles: [`
    .ff { width: 100%; min-width: 300px; }
    .lead { margin: 0 0 10px; color: var(--text-secondary); font-size: 13.5px; }
  `]
})
export class DeclineDialogComponent {
  readonly ref = inject(MatDialogRef<DeclineDialogComponent, { reason?: string } | undefined>);
  reason = '';
}
