import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { validEmail } from '../../utils/workflow-spec';

export interface WorkflowDecisionDialogData {
  /** Dialog title (already translated). */
  title: string;
  subtitle?: string;
  /** 'comment' asks for a note; 'emails' asks for people (+ optional note). */
  mode: 'comment' | 'emails';
  commentRequired?: boolean;
  confirmLabel: string;
  confirmIcon?: string;
  danger?: boolean;
  initialEmails?: string[];
}

export interface WorkflowDecisionDialogResult {
  comment: string | null;
  emails?: string[];
}

/**
 * The small prompt behind a transition that needs (or offers) a comment, and behind
 * "Reassign" (people + optional note). Returns null when dismissed.
 */
@Component({
  selector: 'app-workflow-decision-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, TranslatePipe],
  templateUrl: './workflow-decision-dialog.component.html',
  styleUrls: ['./workflow-decision-dialog.component.css']
})
export class WorkflowDecisionDialogComponent {
  readonly data = inject<WorkflowDecisionDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<WorkflowDecisionDialogComponent, WorkflowDecisionDialogResult | null>);

  comment = '';
  emailsText = (this.data.initialEmails ?? []).join(', ');

  get emails(): string[] {
    return this.emailsText.split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(e => e);
  }

  get invalidEmail(): string | null {
    return this.emails.find(e => !validEmail(e)) ?? null;
  }

  get canConfirm(): boolean {
    if (this.data.mode === 'emails') {
      return this.emails.length > 0 && !this.invalidEmail;
    }
    return !this.data.commentRequired || this.comment.trim().length > 0;
  }

  confirm(): void {
    if (!this.canConfirm) return;
    this.dialogRef.close({
      comment: this.comment.trim() || null,
      emails: this.data.mode === 'emails' ? this.emails : undefined
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
