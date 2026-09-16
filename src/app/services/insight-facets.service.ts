import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { SettingsService } from './settings.service';
import { InsightFacetCount, InsightFacets } from '../models/smart-filing.models';

const EMPTY_FACETS: InsightFacets = { categories: [], languages: [] };

/**
 * Search facets derived from the document insights (`GET /ai/insights/facets`): the kinds and
 * languages present in the library, with their counts. Fetched once per session (the list of
 * languages moves slowly; a stale count only ever hides a brand-new language until the next
 * reload) and shared by the filter panel and the active-filter chips. Also owns the labels: the
 * kind through `insights.categories.<key>`, the language through `languages.<code>` — both fall
 * back gracefully for values the UI does not know. Dedicated file for the enterprise fork.
 */
@Injectable({ providedIn: 'root' })
export class InsightFacetsService {
  private readonly baseUrl = environment.apiURL;
  private http = inject(HttpClient);
  private settingsService = inject(SettingsService);
  private translate = inject(TranslateService);

  private facets$?: Observable<InsightFacets>;

  /** Follows the backend's openfilz.ai.insights flag — the facets only exist when it is on. */
  get enabled(): boolean {
    return this.settingsService.isAiInsightsActive;
  }

  /** The deployment's closed category list (openfilz.ai.insights.categories), `other` included. */
  get categories(): string[] {
    return this.settingsService.aiInsightsCategories;
  }

  /** The facets, cached for the session; empty when the feature is off or the call fails (404 when AI is off). */
  getFacets(): Observable<InsightFacets> {
    if (!this.enabled) {
      return of(EMPTY_FACETS);
    }
    if (!this.facets$) {
      this.facets$ = this.http.get<InsightFacets>(`${this.baseUrl}/ai/insights/facets`).pipe(
        map(facets => ({
          categories: (facets?.categories ?? []).filter(f => !!f?.key),
          languages: (facets?.languages ?? []).filter(f => !!f?.key)
        })),
        catchError(() => {
          // A failed call is not worth remembering for the whole session: try again next time.
          this.facets$ = undefined;
          return of(EMPTY_FACETS);
        }),
        shareReplay(1)
      );
    }
    return this.facets$;
  }

  /** Languages carried by at least one document, most frequent first. */
  getLanguages(): Observable<InsightFacetCount[]> {
    return this.getFacets().pipe(
      map(facets => facets.languages.filter(l => l.count > 0).sort((a, b) => b.count - a.count))
    );
  }

  /** Forget the cached facets (after a re-enrichment, for instance). */
  invalidate(): void {
    this.facets$ = undefined;
  }

  /** The translated name of a kind; a category the deployment added keeps its key. */
  categoryLabel(key: string): string {
    const translationKey = `insights.categories.${key}`;
    const label = this.translate.instant(translationKey);
    return label === translationKey ? key : label;
  }

  /**
   * The name of a language: the app's own list first (`languages.<code>`), then the browser's
   * knowledge of the code, then the raw code.
   */
  languageLabel(code: string): string {
    const translationKey = `languages.${code}`;
    const label = this.translate.instant(translationKey);
    if (label !== translationKey) {
      return label;
    }
    try {
      const names = new Intl.DisplayNames([this.translate.currentLang || 'en'], { type: 'language' });
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  }

  /** Label of a facet filter value — one key, or several comma-separated ones. */
  facetLabel(field: 'category' | 'language', value: string): string {
    return value.split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .map(v => field === 'category' ? this.categoryLabel(v) : this.languageLabel(v))
      .join(', ');
  }
}
