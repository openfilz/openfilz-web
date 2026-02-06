/**
 * Models for TUS resumable upload functionality.
 */

/**
 * Upload status enum.
 */
export type UploadStatus = 'pending' | 'uploading' | 'paused' | 'completed' | 'error' | 'cancelled';

/**
 * Represents the progress of a single upload.
 */
export interface UploadProgress {
  /** Unique identifier for this upload */
  uploadId: string;
  /** Original filename */
  filename: string;
  /** Total file size in bytes */
  totalSize: number;
  /** Bytes uploaded so far */
  uploadedBytes: number;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current upload status */
  status: UploadStatus;
  /** Upload speed in bytes per second */
  speed?: number;
  /** Estimated time remaining in seconds */
  eta?: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** TUS upload URL (for resuming) */
  uploadUrl?: string;
  /** Parent folder ID for this upload */
  parentFolderId?: string;
  /** Metadata to attach to the document */
  metadata?: { [key: string]: any };
  /** Start time of the upload */
  startTime?: Date;
  /** Document ID after finalization */
  documentId?: string;
  /** True for regular (non-TUS) multipart uploads — no pause/resume, indeterminate progress */
  regularUpload?: boolean;
}

/**
 * Options for starting a TUS upload.
 */
export interface TusUploadOptions {
  /** File to upload */
  file: File;
  /** Parent folder ID (null for root) */
  parentFolderId?: string;
  /** Metadata to attach to the document */
  metadata?: { [key: string]: any };
  /** Allow duplicate filenames in target folder */
  allowDuplicateFileNames?: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: UploadProgress) => void;
  /** Callback when upload completes successfully */
  onSuccess?: (uploadProgress: UploadProgress) => void;
  /** Callback when upload fails */
  onError?: (uploadProgress: UploadProgress, error: Error) => void;
}

/**
 * TUS configuration from the server.
 */
export interface TusConfig {
  enabled: boolean;
  endpoint: string;
  maxUploadSize: number;
  chunkSize: number;
  uploadExpirationPeriod: number;
}

/**
 * TUS upload info returned by the server.
 */
export interface TusUploadInfo {
  uploadId: string;
  offset: number;
  length: number;
  expiresAt: string;
  uploadUrl: string;
}

/**
 * Request to finalize a TUS upload.
 */
export interface TusFinalizeRequest {
  filename: string;
  parentFolderId?: string;
  metadata?: { [key: string]: any };
  allowDuplicateFileNames?: boolean;
}

/**
 * Response after finalizing a TUS upload.
 */
export interface TusFinalizeResponse {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Threshold for using TUS uploads (in bytes).
 * Files larger than this will use TUS instead of regular multipart upload.
 * Default: 50MB (matches the recommended chunk size).
 */
export const TUS_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Default chunk size for TUS uploads (in bytes).
 * Default: 50MB (safely under Cloudflare's 100MB limit).
 */
export const DEFAULT_TUS_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB
