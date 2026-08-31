import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ThemeService, Theme } from '../../services/theme.service';
import { SettingsService, Settings } from '../../services/settings.service';
import { SignatureService } from '../../services/signature.service';
import { CloudSignatureSubscription } from '../../models/signature.models';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AiSettingsComponent } from '../../components/ai-settings/ai-settings.component';
import { McpSettingsComponent } from '../../components/mcp-settings/mcp-settings.component';
import { IS_ENTERPRISE } from '../../edition';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule, TranslatePipe, AiSettingsComponent, McpSettingsComponent],
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

  /**
   * Follows openfilz.mcp.active only. Not `showAiSettings`: MCP serves external agents and a
   * deployment can run it with the in-app assistant (or per-user BYOK) switched off.
   */
  get showMcpSettings(): boolean {
    return this.settingsService.isMcpActive;
  }

  get hasQuotaInfo(): boolean {
    return this.settings !== null && (this.settings.fileQuotaMB !== null || this.settings.userQuotaMB !== null);
  }

  get showCloudSigning(): boolean {
    return this.settings?.signatureCloudActive === true;
  }

  /**
   * Upsell card in the Cloud Signing slot: only when envelopes are sealed with the
   * throwaway dev certificate. A deployment with its own AATL seal (pkcs12,
   * azure-keyvault) already paid for trusted signatures — never upsell those.
   */
  get showCloudSigningUpsell(): boolean {
    return !this.showCloudSigning
      && this.settings?.signatureActive === true
      && this.settings?.sealProvider === 'self-signed-dev';
  }

  /** Passive "Discover Enterprise" card — CE only (the EE fork sets IS_ENTERPRISE). */
  readonly showDiscoverEe = !IS_ENTERPRISE;

  /** EE branches the upsell card copy + CTA (license option vs CE marketing signup). */
  readonly isEnterprise = IS_ENTERPRISE;

  readonly cloudSigningUrl = 'https://www.openfilz.com/esign/cloud-signing';
  readonly aatlPackUrl = 'https://www.openfilz.com/esign/aatl-onboarding';
  /** Self-service license upgrade in the customer portal, CLOUD_SIGN preselected (EE). */
  readonly licenseUpgradeUrl = 'https://www.openfilz.com/portal/upgrade?feature=CLOUD_SIGN';
  readonly enterpriseUrl = 'https://www.openfilz.com/enterprise';
  readonly eeDemoUrl = 'https://app.openfilz.com';

  get cloudUsagePct(): number {
    const sub = this.cloudSubscription;
    if (!sub || !sub.monthlyQuota) return 0;
    return Math.min(100, Math.round(100 * sub.usedThisMonth / sub.monthlyQuota));
  }

  onThemeChange(themeName: string) {
    this.themeService.setTheme(themeName);
  }
}
