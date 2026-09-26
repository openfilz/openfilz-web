import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ThemeService, Theme } from '../../services/theme.service';
import { SettingsService, Settings } from '../../services/settings.service';
import { QuotaService } from '../../services/quota.service';
import { MyStorageQuota } from '../../models/quota.models';
import { formatFileSize } from '../../utils/file-size.util';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AiSettingsComponent } from '../../components/ai-settings/ai-settings.component';
import { McpSettingsComponent } from '../../components/mcp-settings/mcp-settings.component';
import { SmartFilingToggleComponent } from '../../components/smart-filing-toggle/smart-filing-toggle.component';
import { AiMaintenanceComponent } from '../../components/ai-maintenance/ai-maintenance.component';
import { AiMaintenanceService } from '../../services/ai-maintenance.service';
import { SignatureService } from '../../services/signature.service';
import { CloudSignatureSubscription } from '../../models/signature.models';
import { IS_ENTERPRISE } from '../../edition';
import { LocalDatePipe } from '../../i18n/local-date.pipe';
import { SwipeNavDirective } from '../../directives/swipe-nav.directive';

/** One category of the settings page — one entry of the navigation, one pane. */
export type SettingsSectionId =
  'overview' | 'storage' | 'appearance' | 'ai' | 'integrations' | 'signatures';

interface SettingsSection {
  id: SettingsSectionId;
  icon: string;
}

/**
 * Settings, organised as a small settings app: a profile header with a "search settings" box, a
 * navigation of categories (a sticky side list on desktop, a scrollable chip bar on phones — swipe
 * the pane to move between them) and one category at a time. "At a glance" summarises every
 * category. The open category lives in the URL (`?section=storage`) so any screen can deep-link to
 * it, and the browser's back button walks the categories.
 *
 * Categories only appear when the deployment has something to show in them (AI features, e-Sign,
 * MCP…), so a small deployment gets a small page.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    LocalDatePipe, CommonModule, FormsModule, TranslatePipe,
    MatIconModule, MatButtonModule, MatProgressSpinnerModule,
    AiSettingsComponent, McpSettingsComponent, SmartFilingToggleComponent, AiMaintenanceComponent,
    SwipeNavDirective
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  currentTheme: Theme | undefined;
  availableThemes: Theme[] = [];
  firstName: string = '';
  fullName: string = '';
  email: string = '';
  initials: string = '';
  settings: Settings | null = null;

  /** Open category (mirrors `?section=`). */
  active: SettingsSectionId = 'overview';
  /** "Search settings" box: filters the navigation, Enter opens the first match. */
  query = '';

  /** Cloud Signing subscription (openfilz-cloud seal provider only). */
  cloudSubscription: CloudSignatureSubscription | null = null;
  cloudSubscriptionError = false;
  private cloudSubscriptionRequested = false;

  private themeService = inject(ThemeService);
  private settingsService = inject(SettingsService);
  private quotaService = inject(QuotaService);
  /** The caller's usage and effective limit (GET /quotas/me); null until loaded or when unavailable. */
  myQuota: MyStorageQuota | null = null;
  readonly formatBytes = formatFileSize;
  private aiMaintenance = inject(AiMaintenanceService);
  private signatureService = inject(SignatureService);
  private oidcSecurityService = inject(OidcSecurityService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Every category, in navigation order; `visibleSections` keeps the ones with something to show. */
  private readonly allSections: SettingsSection[] = [
    { id: 'overview', icon: 'space_dashboard' },
    { id: 'storage', icon: 'cloud_queue' },
    { id: 'appearance', icon: 'palette' },
    { id: 'ai', icon: 'auto_awesome' },
    { id: 'integrations', icon: 'hub' },
    { id: 'signatures', icon: 'draw' }
  ];

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const requested = params.get('section') as SettingsSectionId | null;
      this.active = requested && this.allSections.some(s => s.id === requested) ? requested : 'overview';
    });

    this.quotaService.myQuota().subscribe({
      next: quota => this.myQuota = quota,
      error: () => this.myQuota = null
    });
    this.availableThemes = this.themeService.availableThemes;
    this.themeService.currentTheme$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(theme => {
      this.currentTheme = theme;
    });

    this.settingsService.settings$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(settings => {
      this.settings = settings;
      if (settings?.signatureCloudActive && !this.cloudSubscriptionRequested) {
        this.cloudSubscriptionRequested = true;
        this.signatureService.cloudSubscription().subscribe({
          next: (sub) => { this.cloudSubscription = sub; },
          error: () => { this.cloudSubscriptionError = true; }
        });
      }
    });

    this.oidcSecurityService.userData$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result: any) => {
      const userData = result?.userData || result; // Handle both wrapper and direct object
      const fallback = this.translate.instant('common.user');
      this.firstName = userData?.given_name || userData?.name || fallback;
      this.fullName = userData?.name
        || [userData?.given_name, userData?.family_name].filter(Boolean).join(' ')
        || userData?.preferred_username || fallback;
      this.email = userData?.email || '';
      this.initials = this.computeInitials(userData, this.fullName);
    });
  }

  private computeInitials(userData: any, fullName: string): string {
    if (userData?.given_name && userData?.family_name) {
      return (userData.given_name[0] + userData.family_name[0]).toUpperCase();
    }
    const parts = (fullName || userData?.email || '?').split(/[\s.@_-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  // ------------------------------------------------------------------ navigation

  /** Whether a category has anything to show on this deployment. */
  private isVisible(id: SettingsSectionId): boolean {
    switch (id) {
      case 'ai': return this.showAiChatUnavailable || this.showAiSettings || this.showSmartFiling || this.showAiMaintenance;
      case 'integrations': return this.showMcpSettings;
      case 'signatures': return this.showCloudSigning || this.showCloudSigningUpsell;
      default: return true;
    }
  }

  get visibleSections(): SettingsSection[] {
    return this.allSections.filter(s => this.isVisible(s.id));
  }

  /** The navigation, narrowed by the search box (title, description and keywords of each category). */
  get navSections(): SettingsSection[] {
    const q = this.normalize(this.query);
    if (!q) return this.visibleSections;
    return this.visibleSections.filter(s => s.id !== 'overview' && this.searchText(s.id).includes(q));
  }

  private searchText(id: SettingsSectionId): string {
    return this.normalize([
      this.translate.instant('settings.nav.' + id),
      this.translate.instant('settings.navDesc.' + id),
      this.translate.instant('settings.keywords.' + id)
    ].join(' '));
  }

  /** Case- and accent-insensitive, so "securite" finds "Sécurité". */
  private normalize(text: string): string {
    return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /** The category shown: the requested one when visible, else the overview. */
  get current(): SettingsSectionId {
    return this.isVisible(this.active) ? this.active : 'overview';
  }

  get currentSection(): SettingsSection {
    return this.allSections.find(s => s.id === this.current)!;
  }

  select(id: SettingsSectionId): void {
    if (id === this.current) return;
    this.active = id;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section: id === 'overview' ? null : id },
      queryParamsHandling: 'merge'
    });
  }

  /** Swipe / arrow keys: the neighbouring category of the (unfiltered) navigation. */
  step(delta: number): void {
    const list = this.visibleSections;
    const index = list.findIndex(s => s.id === this.current);
    const next = list[index + delta];
    if (next) this.select(next.id);
  }

  get canStepNext(): boolean {
    const list = this.visibleSections;
    return list.findIndex(s => s.id === this.current) < list.length - 1;
  }

  get canStepPrev(): boolean {
    return this.visibleSections.findIndex(s => s.id === this.current) > 0;
  }

  onNavKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.step(1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      this.step(-1);
    }
  }

  onSearchEnter(): void {
    const first = this.navSections[0];
    if (first) {
      this.select(first.id);
      this.query = '';
    }
  }

  clearSearch(): void {
    this.query = '';
  }

  // ------------------------------------------------------------------ one-line status per category

  /** The short state shown under each category in the navigation and on its overview tile. */
  status(id: SettingsSectionId): string {
    switch (id) {
      case 'storage':
        if (!this.myQuota) return this.translate.instant('settings.navDesc.storage');
        return this.myQuota.limitBytes
          ? this.translate.instant('settings.storage.usedOf', { used: formatFileSize(this.myQuota.usedBytes), limit: formatFileSize(this.myQuota.limitBytes) })
          : this.translate.instant('settings.storage.usedUnlimited', { used: formatFileSize(this.myQuota.usedBytes) });
      case 'appearance':
        return this.currentTheme ? this.translate.instant('settings.themes.' + this.currentTheme.name) : '';
      case 'signatures':
        if (this.cloudSubscription) {
          return this.translate.instant('settings.status.signaturesLeft', { count: this.cloudSubscription.remaining });
        }
        return this.translate.instant('settings.navDesc.signatures');
      default:
        return this.translate.instant('settings.navDesc.' + id);
    }
  }

  // ------------------------------------------------------------------ storage

  /** Share of the caller's limit in use (0–100+), null when unlimited or unknown. */
  get storagePercent(): number | null {
    const q = this.myQuota;
    if (!q || !q.limitBytes) return null;
    return Math.round((q.usedBytes / q.limitBytes) * 100);
  }

  get storageLevel(): 'ok' | 'warn' | 'full' {
    const pct = this.storagePercent;
    return pct === null || pct < 80 ? 'ok' : pct < 100 ? 'warn' : 'full';
  }

  /** Days after which the recycle bin empties itself, when the deployment does so. */
  get binCleanupDays(): number | null {
    return this.settings?.emptyBinInterval ?? null;
  }

  // ------------------------------------------------------------------ feature gates (unchanged)

  /**
   * AI is on but no chat model is configured (aiChatUnavailableReason NO_MODEL): explain why the
   * assistant is missing instead of silently hiding it. Nothing for DISABLED — the operator chose that.
   */
  get showAiChatUnavailable(): boolean {
    return this.settingsService.isAiChatMissingModel;
  }

  /** Env var names are passed as params so no locale ever translates them. */
  readonly aiChatConfigParams = { model: 'OPENFILZ_AI_MODEL', key: 'OPENFILZ_AI_API_KEY' };

  get showAiSettings(): boolean {
    return this.settingsService.isAiUserSettingsEnabled;
  }

  /** The AI maintenance jobs (re-embed, re-enrich): AI on and the CONTRIBUTOR role, whatever BYOK says. */
  get showAiMaintenance(): boolean {
    return this.aiMaintenance.enabled;
  }

  /** Smart filing switches follow openfilz.ai.auto-file.active alone (independent of BYOK). */
  get showSmartFiling(): boolean {
    return this.settingsService.isAiAutoFileActive;
  }

  /**
   * Follows openfilz.mcp.active only. Not `showAiSettings`: MCP serves external agents and a
   * deployment can run it with the in-app assistant (or per-user BYOK) switched off.
   */
  get showMcpSettings(): boolean {
    return this.settingsService.isMcpActive;
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

  /** Passive "Discover Enterprise" card — CE only (this fork sets IS_ENTERPRISE). */
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

  /** 0 / null = no limit ("Unlimited"), never "0 MB". */
  private limitLabel(bytes: number | null | undefined): string {
    return bytes && bytes > 0 ? formatFileSize(bytes) : this.translate.instant('settings.quotas.unlimited');
  }

  get fileLimitLabel(): string {
    const fromSettings = this.settings?.fileQuotaMB ? this.settings.fileQuotaMB * 1024 * 1024 : null;
    return this.limitLabel(this.myQuota ? this.myQuota.maxFileSizeBytes : fromSettings);
  }

  /** The caller's effective limit (their own, their team's or the default). */
  get storageLimitLabel(): string {
    const fromSettings = this.settings?.userQuotaMB ? this.settings.userQuotaMB * 1024 * 1024 : null;
    return this.limitLabel(this.myQuota ? this.myQuota.limitBytes : fromSettings);
  }

  get quotaSourceLabel(): string {
    if (!this.myQuota) return '';
    return this.translate.instant('settings.quotas.source.' + this.myQuota.source, { team: this.myQuota.sourceName ?? '' });
  }

  onThemeChange(themeName: string) {
    this.themeService.setTheme(themeName);
  }
}
