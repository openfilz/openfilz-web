import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DocumentVersionInfo, RestoreVersionResponse } from '../models/document-versions.models';

/**
 * Client for the document version endpoints (MinIO bucket versioning).
 * Dedicated service (not part of DocumentApiService) to keep the core service
 * diff-free for the openfilz-web-ee fork.
 *
 * The backend answers HTTP 409 on every endpoint when versioning is disabled
 * (STORAGE_MINIO_VERSIONING_ENABLED=false or storage is not MinIO).
 */
@Injectable({
  providedIn: 'root'
})
export class DocumentVersionsService {
  private readonly baseUrl = environment.apiURL;

  private http = inject(HttpClient);

  /**
   * Whether the version history UI is enabled (NG_APP_STORAGE_MINIO_VERSIONING_ENABLED).
   * Must be set in tandem with the backend flag.
   */
  isVersioningEnabled(): boolean {
    return (environment as any).versioning?.enabled ?? false;
  }

  /** List all stored versions of a file document, newest first. */
  listVersions(documentId: string): Observable<DocumentVersionInfo[]> {
    return this.http.get<DocumentVersionInfo[]>(`${this.baseUrl}/documents/${documentId}/versions`);
  }

  /** Download the content of a specific version. */
  downloadVersion(documentId: string, versionId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/documents/${documentId}/versions/${versionId}/download`, {
      responseType: 'blob'
    });
  }

  /**
   * Restore a previous version as the new latest version. History-preserving:
   * the backend creates a new version on top and logs a RESTORE_DOCUMENT_VERSION
   * audit entry — nothing is deleted.
   */
  restoreVersion(documentId: string, versionId: string): Observable<RestoreVersionResponse> {
    return this.http.post<RestoreVersionResponse>(
      `${this.baseUrl}/documents/${documentId}/versions/${versionId}/restore`, null);
  }
}
