/**
 * File-type categories used by the quick file-type filter (folder toolbar) and the
 * advanced search filters dialog.
 *
 * A category maps a human-friendly label + icon to one or more content-type LIKE
 * patterns. The backend `ListFolderRequest.contentTypes` field matches them as a
 * case-insensitive OR of LIKE clauses, so:
 *   - `image/%`        matches every image content-type,
 *   - `application/pdf` (no `%`) is an exact match,
 *   - Office categories list both the legacy and the OOXML content-types (they don't
 *     share a single prefix), so e.g. both `.doc` and `.docx` are matched.
 *
 * `SearchFilters.fileType` stores a category **id** (e.g. `'word'`), or `'any'` for
 * no file-type restriction. Keep this the single source of truth for the mapping.
 */
export interface FileTypeCategory {
  /** Stable id stored in SearchFilters.fileType. */
  id: string;
  /** ngx-translate key for the label. */
  labelKey: string;
  /** Material icon name. */
  icon: string;
  /** Icon color (hex) — matches the usual file-type color coding. */
  color: string;
  /** Content-type LIKE patterns (case-insensitive, `%` wildcard). */
  patterns: string[];
}

export const ANY_FILE_TYPE = 'any';

export const FILE_TYPE_CATEGORIES: FileTypeCategory[] = [
  {
    id: 'pdf',
    labelKey: 'searchFilters.fileTypeOptions.pdfs',
    icon: 'picture_as_pdf',
    color: '#e53935',
    patterns: ['application/pdf']
  },
  {
    id: 'images',
    labelKey: 'searchFilters.fileTypeOptions.images',
    icon: 'image',
    color: '#8e24aa',
    patterns: ['image/%']
  },
  {
    id: 'word',
    labelKey: 'searchFilters.fileTypeOptions.documents',
    icon: 'description',
    color: '#1565c0',
    patterns: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
      'application/rtf'
    ]
  },
  {
    id: 'excel',
    labelKey: 'searchFilters.fileTypeOptions.spreadsheets',
    icon: 'table_chart',
    color: '#2e7d32',
    patterns: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
      'text/csv'
    ]
  },
  {
    id: 'powerpoint',
    labelKey: 'searchFilters.fileTypeOptions.presentations',
    icon: 'slideshow',
    color: '#ef6c00',
    patterns: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation'
    ]
  },
  {
    id: 'text',
    labelKey: 'searchFilters.fileTypeOptions.text',
    icon: 'article',
    color: '#546e7a',
    patterns: ['text/%']
  },
  {
    id: 'videos',
    labelKey: 'searchFilters.fileTypeOptions.videos',
    icon: 'movie',
    color: '#d81b60',
    patterns: ['video/%']
  },
  {
    id: 'audio',
    labelKey: 'searchFilters.fileTypeOptions.audio',
    icon: 'music_note',
    color: '#00897b',
    patterns: ['audio/%']
  },
  {
    id: 'archives',
    labelKey: 'searchFilters.fileTypeOptions.archives',
    icon: 'folder_zip',
    color: '#6d4c41',
    patterns: [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-7z-compressed',
      'application/x-rar-compressed',
      'application/vnd.rar'
    ]
  }
];

const CATEGORY_BY_ID = new Map(FILE_TYPE_CATEGORIES.map(c => [c.id, c]));

export function getFileTypeCategory(id?: string): FileTypeCategory | undefined {
  if (!id || id === ANY_FILE_TYPE) {
    return undefined;
  }
  return CATEGORY_BY_ID.get(id);
}

/** Content-type LIKE patterns for a category id, or `undefined` when no file-type filter applies. */
export function getFileTypePatterns(id?: string): string[] | undefined {
  return getFileTypeCategory(id)?.patterns;
}
