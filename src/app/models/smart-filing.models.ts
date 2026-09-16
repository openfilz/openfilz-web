/**
 * API contract of the AI "smart filing" + document insights features
 * (`/api/v1/settings/ai/preferences`, `/api/v1/ai/auto-file/**`, `/api/v1/documents/{id}/insights`).
 * Dedicated file so the enterprise fork can take it as-is.
 */

/** GET / PUT /settings/ai/preferences */
export interface AiPreferences {
  /** False when the deployment cannot file documents for this user (feature off, no model…). */
  autoFileAvailable: boolean;
  /** "Let OpenFilz choose the folder" — applied to uploads that do not say otherwise. */
  autoFile: boolean;
  /** "May create new folders" — only meaningful when autoFile is on. */
  autoFileNewFolders: boolean;
  /** True when the deployment offers the Inbox folder (Inbox switch on and filing available for this user). */
  inboxAvailable?: boolean;
  /** "Use an Inbox folder" — the user has an Inbox. */
  inbox?: boolean;
  /** The user's Inbox folder (a root folder named in the user's language); null when there is none. */
  inboxFolderId?: string | null;
}

/**
 * PUT body: a null / absent field leaves the stored value unchanged. Turning `inbox` on creates
 * (or reuses) the Inbox folder, named after the request's Accept-Language.
 */
export interface AiPreferencesUpdate {
  autoFile?: boolean;
  autoFileNewFolders?: boolean;
  inbox?: boolean;
}

export type DocumentInsightsStatus = 'PENDING' | 'DONE' | 'FAILED' | 'SKIPPED';

/** GET /documents/{id}/insights — read-only, derived from the file at upload time. */
export interface DocumentInsights {
  documentId: string;
  fileTitle?: string | null;
  fileAuthor?: string | null;
  fileCreatedAt?: string | null;
  fileModifiedAt?: string | null;
  pageCount?: number | null;
  language?: string | null;
  category?: string | null;
  summary?: string | null;
  keywords?: string[] | null;
  entities?: Record<string, string> | null;
  tier?: 1 | 2;
  model?: string | null;
  promptVersion?: string | null;
  status: DocumentInsightsStatus;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type FilingStatus = 'FILED' | 'SKIPPED' | 'FAILED' | 'UNDONE' | 'PENDING';
export type FilingStage = 'NEIGHBOURS' | 'RULE' | 'MODEL' | 'NONE';

/** What happened to one document of a filing job. */
export interface FilingOutcome {
  documentId: string;
  name: string;
  status: FilingStatus;
  /** null = root level */
  fromFolderId?: string | null;
  fromPath?: string | null;
  toFolderId?: string | null;
  toPath?: string | null;
  stage?: FilingStage;
  confidence?: number | null;
  reason?: string | null;
  /** Handle for the single-document undo (`POST /ai/auto-file/filing/{planId}/undo`). */
  planId?: string | null;
  decidedAt?: string | null;
}

export type AutoFileJobStatus = 'RUNNING' | 'DONE' | 'UNDONE';

/** GET /ai/auto-file/{jobId} */
export interface AutoFileJob {
  jobId: string;
  createdBy?: string;
  status: AutoFileJobStatus;
  total: number;
  filed: number;
  skipped: number;
  failed: number;
  pending: number;
  items: FilingOutcome[];
  createdAt?: string;
  finishedAt?: string | null;
}

/** Carried by an upload response when filing was scheduled for that upload batch. */
export interface AutoFileInfo {
  jobId: string;
  status: string;
}

/** POST /ai/auto-file — file existing documents on demand. */
export interface AutoFileRequest {
  documentIds: string[];
  allowNewFolders?: boolean;
}

/** POST /ai/auto-file/inbox — file every loose file lying in the caller's Inbox (404 = no Inbox). */
export interface AutoFileInboxRequest {
  allowNewFolders?: boolean;
}

/** One value of a facet and how many documents carry it. */
export interface InsightFacetCount {
  key: string;
  count: number;
}

/** GET /ai/insights/facets — the kinds and languages present in the library (404 when AI is off). */
export interface InsightFacets {
  categories: InsightFacetCount[];
  languages: InsightFacetCount[];
}

/**
 * POST /ai/auto-file/jobs — the whole upload batch in one call. One upload request is sent per
 * file, so a batch leaves one filing job per file: polling them one by one was as many requests
 * every couple of seconds.
 */
export interface AutoFileJobsRequest {
  jobIds: string[];
}
