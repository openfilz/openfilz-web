import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, from, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import * as tus from 'tus-js-client';
import {
  UploadProgress,
  TusUploadOptions,
  TusConfig,
  TusFinalizeRequest,
  TusFinalizeResponse,
  DEFAULT_TUS_CHUNK_SIZE
} from '../models/upload.models';
import { environment } from '../../environments/environment';

/**
 * Service for handling TUS (resumable) uploads.
 * Uses tus-js-client for chunked, resumable file uploads.
 */
@Injectable({
  providedIn: 'root'
})
export class ResumableUploadService {
  private readonly baseUrl = environment.apiURL;
  private readonly tusEndpoint = `${this.baseUrl}/tus`;

  private http = inject(HttpClient);

  /** Map of active TUS uploads by uploadId */
  private uploads = new Map<string, tus.Upload>();

  /** Map of active regular (non-TUS) upload subscriptions for cancel support */
  private regularUploadSubscriptions = new Map<string, Subscription>();

  /** Observable stream of all active upload progress */
  private activeUploadsSubject = new BehaviorSubject<UploadProgress[]>([]);
  activeUploads$ = this.activeUploadsSubject.asObservable();

  /** TUS configuration from server */
  private tusConfig: TusConfig | null = null;

  constructor() {
    // Load persisted uploads on service initialization
    this.loadPersistedUploads();
  }

  /**
   * Get authorization headers for TUS requests.
   */
  private getAuthHeaders(): { [key: string]: string } {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  /**
   * Fetch TUS configuration from the server.
   */
  getTusConfig(): Observable<TusConfig> {
    if (this.tusConfig) {
      return of(this.tusConfig);
    }

    return this.http.get<TusConfig>(`${this.tusEndpoint}/config`).pipe(
      tap(config => this.tusConfig = config),
      catchError(error => {
        console.error('Failed to fetch TUS config:', error);
        // Return default config if server is unavailable
        return of({
          enabled: true,
          endpoint: this.tusEndpoint,
          maxUploadSize: 10 * 1024 * 1024 * 1024, // 10GB
          chunkSize: DEFAULT_TUS_CHUNK_SIZE,
          uploadExpirationPeriod: 86400000 // 24 hours
        });
      })
    );
  }

  /**
   * Start a new TUS upload.
   * Returns an Observable that emits the final UploadProgress when complete.
   */
  startUpload(options: TusUploadOptions): Observable<UploadProgress> {
    return new Observable(subscriber => {
      const uploadId = this.generateUploadId();
      const file = options.file;

      const progress: UploadProgress = {
        uploadId,
        filename: file.name,
        totalSize: file.size,
        uploadedBytes: 0,
        progress: 0,
        status: 'pending',
        parentFolderId: options.parentFolderId,
        metadata: options.metadata,
        startTime: new Date()
      };

      this.updateUploadProgress(progress);

      // Get chunk size from config or use default
      const chunkSize = this.tusConfig?.chunkSize || DEFAULT_TUS_CHUNK_SIZE;

      const upload = new tus.Upload(file, {
        endpoint: this.tusEndpoint,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: chunkSize,
        metadata: {
          filename: file.name,
          filetype: file.type || 'application/octet-stream',
          parentFolderId: options.parentFolderId || '',
          uploadId: uploadId
        },
        headers: this.getAuthHeaders(),

        onError: (error) => {
          console.error('TUS upload error:', error);
          progress.status = 'error';
          progress.errorMessage = this.mapTusErrorToI18nKey(error);
          this.updateUploadProgress(progress);
          options.onError?.(progress, error);
          subscriber.error(error);
        },

        onProgress: (bytesUploaded, bytesTotal) => {
          progress.uploadedBytes = bytesUploaded;
          progress.progress = Math.round((bytesUploaded / bytesTotal) * 100);
          progress.status = 'uploading';

          // Calculate speed and ETA
          if (progress.startTime) {
            const elapsedSeconds = (Date.now() - progress.startTime.getTime()) / 1000;
            if (elapsedSeconds > 0) {
              progress.speed = bytesUploaded / elapsedSeconds;
              const remainingBytes = bytesTotal - bytesUploaded;
              progress.eta = progress.speed > 0 ? remainingBytes / progress.speed : undefined;
            }
          }

          // Persist uploadUrl for recovery after browser close (once, when first available)
          if (upload.url && !progress.uploadUrl) {
            progress.uploadUrl = upload.url;
            this.updatePersistedUploadUrl(uploadId, upload.url);
          }

          this.updateUploadProgress(progress);
          options.onProgress?.(progress);
        },

        onSuccess: () => {
          progress.status = 'completed';
          progress.uploadedBytes = progress.totalSize;
          progress.progress = 100;
          progress.uploadUrl = upload.url || undefined;
          this.updateUploadProgress(progress);

          // Now finalize the upload to create the Document
          this.finalizeUpload(progress, options).subscribe({
            next: (finalizedProgress) => {
              options.onSuccess?.(finalizedProgress);
              subscriber.next(finalizedProgress);
              subscriber.complete();
            },
            error: (error) => {
              progress.status = 'error';
              progress.errorMessage = this.mapFinalizeErrorToI18nKey(error);
              this.updateUploadProgress(progress);
              options.onError?.(progress, error);
              subscriber.error(error);
            }
          });
        }
      });

      // Store the upload for pause/resume/cancel
      this.uploads.set(uploadId, upload);

      // Persist upload info for recovery
      this.persistUpload(uploadId, options);

      // Start the upload
      upload.findPreviousUploads().then(previousUploads => {
        if (previousUploads.length > 0) {
          // Resume from previous upload
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      });
    });
  }

  /**
   * Pause an active upload.
   */
  pauseUpload(uploadId: string): boolean {
    const upload = this.uploads.get(uploadId);
    if (upload) {
      upload.abort();
      const progress = this.getUploadProgress(uploadId);
      if (progress) {
        progress.status = 'paused';
        this.updateUploadProgress(progress);
      }
      return true;
    }
    return false;
  }

  /**
   * Resume a paused upload (in-session only — the tus Upload object must exist).
   * Returns false for persisted uploads that need file re-selection.
   */
  resumeUpload(uploadId: string): boolean {
    const upload = this.uploads.get(uploadId);
    if (upload) {
      const progress = this.getUploadProgress(uploadId);
      if (progress) {
        progress.status = 'uploading';
        progress.startTime = new Date();
        this.updateUploadProgress(progress);
      }
      upload.start();
      return true;
    }
    return false;
  }

  /**
   * Check whether an upload can be resumed directly (tus Upload object exists in memory).
   * Returns false for persisted uploads restored after a browser restart.
   */
  canResumeDirectly(uploadId: string): boolean {
    return this.uploads.has(uploadId);
  }

  /**
   * Resume a persisted upload by re-selecting the file.
   * Creates a new tus Upload using the stored uploadUrl so tus-js-client
   * sends HEAD to get the server offset and resumes from there.
   */
  resumePersistedUpload(uploadId: string, file: File): Observable<UploadProgress> {
    const progress = this.getUploadProgress(uploadId);
    if (!progress?.uploadUrl) {
      this.removeUpload(uploadId);
      return of(progress!);
    }

    const chunkSize = this.tusConfig?.chunkSize || DEFAULT_TUS_CHUNK_SIZE;

    return new Observable(subscriber => {
      const upload = new tus.Upload(file, {
        uploadUrl: progress.uploadUrl,
        chunkSize,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        headers: this.getAuthHeaders(),

        onError: (error) => {
          console.error('TUS resume error:', error);
          progress.status = 'error';
          progress.errorMessage = this.mapTusErrorToI18nKey(error);
          this.updateUploadProgress(progress);
          subscriber.error(error);
        },

        onProgress: (bytesUploaded, bytesTotal) => {
          progress.uploadedBytes = bytesUploaded;
          progress.progress = Math.round((bytesUploaded / bytesTotal) * 100);
          progress.status = 'uploading';

          if (progress.startTime) {
            const elapsedSeconds = (Date.now() - progress.startTime.getTime()) / 1000;
            if (elapsedSeconds > 0) {
              progress.speed = bytesUploaded / elapsedSeconds;
              const remainingBytes = bytesTotal - bytesUploaded;
              progress.eta = progress.speed > 0 ? remainingBytes / progress.speed : undefined;
            }
          }

          this.updateUploadProgress(progress);
        },

        onSuccess: () => {
          progress.status = 'completed';
          progress.uploadedBytes = progress.totalSize;
          progress.progress = 100;
          this.updateUploadProgress(progress);

          const options: TusUploadOptions = {
            file,
            parentFolderId: progress.parentFolderId,
            metadata: progress.metadata,
            allowDuplicateFileNames: false
          };

          this.finalizeUpload(progress, options).subscribe({
            next: (finalizedProgress) => {
              subscriber.next(finalizedProgress);
              subscriber.complete();
            },
            error: (error) => {
              progress.status = 'error';
              progress.errorMessage = this.mapFinalizeErrorToI18nKey(error);
              this.updateUploadProgress(progress);
              subscriber.error(error);
            }
          });
        }
      });

      // Store the tus upload object for pause/resume/cancel
      this.uploads.set(uploadId, upload);

      // Reset startTime for accurate speed calculation
      progress.startTime = new Date();
      progress.status = 'uploading';
      this.updateUploadProgress(progress);

      // Start — tus-js-client will HEAD to get offset, then PATCH from there
      upload.start();
    });
  }

  // ── Regular (non-TUS) upload tracking ──────────────────────────────

  /**
   * Start tracking a regular multipart upload in the progress panel.
   * Returns the created UploadProgress entry so the caller can reference its uploadId.
   */
  startRegularUploadTracking(filename: string, totalSize: number, parentFolderId?: string): UploadProgress {
    const uploadId = this.generateUploadId();
    const progress: UploadProgress = {
      uploadId,
      filename,
      totalSize,
      uploadedBytes: 0,
      progress: 0,
      status: 'uploading',
      parentFolderId,
      startTime: new Date(),
      regularUpload: true
    };
    this.updateUploadProgress(progress);
    return progress;
  }

  /**
   * Store the HTTP subscription for a regular upload so it can be cancelled.
   */
  registerRegularUploadSubscription(uploadId: string, subscription: Subscription): void {
    this.regularUploadSubscriptions.set(uploadId, subscription);
  }

  /**
   * Mark a regular upload as completed and remove it from tracking.
   */
  completeRegularUpload(uploadId: string, documentId?: string): void {
    this.regularUploadSubscriptions.delete(uploadId);
    const progress = this.getUploadProgress(uploadId);
    if (progress) {
      progress.status = 'completed';
      progress.uploadedBytes = progress.totalSize;
      progress.progress = 100;
      progress.documentId = documentId || undefined;
      this.updateUploadProgress(progress);
    }
    this.removeUpload(uploadId);
  }

  /**
   * Mark a regular upload as failed.
   */
  failRegularUpload(uploadId: string, errorMessage: string): void {
    this.regularUploadSubscriptions.delete(uploadId);
    const progress = this.getUploadProgress(uploadId);
    if (progress) {
      progress.status = 'error';
      progress.errorMessage = errorMessage;
      this.updateUploadProgress(progress);
    }
  }

  /**
   * Remove a regular upload entry without marking it as completed or failed
   * (e.g. when handing off to a duplicate-file dialog).
   */
  removeRegularUpload(uploadId: string): void {
    this.regularUploadSubscriptions.delete(uploadId);
    this.removeUpload(uploadId);
  }

  // ── Cancel ────────────────────────────────────────────────────────

  /**
   * Cancel and remove an upload.
   * Aborts the tus upload if active, sends DELETE to the server to clean up,
   * and removes the upload from tracking.
   */
  cancelUpload(uploadId: string): Observable<void> {
    // Regular upload — cancel the HTTP request
    const regularSub = this.regularUploadSubscriptions.get(uploadId);
    if (regularSub) {
      regularSub.unsubscribe();
      this.regularUploadSubscriptions.delete(uploadId);
      this.removeUpload(uploadId);
      return of(undefined);
    }

    const upload = this.uploads.get(uploadId);
    const progress = this.getUploadProgress(uploadId);

    // Abort the tus upload if it exists
    if (upload) {
      upload.abort();
    }

    // Get the server URL: prefer the tus object's url (available as soon as
    // the server responds to the initial POST), fall back to progress.uploadUrl
    const uploadUrl = upload?.url || progress?.uploadUrl;

    if (uploadUrl) {
      return this.http.delete<void>(uploadUrl, {
        headers: new HttpHeaders(this.getAuthHeaders())
      }).pipe(
        tap(() => this.removeUpload(uploadId)),
        catchError(() => {
          this.removeUpload(uploadId);
          return of(undefined);
        })
      );
    }

    // No server URL available — just remove locally
    this.removeUpload(uploadId);
    return of(undefined);
  }

  /**
   * Finalize a completed upload by creating the Document entity.
   */
  private finalizeUpload(progress: UploadProgress, options: TusUploadOptions): Observable<UploadProgress> {
    if (!progress.uploadUrl) {
      throw new Error('Upload URL not available for finalization');
    }

    // Extract uploadId from URL (last path segment)
    const urlParts = progress.uploadUrl.split('/');
    const serverUploadId = urlParts[urlParts.length - 1];

    const request: TusFinalizeRequest = {
      filename: progress.filename,
      parentFolderId: options.parentFolderId,
      metadata: options.metadata,
      allowDuplicateFileNames: options.allowDuplicateFileNames
    };

    return this.http.post<TusFinalizeResponse>(
      `${this.tusEndpoint}/${serverUploadId}/finalize`,
      request,
      { headers: new HttpHeaders({ ...this.getAuthHeaders(), 'Content-Type': 'application/json' }) }
    ).pipe(
      map(response => {
        progress.documentId = response.id;
        progress.status = 'completed';
        this.updateUploadProgress(progress);
        this.removeUpload(progress.uploadId);
        return progress;
      }),
      catchError(error => {
        console.error('Failed to finalize upload:', error);
        throw error;
      })
    );
  }

  /**
   * Map a tus-js-client error to an i18n key based on the HTTP method and status code.
   * The tus-js-client DetailedError exposes originalRequest and originalResponse
   * which let us identify the exact backend @ApiResponse that was returned.
   */
  private mapTusErrorToI18nKey(error: Error): string {
    const detailedError = error as any;
    const status: number | undefined = detailedError.originalResponse?.getStatus?.();
    const method: string | undefined = detailedError.originalRequest?.getMethod?.();

    if (status !== undefined && method) {
      // POST /tus — Create upload errors
      if (method === 'POST') {
        switch (status) {
          case 400: return 'upload.errors.missingHeaders';
          case 404: return 'upload.errors.parentFolderNotFound';
          case 409: return 'upload.errors.duplicateFilename';
          case 413: return 'upload.errors.fileTooLarge';
          case 507: return 'upload.errors.quotaExceeded';
        }
      }
      // PATCH /tus/{id} — Upload chunk errors
      if (method === 'PATCH') {
        switch (status) {
          case 404: return 'upload.errors.uploadNotFound';
          case 409: return 'upload.errors.offsetMismatch';
        }
      }
      // HEAD /tus/{id} — Get offset errors
      if (method === 'HEAD') {
        if (status === 404) return 'upload.errors.uploadNotFound';
      }
    }

    return 'upload.failed';
  }

  /**
   * Map an HttpErrorResponse from the finalize endpoint to an i18n key.
   */
  private mapFinalizeErrorToI18nKey(error: any): string {
    const status = error?.status;
    if (status) {
      switch (status) {
        case 400: return 'upload.errors.uploadNotComplete';
        case 404: return 'upload.errors.uploadNotFound';
        case 409: return 'upload.errors.duplicateFilename';
        case 413: return 'upload.errors.fileSizeExceedsQuota';
        case 507: return 'upload.errors.quotaExceeded';
      }
    }
    return 'upload.errors.finalizeFailed';
  }

  /**
   * Get the current progress for an upload.
   */
  getUploadProgress(uploadId: string): UploadProgress | undefined {
    return this.activeUploadsSubject.value.find(p => p.uploadId === uploadId);
  }

  /**
   * Update upload progress and notify subscribers.
   */
  private updateUploadProgress(progress: UploadProgress): void {
    const uploads = this.activeUploadsSubject.value;
    const index = uploads.findIndex(p => p.uploadId === progress.uploadId);

    if (index >= 0) {
      uploads[index] = progress;
    } else {
      uploads.push(progress);
    }

    this.activeUploadsSubject.next([...uploads]);
  }

  /**
   * Remove an upload from tracking.
   */
  private removeUpload(uploadId: string): void {
    this.uploads.delete(uploadId);
    this.removePersistedUpload(uploadId);

    const uploads = this.activeUploadsSubject.value.filter(p => p.uploadId !== uploadId);
    this.activeUploadsSubject.next(uploads);
  }

  /**
   * Generate a unique upload ID.
   */
  private generateUploadId(): string {
    return `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Persist upload info to localStorage for recovery after page refresh.
   */
  private persistUpload(uploadId: string, options: TusUploadOptions): void {
    try {
      const persisted = this.getPersistedUploads();
      persisted[uploadId] = {
        filename: options.file.name,
        fileSize: options.file.size,
        parentFolderId: options.parentFolderId,
        metadata: options.metadata,
        startTime: new Date().toISOString()
      };
      localStorage.setItem('tus-uploads', JSON.stringify(persisted));
    } catch (e) {
      console.warn('Failed to persist upload info:', e);
    }
  }

  /**
   * Update the persisted uploadUrl for an upload (called when the TUS server URL becomes available).
   */
  private updatePersistedUploadUrl(uploadId: string, uploadUrl: string): void {
    try {
      const persisted = this.getPersistedUploads();
      if (persisted[uploadId]) {
        persisted[uploadId].uploadUrl = uploadUrl;
        localStorage.setItem('tus-uploads', JSON.stringify(persisted));
      }
    } catch (e) {
      console.warn('Failed to update persisted upload URL:', e);
    }
  }

  /**
   * Remove persisted upload info.
   */
  private removePersistedUpload(uploadId: string): void {
    try {
      const persisted = this.getPersistedUploads();
      delete persisted[uploadId];
      localStorage.setItem('tus-uploads', JSON.stringify(persisted));
    } catch (e) {
      console.warn('Failed to remove persisted upload info:', e);
    }
  }

  /**
   * Get all persisted upload info.
   */
  private getPersistedUploads(): { [key: string]: any } {
    try {
      const data = localStorage.getItem('tus-uploads');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * Load persisted uploads on service initialization.
   * Restores upload entries from localStorage and queries the server
   * for the real offset of each upload that has a stored URL.
   */
  private loadPersistedUploads(): void {
    const persisted = this.getPersistedUploads();
    const uploads: UploadProgress[] = [];

    for (const [uploadId, info] of Object.entries(persisted) as [string, any][]) {
      uploads.push({
        uploadId,
        filename: info.filename,
        totalSize: info.fileSize,
        uploadedBytes: 0,
        progress: 0,
        status: 'paused', // Mark as paused until user resumes
        parentFolderId: info.parentFolderId,
        metadata: info.metadata,
        startTime: new Date(info.startTime),
        uploadUrl: info.uploadUrl || undefined
      });
    }

    if (uploads.length > 0) {
      this.activeUploadsSubject.next(uploads);

      // Fetch actual offsets from the server for uploads that have a URL
      uploads.filter(u => u.uploadUrl).forEach(u => this.fetchUploadOffset(u));
    }
  }

  /**
   * Query HEAD /tus/{uploadId} to get the real offset from the server.
   * Updates the progress display with accurate bytes.
   * If the upload is no longer on the server (404), removes it.
   */
  private fetchUploadOffset(progress: UploadProgress): void {
    if (!progress.uploadUrl) return;

    this.http.head(progress.uploadUrl, {
      headers: new HttpHeaders(this.getAuthHeaders()),
      observe: 'response'
    }).subscribe({
      next: (response) => {
        const offset = parseInt(response.headers.get('Upload-Offset') || '0', 10);
        progress.uploadedBytes = offset;
        progress.progress = progress.totalSize > 0
          ? Math.round((offset / progress.totalSize) * 100)
          : 0;
        this.updateUploadProgress(progress);
      },
      error: () => {
        // Upload not found on server — remove stale entry
        this.removeUpload(progress.uploadId);
      }
    });
  }

  /**
   * Check if there are any active or paused uploads.
   */
  hasActiveUploads(): boolean {
    return this.activeUploadsSubject.value.some(
      p => p.status === 'uploading' || p.status === 'paused' || p.status === 'pending'
    );
  }

  /**
   * Get the total progress across all active uploads.
   */
  getTotalProgress(): { uploadedBytes: number; totalBytes: number; progress: number } {
    const uploads = this.activeUploadsSubject.value.filter(
      p => p.status === 'uploading' || p.status === 'paused'
    );

    if (uploads.length === 0) {
      return { uploadedBytes: 0, totalBytes: 0, progress: 100 };
    }

    const totalBytes = uploads.reduce((sum, p) => sum + p.totalSize, 0);
    const uploadedBytes = uploads.reduce((sum, p) => sum + p.uploadedBytes, 0);
    const progress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

    return { uploadedBytes, totalBytes, progress };
  }

  /**
   * Clear all completed or errored uploads from the list.
   */
  clearCompletedUploads(): void {
    const uploads = this.activeUploadsSubject.value.filter(
      p => p.status !== 'completed' && p.status !== 'error' && p.status !== 'cancelled'
    );
    this.activeUploadsSubject.next(uploads);
  }

  /**
   * Format bytes to human-readable string.
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format seconds to human-readable duration.
   */
  formatDuration(seconds: number | undefined): string {
    if (seconds === undefined || seconds <= 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hours}h ${remainingMins}m`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
