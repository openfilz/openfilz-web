import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SmartFilingService } from '../../services/smart-filing.service';
import { AiPreferences } from '../../models/smart-filing.models';

/**
 * The two smart filing switches — "Let OpenFilz choose the folder" and, when that is on,
 * "May create new folders". Bound to the per-user preferences: every change is saved right
 * away (no confirmation). Renders nothing while the feature is off or the preferences are
 * not loaded. Used next to the upload controls (`inline`) and on the settings page
 * (`settings`, with descriptions). Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-smart-filing-toggle',
  standalone: true,
  imports: [MatSlideToggleModule, MatIconModule, MatTooltipModule, TranslatePipe],
  templateUrl: './smart-filing-toggle.component.html',
  styleUrls: ['./smart-filing-toggle.component.css']
})
export class SmartFilingToggleComponent implements OnInit, OnDestroy {
  /** `inline`: compact row next to the upload controls; `settings`: labelled rows with hints. */
  @Input() variant: 'inline' | 'settings' = 'inline';

  private smartFiling = inject(SmartFilingService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

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

  onAutoFileChange(checked: boolean): void {
    this.save({ autoFile: checked });
  }

  onNewFoldersChange(checked: boolean): void {
    this.save({ autoFileNewFolders: checked });
  }

  private save(update: { autoFile?: boolean; autoFileNewFolders?: boolean }): void {
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
