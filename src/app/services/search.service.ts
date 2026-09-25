import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from "../../environments/environment";
import { DocumentSearchResult, Suggestion, SearchFilters, FilterInput } from "../models/document.models";
import { DocumentApiService } from "./document-api.service";
import { UserPreferencesService } from './user-preferences.service';

@Injectable({
  providedIn: 'root'
})
export class SearchService {

  private readonly suggestionsUrl = environment.apiURL + '/suggestions'; // Your backend endpoint

  private filtersSubject = new BehaviorSubject<SearchFilters>({});
  public filters$ = this.filtersSubject.asObservable();

  private sortSubject = new BehaviorSubject<{ sortBy: string, sortOrder: 'ASC' | 'DESC' }>({ sortBy: 'name', sortOrder: 'ASC' });
  public sort$ = this.sortSubject.asObservable();

  /** Asks the header to open its advanced filters panel (e.g. "All filters" on the results page). */
  private advancedFiltersRequests = new Subject<void>();
  public advancedFiltersRequested$ = this.advancedFiltersRequests.asObservable();

  private http = inject(HttpClient);
  private documentApi = inject(DocumentApiService);
  private userPreferencesService = inject(UserPreferencesService);

  constructor() {
    const prefs = this.userPreferencesService.getPreferences();
    this.sortSubject.next({ sortBy: prefs.sortBy, sortOrder: prefs.sortOrder });
  }

  updateFilters(filters: SearchFilters) {
    this.filtersSubject.next(filters);
  }

  getCurrentFilters(): SearchFilters {
    return this.filtersSubject.value;
  }

  updateSort(sortBy: string, sortOrder: 'ASC' | 'DESC') {
    this.sortSubject.next({ sortBy, sortOrder });
    this.userPreferencesService.setSort(sortBy, sortOrder);
  }

  getSuggestions(query: string): Observable<Suggestion[]> {
    console.log('getSuggestions for query: ' + query);
    if (!query.trim()) {
      // If the query is empty, return an empty array immediately
      return new Observable(observer => observer.next([]));
    }

    const params = new HttpParams().set('q', query);
    return this.http.get<Suggestion[]>(this.suggestionsUrl, { params });
  }

  requestAdvancedFilters(): void {
    this.advancedFiltersRequests.next();
  }

  /**
   * Full-text search. Without options: first page, current filters and sort. The results page
   * passes its own page, filters and sort (`sort: null` = relevance order).
   */
  searchDocuments(query: string, options?: SearchPageOptions): Observable<DocumentSearchResult> {
    const filters = options?.filters ?? this.filtersSubject.value;
    let sortInput: { field: string; order: 'ASC' | 'DESC' } | null;
    if (options && options.sort !== undefined) {
      sortInput = options.sort;
    } else {
      const currentSort = this.sortSubject.value;
      sortInput = { field: currentSort.sortBy, order: currentSort.sortOrder };
    }
    return this.documentApi.searchDocuments(query, filters, sortInput, options?.page ?? 1, options?.size ?? 20);
  }
}

export interface SearchPageOptions {
  /** 1-based page number. */
  page?: number;
  size?: number;
  /** Explicit sort; `null` keeps the search engine's relevance order. */
  sort?: { field: string; order: 'ASC' | 'DESC' } | null;
  /** Filters to send instead of the current ones. */
  filters?: SearchFilters;
}
