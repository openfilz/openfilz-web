import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { SmartFilingService } from '../../services/smart-filing.service';
import { InboxUploadService } from '../../services/inbox-upload.service';

/**
 * The Inbox actions of the file explorer toolbar, for a user who has an Inbox folder:
 * - inside the Inbox: "File my Inbox" — OpenFilz files every loose document lying there;
 * - anywhere else: "Upload to Inbox" — the chosen files go to the Inbox, filed on arrival.
 * Renders nothing without an Inbox (feature off, deployment without one, switch off).
 * Projected into the toolbar's `[toolbarActions]` slot. Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-smart-filing-inbox-actions',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe],
  template: `
    @if (visible) {
      @if (inInbox) {
        <button mat-stroked-button type="button" class="inbox-action file-inbox-btn" (click)="fileInbox()"
          [disabled]="busy"
          [matTooltip]="'smartFiling.inbox.fileNowHint' | translate"
          [attr.aria-label]="'smartFiling.inbox.fileNow' | translate">
          <mat-icon aria-hidden="true">auto_fix_high</mat-icon>
          <span class="inbox-action-label">{{ 'smartFiling.inbox.fileNow' | translate }}</span>
        </button>
      } @else {
        <button mat-stroked-button type="button" class="inbox-action upload-inbox-btn" (click)="pickFiles()"
          [matTooltip]="'smartFiling.inbox.uploadToHint' | translate"
          [attr.aria-label]="'smartFiling.inbox.uploadTo' | translate">
          <mat-icon aria-hidden="true">move_to_inbox</mat-icon>
          <span class="inbox-action-label">{{ 'smartFiling.inbox.uploadTo' | translate }}</span>
        </button>
      }
    }
  `,
  styles: [`
    :host { display: contents; }
    .inbox-action {
      height: 40px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--primary, #6366f1) 40%, transparent);
      color: var(--primary, #6366f1);
      background: color-mix(in srgb, var(--primary, #6366f1) 8%, transparent);
      font-weight: 500;
      white-space: nowrap;
    }
    .inbox-action:hover:not([disabled]) { background: color-mix(in srgb, var(--primary, #6366f1) 16%, transparent); }
    .inbox-action mat-icon { margin-right: 6px; }
    @media (max-width: 768px) {
      .inbox-action { min-width: 0; width: 40px; padding: 0; }
      .inbox-action mat-icon { margin: 0; }
      .inbox-action-label { display: none; }
    }
  `]
})
export class SmartFilingInboxActionsComponent implements OnInit, OnDestroy {
  /** The folder displayed (null = root level). */
  @Input() currentFolderId: string | null = null;
  /** Hidden while items are selected: the toolbar then shows the selection actions. */
  @Input() hasSelection = false;

  private smartFiling = inject(SmartFilingService);
  private inboxUpload = inject(InboxUploadService);

  hasInbox = false;
  busy = false;
  private subscription?: Subscription;

  ngOnInit(): void {
    this.smartFiling.ensureLoaded();
    this.subscription = this.smartFiling.preferences$.subscribe(() => this.hasInbox = this.smartFiling.hasInbox);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  get visible(): boolean {
    return this.hasInbox && !this.hasSelection;
  }

  get inInbox(): boolean {
    return this.smartFiling.isInbox(this.currentFolderId);
  }

  fileInbox(): void {
    this.busy = true;
    this.smartFiling.fileInboxNow().subscribe({
      next: () => this.busy = false,
      error: () => this.busy = false
    });
  }

  pickFiles(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = event => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.inboxUpload.uploadToInbox(Array.from(files));
      }
    };
    input.click();
  }
}
