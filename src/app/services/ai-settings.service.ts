import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AiConnectionTestResult,
  AiModelsResponse,
  AiUserSettings,
  ListAiModelsRequest,
  SaveAiSettingsRequest
} from '../models/ai-settings.models';

/**
 * Per-user AI model settings (BYOK). Dedicated service file to keep the
 * enterprise fork merge simple. The API key is write-only: it is sent on
 * save/test and never returned by the backend.
 */
@Injectable({
  providedIn: 'root'
})
export class AiSettingsService {
  private readonly baseUrl = `${environment.apiURL}/settings/ai`;
  private http = inject(HttpClient);

  private settingsSubject = new BehaviorSubject<AiUserSettings | null>(null);
  /** Last loaded settings — the chat panel badge reads this. */
  public settings$ = this.settingsSubject.asObservable();

  loadSettings(): Observable<AiUserSettings> {
    return this.http.get<AiUserSettings>(this.baseUrl).pipe(
      tap(settings => this.settingsSubject.next(settings))
    );
  }

  saveSettings(request: SaveAiSettingsRequest): Observable<AiUserSettings> {
    return this.http.put<AiUserSettings>(this.baseUrl, request).pipe(
      tap(settings => this.settingsSubject.next(settings))
    );
  }

  resetSettings(): Observable<void> {
    return this.http.delete<void>(this.baseUrl).pipe(
      tap(() => {
        const current = this.settingsSubject.value;
        if (current) {
          this.settingsSubject.next({
            ...current, provider: null, model: null, baseUrl: null, hasApiKey: false, keySuffix: null
          });
        }
      })
    );
  }

  testConnection(request: SaveAiSettingsRequest): Observable<AiConnectionTestResult> {
    return this.http.post<AiConnectionTestResult>(`${this.baseUrl}/test`, request);
  }

  /**
   * The chat models the provider currently offers for this key. POST, not GET: the key travels in
   * the body so it never lands in an access log or the browser's history. The backend answers with
   * its built-in list (source: 'FALLBACK') rather than an error when the provider cannot be asked.
   */
  listModels(request: ListAiModelsRequest): Observable<AiModelsResponse> {
    return this.http.post<AiModelsResponse>(`${this.baseUrl}/models`, request);
  }

  get settings(): AiUserSettings | null {
    return this.settingsSubject.value;
  }
}
