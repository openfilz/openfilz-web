import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { AiNoModelService } from '../../services/ai-no-model.service';

/** Where the panel is shown: in the chat, in the settings page (no button to the settings), or as a dialog. */
export type AiNoModelPanelVariant = 'chat' | 'settings' | 'dialog';

/** What "Organise with AI" passes when it opens the panel in a dialog (nothing to pass yet). */
export type AiNoModelDialogData = Record<string, never>;

/**
 * "No AI model is set up yet": shown by the chat and "Organise with AI" when no chat model answers the
 * user (`aiModelSource = NONE`, or a 409 `AI_NO_MODEL`), and as the AI notice of the settings page.
 * Two ways out: an administrator configures a model for everyone, or the user sets up their own model
 * and key (only when personal keys are allowed).
 *
 * Opened with `MatDialog.open` (MAT_DIALOG_DATA present) it renders the dialog frame.
 */
@Component({
  selector: 'app-ai-no-model-panel',
  standalone: true,
  imports: [NgTemplateOutlet, MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './ai-no-model-panel.component.html',
  styleUrls: ['./ai-no-model-panel.component.css']
})
export class AiNoModelPanelComponent {
  private router = inject(Router);
  private noModel = inject(AiNoModelService);
  private dialogRef = inject<MatDialogRef<AiNoModelPanelComponent>>(MatDialogRef, { optional: true });
  private dialogData = inject<AiNoModelDialogData | null>(MAT_DIALOG_DATA, { optional: true });

  /** Ignored in a dialog (always 'dialog' there). */
  @Input() variant: AiNoModelPanelVariant = 'chat';

  /** The user left for the settings page: the chat closes its panel. */
  @Output() leave = new EventEmitter<void>();

  get mode(): AiNoModelPanelVariant {
    return this.dialogData ? 'dialog' : this.variant;
  }

  get userKeysAllowed(): boolean {
    return this.noModel.userKeysAllowed;
  }

  /** "Set up my AI model": the personal AI settings. */
  openPersonalSettings(): void {
    this.leave.emit();
    this.dialogRef?.close();
    void this.router.navigate(['/settings'], { queryParams: { section: 'ai' } });
  }

  close(): void {
    this.dialogRef?.close();
  }
}
