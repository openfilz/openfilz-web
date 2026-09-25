import { DocumentType, FileItem, SearchFilters } from './document.models';
import { ANY_FILE_TYPE, getFileTypePatterns } from './file-type-filters';

/**
 * Search results page — sorting, refinement and highlighting helpers.
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

/**
 * The sort fields both search back-ends accept: the OpenSearch index maps `name` (keyword
 * sub-field), `updatedAt`, `createdAt` and `size`; the database path accepts the same names.
 * `type` / `createdBy` are deliberately absent: the index has no `type` field and `createdBy`
 * is a plain keyword, so sorting on them makes OpenSearch reject the whole query.
 */
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

/** The earliest modification date a `dateModified` choice lets through (undefined = any time). */
export function dateModifiedThreshold(value: string | undefined, now: Date = new Date()): Date | undefined {
  const date = new Date(now.getTime());
  switch (value) {
    case 'today':
      date.setHours(0, 0, 0, 0);
      return date;
    case 'last7':
      date.setDate(date.getDate() - 7);
      return date;
    case 'last30':
      date.setDate(date.getDate() - 30);
      return date;
    default:
      return undefined;
  }
}

/**
 * Content type of common extensions — for hits the search index returns without one (entries
 * indexed before it stored the content type).
 */
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain', md: 'text/markdown', log: 'text/plain', html: 'text/html', htm: 'text/html', css: 'text/css',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
  svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar', gz: 'application/gzip'
};

/** The item's content type, or the one its extension implies when the index returned none. */
export function effectiveContentType(item: { name?: string; contentType?: string }): string | undefined {
  if (item.contentType) {
    return item.contentType;
  }
  const name = item.name || '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? EXTENSION_CONTENT_TYPES[name.substring(dot + 1).toLowerCase()] : undefined;
}

/** Whether a content type matches a file-type category's LIKE patterns (`%` = wildcard). */
export function contentTypeMatchesCategory(contentType: string | undefined, categoryId: string | undefined): boolean {
  const patterns = getFileTypePatterns(categoryId);
  if (!patterns) {
    return true;
  }
  if (!contentType) {
    return false;
  }
  const value = contentType.toLowerCase();
  return patterns.some(pattern => {
    const p = pattern.toLowerCase();
    return p.endsWith('%') ? value.startsWith(p.slice(0, -1)) : value === p;
  });
}

/**
 * The filters a full-text search applies **in the browser** rather than in the query: type,
 * file type, modification date and owner. The search index cannot evaluate them reliably (it has
 * no `type` field, and `contentType` / `createdBy` / date bounds are not mapped as the generic
 * filter clause expects), so sending them would empty the results. Every hit carries the fields
 * needed to evaluate them locally.
 */
export function matchesSearchRefinements(item: FileItem, filters: SearchFilters | undefined, now: Date = new Date()): boolean {
  if (!filters) {
    return true;
  }
  if (filters.type && item.type !== filters.type) {
    return false;
  }
  if (filters.fileType && filters.fileType !== ANY_FILE_TYPE) {
    if (item.type === DocumentType.FOLDER || !contentTypeMatchesCategory(effectiveContentType(item), filters.fileType)) {
      return false;
    }
  }
  const threshold = dateModifiedThreshold(filters.dateModified, now);
  if (threshold) {
    const stamp = item.updatedAt || item.createdAt;
    if (!stamp || new Date(stamp).getTime() < threshold.getTime()) {
      return false;
    }
  }
  const owner = filters.owner?.trim().toLowerCase();
  if (owner) {
    const createdBy = (item.createdBy || '').toLowerCase();
    if (!createdBy.includes(owner)) {
      return false;
    }
  }
  return true;
}

/** The filters sent with a full-text query: everything except the browser-side refinements. */
export function serverSideSearchFilters(filters: SearchFilters): SearchFilters {
  return { ...filters, type: undefined, fileType: ANY_FILE_TYPE, dateModified: 'any', owner: '' };
}

/** Whether any browser-side refinement is set. */
export function hasSearchRefinements(filters: SearchFilters | undefined): boolean {
  return !!filters && (!!filters.type
    || (!!filters.fileType && filters.fileType !== ANY_FILE_TYPE)
    || (!!filters.dateModified && filters.dateModified !== 'any')
    || !!filters.owner?.trim());
}

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
