import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

import { ResumableUploadService } from '../../services/resumable-upload.service';
import { UploadProgress } from '../../models/upload.models';

/**
 * Component that displays TUS upload progress.
 * Shows a floating panel with progress bars for each active upload,
 * with pause/resume/cancel controls.
 */
@Component({
  selector: 'app-upload-progress',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatProgressBarModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    TranslatePipe
  ],
  templateUrl: './upload-progress.component.html',
  styleUrls: ['./upload-progress.component.css']
})
export class UploadProgressComponent implements OnInit, OnDestroy {
  private uploadService = inject(ResumableUploadService);
  private snackBar = inject(MatSnackBar);
  private translateService = inject(TranslateService);
  private subscription: Subscription | null = null;

  uploads: UploadProgress[] = [];
  isMinimized = false;
  totalProgress = { uploadedBytes: 0, totalBytes: 0, progress: 0 };

  ngOnInit(): void {
    this.subscription = this.uploadService.activeUploads$.subscribe(uploads => {
      this.uploads = uploads;
      this.totalProgress = this.uploadService.getTotalProgress();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /**
   * Check if the panel should be visible.
   * Show when there are active uploads or errors to display.
   * The panel disappears once all uploads are completed, cancelled, or cleared.
   */
  get isVisible(): boolean {
    return this.uploads.some(u =>
      u.status === 'uploading' || u.status === 'paused' || u.status === 'pending' || u.status === 'error'
    );
  }

  /**
   * Get active uploads (uploading, paused, or pending).
   */
  get activeUploads(): UploadProgress[] {
    return this.uploads.filter(u =>
      u.status === 'uploading' || u.status === 'paused' || u.status === 'pending'
    );
  }

  /**
   * Get completed uploads (for showing success messages).
   */
  get completedUploads(): UploadProgress[] {
    return this.uploads.filter(u => u.status === 'completed');
  }

  /**
   * Get failed uploads.
   */
  get failedUploads(): UploadProgress[] {
    return this.uploads.filter(u => u.status === 'error');
  }

  /**
   * Toggle minimized state.
   */
  toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
  }

  /**
   * Pause an upload.
   */
  pauseUpload(uploadId: string): void {
    this.uploadService.pauseUpload(uploadId);
  }

  /**
   * Resume a paused upload.
   * For in-session uploads, resumes directly.
   * For persisted uploads (after browser restart), prompts the user to re-select the file.
   */
  resumeUpload(uploadId: string): void {
    if (this.uploadService.resumeUpload(uploadId)) {
      return; // In-session resume succeeded
    }

    // Persisted upload — need file re-selection
    const progress = this.uploadService.getUploadProgress(uploadId);
    if (!progress?.uploadUrl) {
      // No server URL stored — cannot resume, remove stale entry
      this.uploadService.cancelUpload(uploadId).subscribe();
      return;
    }

    this.promptFileReselection(uploadId, progress);
  }

  /**
   * Whether a paused upload requires the user to re-select the file before resuming.
   */
  needsFileReselection(upload: UploadProgress): boolean {
    return upload.status === 'paused' && !this.uploadService.canResumeDirectly(upload.uploadId);
  }

  /**
   * Open a file picker so the user can re-select the file for a persisted upload.
   * Validates the selected file size matches, then delegates to the service.
   */
  private promptFileReselection(uploadId: string, progress: UploadProgress): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (file.size !== progress.totalSize) {
        const msg = this.translateService.instant('upload.fileMismatch', {
          expectedSize: this.formatBytes(progress.totalSize)
        });
        this.snackBar.open(msg, undefined, { duration: 5000 });
        return;
      }

      this.uploadService.resumePersistedUpload(uploadId, file).subscribe();
    };
    input.click();
  }

  /**
   * Cancel an upload.
   */
  cancelUpload(uploadId: string): void {
    this.uploadService.cancelUpload(uploadId).subscribe();
  }

  /**
   * Clear completed and failed uploads from the list.
   */
  clearCompleted(): void {
    this.uploadService.clearCompletedUploads();
  }

  /**
   * Format bytes to human-readable string.
   */
  formatBytes(bytes: number): string {
    return this.uploadService.formatBytes(bytes);
  }

  /**
   * Format ETA to human-readable string.
   */
  formatEta(seconds: number | undefined): string {
    return this.uploadService.formatDuration(seconds);
  }

  /**
   * Get status icon for an upload.
   */
  getStatusIcon(status: string): string {
    switch (status) {
      case 'uploading': return 'cloud_upload';
      case 'paused': return 'pause_circle';
      case 'completed': return 'check_circle';
      case 'error': return 'error';
      case 'pending': return 'hourglass_empty';
      case 'cancelled': return 'cancel';
      default: return 'cloud_upload';
    }
  }

  /**
   * Get status color class for an upload.
   */
  getStatusClass(status: string): string {
    switch (status) {
      case 'uploading': return 'status-uploading';
      case 'paused': return 'status-paused';
      case 'completed': return 'status-completed';
      case 'error': return 'status-error';
      case 'pending': return 'status-pending';
      case 'cancelled': return 'status-cancelled';
      default: return '';
    }
  }

  /**
   * Get progress bar mode based on status.
   * Regular (non-TUS) uploads always use indeterminate since we have no chunk-level progress.
   */
  getProgressMode(upload: UploadProgress): 'determinate' | 'indeterminate' {
    if (upload.status === 'pending') return 'indeterminate';
    if (upload.regularUpload && upload.status === 'uploading') return 'indeterminate';
    return 'determinate';
  }

  /**
   * Track uploads by ID for ngFor.
   */
  trackByUploadId(index: number, upload: UploadProgress): string {
    return upload.uploadId;
  }
}
