import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AppConfig } from '../config/app.config';

export interface UserPreferences {
  theme: string;
  pageSize: number;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  /** Open the document a PDF tool produced, when it produced exactly one. */
  openPdfToolResult: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class UserPreferencesService {
  private readonly THEME_KEY = 'user-theme';
  private readonly PAGE_SIZE_KEY = AppConfig.pagination.itemsPerPageKey;
  private readonly SORT_BY_KEY = 'user-sort-by';
  private readonly SORT_ORDER_KEY = 'user-sort-order';
  private readonly OPEN_PDF_TOOL_RESULT_KEY = 'user-open-pdf-tool-result';

  private preferencesSubject = new BehaviorSubject<UserPreferences>(this.loadPreferences());
  preferences$ = this.preferencesSubject.asObservable();

  constructor() {}

  private loadPreferences(): UserPreferences {
    return {
      theme: localStorage.getItem(this.THEME_KEY) || 'light',
      pageSize: parseInt(localStorage.getItem(this.PAGE_SIZE_KEY) || String(AppConfig.pagination.defaultPageSize), 10),
      sortBy: localStorage.getItem(this.SORT_BY_KEY) || 'name',
      sortOrder: (localStorage.getItem(this.SORT_ORDER_KEY) as 'ASC' | 'DESC') || 'ASC',
      // Opt-out preference: absent means "yes", so the box starts checked.
      openPdfToolResult: localStorage.getItem(this.OPEN_PDF_TOOL_RESULT_KEY) !== 'false'
    };
  }

  getPreferences(): UserPreferences {
    return this.preferencesSubject.value;
  }

  setTheme(theme: string): void {
    localStorage.setItem(this.THEME_KEY, theme);
    this.updateSubject({ theme });
  }

  setPageSize(pageSize: number): void {
    localStorage.setItem(this.PAGE_SIZE_KEY, pageSize.toString());
    this.updateSubject({ pageSize });
  }

  setSort(sortBy: string, sortOrder: 'ASC' | 'DESC'): void {
    localStorage.setItem(this.SORT_BY_KEY, sortBy);
    localStorage.setItem(this.SORT_ORDER_KEY, sortOrder);
    this.updateSubject({ sortBy, sortOrder });
  }

  setOpenPdfToolResult(openPdfToolResult: boolean): void {
    localStorage.setItem(this.OPEN_PDF_TOOL_RESULT_KEY, String(openPdfToolResult));
    this.updateSubject({ openPdfToolResult });
  }

  private updateSubject(updates: Partial<UserPreferences>): void {
    this.preferencesSubject.next({ ...this.preferencesSubject.value, ...updates });
  }
}
