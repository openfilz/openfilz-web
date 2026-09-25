import { SearchFilters } from './document.models';
import { ANY_FILE_TYPE } from './file-type-filters';

/**
 * Search results page — sorting, filter-count, highlighting and recent-search helpers.
 *
 * Kept in a dedicated file (not in the components) so the enterprise fork can take it as is.
 */

/** Pseudo sort field: keep the search engine's relevance order (no `sort` sent to the API). */
export const RELEVANCE_SORT = 'relevance';

export type SortOrder = 'ASC' | 'DESC';

export interface SearchSortOption {
  value: string;
  labelKey: string;
  icon: string;
  /** Direction applied when the user picks this option (newest / largest first feels natural). */
  defaultOrder: SortOrder;
}

/** The sort fields offered on the results page; both search back-ends sort on them. */
export const SEARCH_SORT_OPTIONS: SearchSortOption[] = [
  { value: RELEVANCE_SORT, labelKey: 'searchResults.sort.relevance', icon: 'auto_awesome', defaultOrder: 'DESC' },
  { value: 'name', labelKey: 'common.name', icon: 'sort_by_alpha', defaultOrder: 'ASC' },
  { value: 'updatedAt', labelKey: 'common.dateModified', icon: 'edit_calendar', defaultOrder: 'DESC' },
  { value: 'createdAt', labelKey: 'sortOptions.dateCreated', icon: 'calendar_today', defaultOrder: 'DESC' },
  { value: 'size', labelKey: 'common.size', icon: 'data_usage', defaultOrder: 'DESC' }
];

export function findSortOption(value: string | undefined | null): SearchSortOption | undefined {
  return SEARCH_SORT_OPTIONS.find(o => o.value === value);
}

/** The "Date modified" choices shared by the filter panel and the refine bar. */
export const DATE_MODIFIED_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'any', labelKey: 'searchFilters.dateOptions.any' },
  { value: 'today', labelKey: 'searchFilters.dateOptions.today' },
  { value: 'last7', labelKey: 'searchFilters.dateOptions.last7' },
  { value: 'last30', labelKey: 'searchFilters.dateOptions.last30' }
];

/** Number of filters in force (scope excluded) — the badge on the filter buttons. */
export function countActiveFilters(filters: SearchFilters | undefined): number {
  if (!filters) {
    return 0;
  }
  let count = 0;
  if (filters.type) count++;
  if (filters.fileType && filters.fileType !== ANY_FILE_TYPE) count++;
  if (filters.dateModified && filters.dateModified !== 'any') count++;
  if (filters.owner?.trim()) count++;
  if (filters.metadata?.some(m => m.key?.trim())) count++;
  if (filters.category) count++;
  if (filters.language) count++;
  return count;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * `text` as HTML with every query term wrapped in `<mark>`; everything else escaped, so the
 * result is safe to bind with `[innerHTML]`.
 */
export function highlightTerms(text: string, query: string | undefined): string {
  const safe = escapeHtml(text || '');
  const terms = (query || '').trim().split(/\s+/).filter(t => t.length > 0)
    .map(t => escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // Longest first so "report" wins over "rep" when both are typed
    .sort((a, b) => b.length - a.length);
  if (terms.length === 0) {
    return safe;
  }
  const regex = new RegExp(`(${terms.join('|')})`, 'gi');
  return safe.replace(regex, '<mark>$1</mark>');
}

/**
 * A search snippet as HTML: the engine wraps matches in `<mark>`; everything else is escaped.
 */
export function sanitizeSnippet(snippet: string | undefined): string {
  if (!snippet) {
    return '';
  }
  return escapeHtml(snippet)
    .replace(/&lt;mark&gt;/g, '<mark>')
    .replace(/&lt;\/mark&gt;/g, '</mark>');
}

/** Recent searches, most recent first — kept in the browser only. */
const RECENT_SEARCHES_KEY = 'openfilz.recentSearches';
const RECENT_SEARCHES_MAX = 8;

export function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string').slice(0, RECENT_SEARCHES_MAX) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(query: string): string[] {
  const value = query.trim();
  if (!value) {
    return loadRecentSearches();
  }
  const next = [value, ...loadRecentSearches().filter(s => s.toLowerCase() !== value.toLowerCase())]
    .slice(0, RECENT_SEARCHES_MAX);
  writeRecentSearches(next);
  return next;
}

export function removeRecentSearch(query: string): string[] {
  const next = loadRecentSearches().filter(s => s !== query);
  writeRecentSearches(next);
  return next;
}

export function clearRecentSearches(): void {
  writeRecentSearches([]);
}

function writeRecentSearches(values: string[]): void {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(values));
  } catch {
    // Storage full or disabled: recent searches are a convenience only
  }
}
