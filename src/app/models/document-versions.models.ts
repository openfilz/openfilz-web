/**
 * Models for the file version history feature (MinIO bucket versioning).
 * Kept in a dedicated file to ease merging into the openfilz-web-ee fork.
 */

export interface DocumentVersionInfo {
  /** Storage version identifier (MinIO/S3 versionId) */
  versionId: string;
  /** Date the version was created (ISO string) */
  lastModified: string;
  /** Size of the version in bytes */
  size?: number;
  /** True if this version is the current (latest) one */
  latest: boolean;
}

export interface RestoreVersionResponse {
  documentId: string;
  restoredFromVersionId: string;
  restoredFromDate: string;
  newVersionId: string;
}
