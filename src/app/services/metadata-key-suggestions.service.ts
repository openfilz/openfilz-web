import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { MetadataKeySuggestion } from '../utils/metadata-key-filter';

export type { MetadataKeySuggestion } from '../utils/metadata-key-filter';

/** How long a fetched key list is reused before the next panel opening fetches it again. */
const CLIENT_TTL_MS = 60_000;

/**
 * Keys suggested by the metadata rows of the search filter panel. Fetched when the panel opens,
 * then filtered on the client while the user types (`utils/metadata-key-filter.ts`): the server is
 * asked at most once a minute. Answers an empty list when the server has the suggestions switched
 * off (404 — remembered for the session, the key field stays a plain text input) or when the call
 * fails (tried again at the next opening). Dedicated file for the enterprise fork.
 */
@Injectable({ providedIn: 'root' })
export class MetadataKeySuggestionsService {
  private readonly baseUrl = environment.apiURL;
  private http = inject(HttpClient);

  private keys$?: Observable<MetadataKeySuggestion[]>;
  private fetchedAt = 0;
  private disabled = false;

  getKeys(): Observable<MetadataKeySuggestion[]> {
    if (this.disabled) {
      return of([]);
    }
    if (!this.keys$ || Date.now() - this.fetchedAt > CLIENT_TTL_MS) {
      this.fetchedAt = Date.now();
      this.keys$ = this.http.get<MetadataKeySuggestion[]>(`${this.baseUrl}/documents/metadata-keys`).pipe(
        map(keys => (keys ?? []).filter(k => !!k?.key)),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.disabled = true;
          } else {
            this.keys$ = undefined;
          }
          return of([]);
        }),
        shareReplay(1)
      );
    }
    return this.keys$;
  }
}
