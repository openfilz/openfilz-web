import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SmartFilingService } from '../../services/smart-filing.service';
import { AiPreferences, AiPreferencesUpdate } from '../../models/smart-filing.models';

/**
 * The smart filing switches — "Let OpenFilz choose the folder" and, when that is on,
 * "May create new folders" — plus, when the deployment offers it, "Use an Inbox folder" with
 * an "Open my Inbox" shortcut. Bound to the per-user preferences: every change is saved right
 * away (no confirmation). Renders nothing while the feature is off or the preferences are
 * not loaded. Used next to the upload controls (`inline`) and on the settings page
 * (`settings`, with descriptions). Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-smart-filing-toggle',
  standalone: true,
  imports: [MatSlideToggleModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe],
  templateUrl: './smart-filing-toggle.component.html',
  styleUrls: ['./smart-filing-toggle.component.css']
})
export class SmartFilingToggleComponent implements OnInit, OnDestroy {
  /** `inline`: compact row next to the upload controls; `settings`: labelled rows with hints. */
  @Input() variant: 'inline' | 'settings' = 'inline';

  private smartFiling = inject(SmartFilingService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private router = inject(Router);

  prefs: AiPreferences | null = null;
  saving = false;
  private subscription?: Subscription;

  ngOnInit(): void {
    this.smartFiling.ensureLoaded();
    this.subscription = this.smartFiling.preferences$.subscribe(prefs => this.prefs = prefs);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /** Feature on, preferences loaded, and filing available for this user. */
  get visible(): boolean {
    return this.smartFiling.enabled && !!this.prefs && this.prefs.autoFileAvailable;
  }

  /** The deployment offers the Inbox folder to this user. */
  get inboxAvailable(): boolean {
    return this.smartFiling.inboxAvailable;
  }

  /** The user has an Inbox folder to open. */
  get hasInbox(): boolean {
    return this.smartFiling.hasInbox;
  }

  onAutoFileChange(checked: boolean): void {
    this.save({ autoFile: checked });
  }

  onNewFoldersChange(checked: boolean): void {
    this.save({ autoFileNewFolders: checked });
  }

  /** Turning the Inbox on creates (or reuses) the folder server-side, named in the app's language. */
  onInboxChange(checked: boolean): void {
    this.save({ inbox: checked });
  }

  /** "Open my Inbox": the explorer, on the Inbox folder. */
  openInbox(): void {
    const folderId = this.smartFiling.inboxFolderId;
    if (folderId) {
      this.router.navigate(['/my-folder'], { queryParams: { folderId } });
    }
  }

  private save(update: AiPreferencesUpdate): void {
    if (!this.prefs) {
      return;
    }
    // Optimistic: the switch follows the finger; the server's answer replaces it (or reverts on failure).
    const previous = this.prefs;
    this.prefs = { ...previous, ...update };
    this.saving = true;
    this.smartFiling.updatePreferences(update).subscribe({
      next: () => this.saving = false,
      error: () => {
        this.saving = false;
        this.prefs = previous;
        this.snackBar.open(
          this.translate.instant('smartFiling.saveError'),
          this.translate.instant('common.close'),
          { duration: 4000 }
        );
      }
    });
  }
}
