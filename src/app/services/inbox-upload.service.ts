import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { DocumentApiService } from './document-api.service';
import { ResumableUploadService } from './resumable-upload.service';
import { SmartFilingService } from './smart-filing.service';
import { TUS_THRESHOLD_BYTES } from '../models/upload.models';

/**
 * "Upload to Inbox": send files to the user's Inbox folder — whatever folder is displayed — with
 * smart filing forced on, so OpenFilz files them anywhere in the library. Rides the same upload
 * machinery as the explorer (TUS above the threshold, multipart below, both tracked in the
 * upload-progress panel) and hands the filing job ids to the usual "Filing N document(s)…"
 * toast. Duplicate names are allowed: the Inbox is a transit area, not a destination.
 * Dedicated file for the enterprise fork.
 */
import { quotaErrorKey } from '../utils/quota-errors';
@Injectable({ providedIn: 'root' })
export class InboxUploadService {
  private documentApi = inject(DocumentApiService);
  private resumableUpload = inject(ResumableUploadService);
  private smartFiling = inject(SmartFilingService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  /** No-op when the user has no Inbox (the button that calls this is not shown then). */
  uploadToInbox(files: File[]): void {
    const parentFolderId = this.smartFiling.inboxFolderId;
    if (!parentFolderId || files.length === 0) {
      return;
    }

    const total = files.length;
    let completed = 0;
    let uploaded = 0;
    const filingJobIds: string[] = [];

    const onFileDone = (documentId?: string, filingJobId?: string) => {
      if (documentId) {
        uploaded++;
      }
      if (filingJobId) {
        filingJobIds.push(filingJobId);
      }
      if (++completed < total) {
        return;
      }
      if (uploaded > 0) {
        this.snackBar.open(
          this.translate.instant('smartFiling.inbox.uploaded', { count: uploaded }),
          this.translate.instant('common.close'),
          { duration: 5000 }
        );
      }
      this.smartFiling.trackUploadBatch(filingJobIds, uploaded);
    };

    files.forEach(file => {
      if (file.size > TUS_THRESHOLD_BYTES) {
        this.resumableUpload.startUpload({
          file,
          parentFolderId,
          allowDuplicateFileNames: true,
          autoFile: true,
          onSuccess: progress => onFileDone(progress.documentId, progress.autoFileJobId),
          onError: (_progress, error) => {
            console.error('TUS upload to Inbox failed:', error);
            onFileDone();
          }
        }).subscribe();
        return;
      }

      const progress = this.resumableUpload.startRegularUploadTracking(file.name, file.size, parentFolderId);
      const subscription = this.documentApi.uploadDocument(file, parentFolderId, undefined, true, true).subscribe({
        next: response => {
          this.resumableUpload.completeRegularUpload(progress.uploadId, response.id || undefined);
          onFileDone(response.id || undefined, response.autoFile?.jobId);
        },
        error: error => {
          this.resumableUpload.failRegularUpload(progress.uploadId, this.errorKey(error?.status, error?.error));
          onFileDone();
        }
      });
      this.resumableUpload.registerRegularUploadSubscription(progress.uploadId, subscription);
    });
  }

  private errorKey(status?: number, body?: unknown): string {
    if (status === 409) return 'upload.errors.duplicateFilename';
    return quotaErrorKey(status, body) ?? 'errors.uploadFailed';
  }
}
