import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ThemeService, Theme } from '../../services/theme.service';
import { SettingsService, Settings } from '../../services/settings.service';
import { SignatureService } from '../../services/signature.service';
import { CloudSignatureSubscription } from '../../models/signature.models';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AiSettingsComponent } from '../../components/ai-settings/ai-settings.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, TranslatePipe, AiSettingsComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  currentTheme: Theme | undefined;
  availableThemes: Theme[] = [];
  firstName: string = '';
  settings: Settings | null = null;

  /** Cloud Signing subscription (openfilz-cloud seal provider only). */
  cloudSubscription: CloudSignatureSubscription | null = null;
  cloudSubscriptionError = false;
  private cloudSubscriptionRequested = false;

  private themeService = inject(ThemeService);
  private settingsService = inject(SettingsService);
  private signatureService = inject(SignatureService);
  private oidcSecurityService = inject(OidcSecurityService);
  private translate = inject(TranslateService);

  constructor() { }

  ngOnInit(): void {
    this.availableThemes = this.themeService.availableThemes;
    this.themeService.currentTheme$.subscribe(theme => {
      this.currentTheme = theme;
    });

    this.settingsService.settings$.subscribe(settings => {
      this.settings = settings;
      if (settings?.signatureCloudActive && !this.cloudSubscriptionRequested) {
        this.cloudSubscriptionRequested = true;
        this.signatureService.cloudSubscription().subscribe({
          next: (sub) => { this.cloudSubscription = sub; },
          error: () => { this.cloudSubscriptionError = true; }
        });
      }
    });

    this.oidcSecurityService.userData$.subscribe((result: any) => {
      const userData = result.userData || result; // Handle both wrapper and direct object
      if (userData) {
        this.firstName = userData.given_name || userData.name || this.translate.instant('common.user');
      } else {
        this.firstName = this.translate.instant('common.user');
      }
    });
  }

  get showAiSettings(): boolean {
    return this.settingsService.isAiUserSettingsEnabled;
  }

  get hasQuotaInfo(): boolean {
    return this.settings !== null && (this.settings.fileQuotaMB !== null || this.settings.userQuotaMB !== null);
  }

  get showCloudSigning(): boolean {
    return this.settings?.signatureCloudActive === true;
  }

  get cloudUsagePct(): number {
    const sub = this.cloudSubscription;
    if (!sub || !sub.monthlyQuota) return 0;
    return Math.min(100, Math.round(100 * sub.usedThisMonth / sub.monthlyQuota));
  }

  onThemeChange(themeName: string) {
    this.themeService.setTheme(themeName);
  }
}
