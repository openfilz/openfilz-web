import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface Settings {
  emptyBinInterval: number | null;
  fileQuotaMB: number | null;
  userQuotaMB: number | null;
  thumbnailsActive: boolean;
  aiActive: boolean;
  aiUserSettingsEnabled: boolean;
  /** openfilz.signature.active on the API — the only switch for the e-Sign UI. */
  signatureActive?: boolean;
  /** True when initiating signature requests also requires the SIGN_REQUESTER role (openfilz.signature.require-requester-role). */
  signatureRequesterRoleRequired?: boolean;
  /** Recipient authentication methods this deployment can actually deliver (NONE + available OTP channels). */
  signatureAuthMethods?: string[];
  /** False when the backend records a reminder cadence but has nothing to act on it. */
  signatureRemindersActive?: boolean;
  /** True when the openfilz-cloud seal provider is configured — Settings shows the subscription card. */
  signatureCloudActive?: boolean;
  /** True on shared public demo deployments — shows the demo disclaimers. */
  demoMode?: boolean;
  /** Effective e-Sign seal provider id (null/absent when e-Sign is off) — 'self-signed-dev' triggers the untrusted-seal notice. */
  sealProvider?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly baseUrl = environment.apiURL;
  private http = inject(HttpClient);

  private settingsSubject = new BehaviorSubject<Settings | null>(null);
  public settings$ = this.settingsSubject.asObservable();

  // No manual Authorization or Content-Type. Authorization is injected by the global
  // authInterceptor() from angular-auth-oidc-client (see main.ts secureRoutes).
  // Content-Type is set automatically by Angular's HttpClient when a request body
  // is passed as an object.

  loadSettings(): Observable<Settings> {
    return this.http.get<Settings>(`${this.baseUrl}/settings`).pipe(
      tap(settings => this.settingsSubject.next(settings)),
      catchError(error => {
        console.error('Failed to load settings', error);
        // Default to null (recycle bin disabled)
        this.settingsSubject.next({ emptyBinInterval: null, fileQuotaMB: null, userQuotaMB: null, thumbnailsActive: false, aiActive: false, aiUserSettingsEnabled: false, signatureActive: false, signatureAuthMethods: ['NONE'] });
        return of({ emptyBinInterval: null, fileQuotaMB: null, userQuotaMB: null, thumbnailsActive: false, aiActive: false, aiUserSettingsEnabled: false, signatureActive: false, signatureAuthMethods: ['NONE'] });
      })
    );
  }

  get settings(): Settings | null {
    return this.settingsSubject.value;
  }

  get emptyBinInterval(): number | null {
    return this.settingsSubject.value?.emptyBinInterval ?? null;
  }

  get isRecycleBinEnabled(): boolean {
    return this.emptyBinInterval !== null;
  }

  get isThumbnailsActive(): boolean {
    return this.settingsSubject.value?.thumbnailsActive ?? false;
  }

  // Driven by openfilz.ai.active on the API: the AI endpoints only exist when that flag is on,
  // so the chat UI follows the backend rather than a frontend toggle of its own.
  get isAiActive(): boolean {
    return this.settingsSubject.value?.aiActive ?? false;
  }

  // BYOK: users may override the chat LLM with their own provider + API key.
  // Follows the backend's openfilz.ai.user-settings.enabled flag.
  get isAiUserSettingsEnabled(): boolean {
    return (this.settingsSubject.value?.aiActive ?? false)
      && (this.settingsSubject.value?.aiUserSettingsEnabled ?? false);
  }

  // Driven by openfilz.signature.active on the API: the e-Sign endpoints only exist when
  // that flag is on, so the "Signatures" menu + "Request signature" action follow it.
  /**
   * Only offer a recipient authentication method the server can deliver: an SMS gateway is
   * optional, and creating an envelope with SMS_OTP without one strands the signer on an OTP
   * step that can never be sent (the API refuses it with 422).
   */
  get areSignatureRemindersActive(): boolean {
    return this.settingsSubject.value?.signatureRemindersActive === true;
  }

  get signatureAuthMethods(): string[] {
    return this.settingsSubject.value?.signatureAuthMethods ?? ['NONE'];
  }

  get isSignatureActive(): boolean {
    return this.settingsSubject.value?.signatureActive ?? false;
  }

  /** When true, only users holding the SIGN_REQUESTER role may initiate signature requests. */
  get isSignatureRequesterRoleRequired(): boolean {
    return this.settingsSubject.value?.signatureRequesterRoleRequired === true;
  }

  /** Shared public demo deployment — the demo disclaimers follow this backend flag. */
  get isDemoMode(): boolean {
    return this.settingsSubject.value?.demoMode === true;
  }

  /**
   * True when completed envelopes are sealed with the throwaway dev certificate —
   * Acrobat reports those signatures as untrusted, so the UI shows the seal notice.
   * Any real seal (pkcs12, azure-keyvault, openfilz-cloud) turns the notice off.
   */
  get isDevSeal(): boolean {
    return this.isSignatureActive && this.settingsSubject.value?.sealProvider === 'self-signed-dev';
  }
}
