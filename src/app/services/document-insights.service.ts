import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SettingsService } from './settings.service';
import { DocumentInsights } from '../models/smart-filing.models';

/**
 * Document insights (`GET /documents/{id}/insights`): title, author, summary, keywords…
 * extracted at upload time, and the one thing a user may correct — the kind of the document
 * (`PATCH /documents/{id}/insights`), which teaches the learned classifier and drives the
 * by-kind reorganisation. Dedicated file to keep the enterprise fork merge simple.
 */
@Injectable({ providedIn: 'root' })
export class DocumentInsightsService {
  private readonly baseUrl = environment.apiURL;
  private http = inject(HttpClient);
  private settingsService = inject(SettingsService);

  /** Follows the backend's openfilz.ai.insights flag — nothing is fetched when it is off. */
  get enabled(): boolean {
    return this.settingsService.isAiInsightsActive;
  }

  /** The deployment's closed category list (openfilz.ai.insights.categories), `other` included. */
  get categories(): string[] {
    return this.settingsService.aiInsightsCategories;
  }

  /**
   * The insights of a document, or null when there are none (404 is the normal case for
   * folders and for files uploaded before the feature existed) or when the call fails —
   * the details panel simply hides the section.
   */
  getInsights(documentId: string): Observable<DocumentInsights | null> {
    if (!this.enabled) {
      return of(null);
    }
    return this.http.get<DocumentInsights>(`${this.baseUrl}/documents/${documentId}/insights`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Correct the kind of a document. The row is then written by "user": never overwritten by a
   * non-forced backfill, an example for the learned classifier, a label for the by-kind
   * reorganisation. Errors (400 unknown kind, 403 no modify access) reach the caller.
   */
  setCategory(documentId: string, category: string): Observable<DocumentInsights> {
    return this.http.patch<DocumentInsights>(`${this.baseUrl}/documents/${documentId}/insights`, { category });
  }
}
