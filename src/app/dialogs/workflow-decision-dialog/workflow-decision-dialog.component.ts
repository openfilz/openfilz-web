import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { transitionIcon, validEmail } from '../../utils/workflow-spec';
import { WorkflowTransitionStyle } from '../../models/workflow.models';

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
  /** Style of the transition being taken: colours the header and the confirm button like the card's button. */
  style?: WorkflowTransitionStyle;
  /** Status the document is in, shown under the title. */
  stateLabel?: string;
  /** A parallel review vote: the note is shared with the other reviewers. */
  review?: boolean;
  /** 'emails' mode: the people the task is with now (shown, and pre-filled). */
  initialEmails?: string[];
}

export interface WorkflowDecisionDialogResult {
  comment: string | null;
  emails?: string[];
}

/**
 * The small prompt behind a transition that needs (or offers) a comment, and behind
 * "Reassign" (people + optional note): coloured like the button that opened it, it says what the
 * note is for and who reads it, and for a reassignment shows who has the task now and the
 * addresses it understood. Returns null when dismissed.
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

  /** Colour family of the header and confirm button. */
  get tone(): 'primary' | 'success' | 'danger' | 'neutral' {
    if (this.data.danger || this.data.style === 'DANGER') return 'danger';
    if (this.data.style === 'SUCCESS') return 'success';
    if (this.data.style === 'NEUTRAL') return 'neutral';
    return 'primary';
  }

  get icon(): string {
    if (this.data.confirmIcon) return this.data.confirmIcon;
    if (this.data.mode === 'emails') return 'group';
    return transitionIcon({ style: this.data.style ?? (this.data.danger ? 'DANGER' : 'PRIMARY') });
  }

  /** The sentence above the note: required or not, and who will read it. */
  get introKey(): string {
    if (this.data.review) return 'workflow.decision.reviewIntro';
    return this.data.commentRequired ? 'workflow.decision.requiredIntro' : 'workflow.decision.optionalIntro';
  }

  isValid(email: string): boolean {
    return validEmail(email);
  }

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
