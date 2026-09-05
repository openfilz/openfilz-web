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
}

/** PUT body: a null / absent field leaves the stored value unchanged. */
export interface AiPreferencesUpdate {
  autoFile?: boolean;
  autoFileNewFolders?: boolean;
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
export type FilingStage = 'NEIGHBOURS' | 'MODEL' | 'NONE';

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
