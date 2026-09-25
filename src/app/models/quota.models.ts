/** The caller's storage quota — contract of GET /api/v1/quotas/me (also StorageBreakdown.quota). */
export type QuotaSource = 'USER' | 'GROUP' | 'DEFAULT';

export interface MyStorageQuota {
  /** Size of the caller's active files. */
  usedBytes: number;
  /** Effective limit; null = unlimited. */
  limitBytes: number | null;
  /** Where the limit comes from: the user's own limit, a group (team) or the default. */
  source: QuotaSource;
  /** The group (team) the limit comes from, when source = GROUP. */
  sourceName: string | null;
  /** Largest single upload; null = no per-file limit. */
  maxFileSizeBytes: number | null;
}
