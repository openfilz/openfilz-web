import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import {
  MergeRequest, OrganizeRequest, PdfInfo, PdfOperationResponse, RotateRequest, SplitRequest
} from '../models/pdf-tools.models';

/**
 * REST client for the PDF tools (`/api/v1/pdf/**`). Dedicated service (not part of
 * DocumentApiService) to keep the core service diff-free for the openfilz-web-ee fork.
 * Authorization is injected by the global authInterceptor() — no manual headers.
 */
@Injectable({ providedIn: 'root' })
export class PdfToolsService {
  private readonly baseUrl = `${environment.apiURL}/pdf`;
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);

  /** Page count, geometry, bookmarks, encrypted / signed flags of a stored PDF. */
  info(documentId: string): Observable<PdfInfo> {
    return this.http.get<PdfInfo>(`${this.baseUrl}/${documentId}/info`);
  }

  merge(request: MergeRequest): Observable<PdfOperationResponse> {
    return this.http.post<PdfOperationResponse>(`${this.baseUrl}/merge`, request);
  }

  split(request: SplitRequest): Observable<PdfOperationResponse> {
    return this.http.post<PdfOperationResponse>(`${this.baseUrl}/split`, request);
  }

  organize(request: OrganizeRequest): Observable<PdfOperationResponse> {
    return this.http.post<PdfOperationResponse>(`${this.baseUrl}/organize`, request);
  }

  rotate(request: RotateRequest): Observable<PdfOperationResponse> {
    return this.http.post<PdfOperationResponse>(`${this.baseUrl}/rotate`, request);
  }

  /**
   * Human-readable message for a failed PDF operation. The API prefixes its refusals with a
   * stable code (`PDF_SIGNED: …`), which maps to a translated sentence; anything else falls
   * back to the server's own message.
   */
  errorMessage(error: unknown): string {
    const raw = error instanceof HttpErrorResponse
      ? (typeof error.error === 'object' && error.error?.message) || error.message
      : (error as Error)?.message;
    const text = typeof raw === 'string' ? raw : '';
    const match = /^([A-Z_]+):\s*(.*)$/s.exec(text);
    if (match) {
      const key = `pdfTools.errors.${match[1]}`;
      const translated = this.translate.instant(key);
      if (translated !== key) {
        return translated;
      }
      return this.translate.instant('pdfTools.errors.generic', { detail: match[2] });
    }
    if (error instanceof HttpErrorResponse && error.status === 413) {
      return this.translate.instant('pdfTools.errors.tooLarge');
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return this.translate.instant('pdfTools.errors.forbidden');
    }
    return this.translate.instant('pdfTools.errors.generic', { detail: text || String(error) });
  }
}
