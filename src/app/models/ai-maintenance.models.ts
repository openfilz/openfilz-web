/**
 * The maintenance jobs of the AI feature — an embedding backfill (`POST /ai/embeddings/backfill`)
 * and an insights backfill (`POST /ai/insights/backfill`) — share one progress shape.
 */
export type BackfillKind = 'embeddings' | 'insights';

export interface BackfillStatus {
  jobId: string;
  folderId: string | null;
  force: boolean;
  status: 'RUNNING' | 'DONE';
  /** Documents queued when the job was enumerated (0 while enumerating, and when nothing is missing). */
  total: number;
  done: number;
  failed: number;
  skipped: number;
  startedAt: string;
  finishedAt: string | null;
}
