import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SettingsService } from './settings.service';
import { DocumentInsights } from '../models/smart-filing.models';

/**
 * Read-only document insights (`GET /documents/{id}/insights`): title, author, summary,
 * keywords… extracted at upload time. Dedicated file to keep the enterprise fork merge simple.
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
}
