import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { SettingsService } from '../../services/settings.service';

/**
 * One-line notice shown on the signature screens when envelopes are sealed with the
 * throwaway dev certificate (sealProvider === 'self-signed-dev'): Acrobat reports those
 * signatures as untrusted. Links out to the ways to get an Adobe-trusted seal (Cloud
 * Signing, BYOC + AATL Onboarding Pack). Renders nothing on any real seal. Dismissible,
 * persisted per browser (one key for every placement — tell the user once).
 */
@Component({
  selector: 'app-seal-notice',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, TranslatePipe],
  template: `
    @if (visible) {
      <div class="hint warn seal-notice" role="note">
        <mat-icon aria-hidden="true">gpp_maybe</mat-icon>
        <span class="seal-notice-text">
          {{ 'signature.sealNotice.message' | translate }}
          <a [href]="cloudSigningUrl" target="_blank" rel="noopener">{{ 'signature.sealNotice.cloud' | translate }}</a>
          {{ 'signature.sealNotice.or' | translate }}
          <a [href]="aatlPackUrl" target="_blank" rel="noopener">{{ 'signature.sealNotice.byoc' | translate }}</a>
        </span>
        <button mat-icon-button class="seal-notice-dismiss" (click)="dismiss()"
                [attr.aria-label]="'notice.dismiss' | translate">
          <mat-icon>close</mat-icon>
        </button>
      </div>
    }
  `,
  styles: [`
    .hint.warn.seal-notice {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 8px 8px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      color: var(--text-primary);
      background: rgba(245, 158, 11, 0.10);
      border-left: 3px solid #f59e0b;
    }
    .seal-notice mat-icon:first-child {
      color: #f59e0b;
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
    .seal-notice-text {
      flex: 1;
      min-width: 0;
      line-height: 1.4;
    }
    .seal-notice-text a {
      color: var(--primary);
      font-weight: 600;
      text-decoration: none;
    }
    .seal-notice-text a:hover {
      text-decoration: underline;
    }
    .seal-notice-dismiss {
      width: 28px;
      height: 28px;
      padding: 2px;
      color: var(--text-secondary);
    }
    .seal-notice-dismiss mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
  `]
})
export class SealNoticeComponent {
  private static readonly DISMISS_KEY = 'openfilz.sealNotice.dismissed';

  readonly cloudSigningUrl = 'https://www.openfilz.com/esign/cloud-signing';
  readonly aatlPackUrl = 'https://www.openfilz.com/esign/aatl-onboarding';

  private settingsService = inject(SettingsService);
  private dismissed = this.readDismissed();

  get visible(): boolean {
    return this.settingsService.isDevSeal && !this.dismissed;
  }

  dismiss(): void {
    try {
      localStorage.setItem(SealNoticeComponent.DISMISS_KEY, '1');
    } catch { /* private mode — session-only dismissal */ }
    this.dismissed = true;
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(SealNoticeComponent.DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }
}
