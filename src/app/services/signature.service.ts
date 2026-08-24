import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ApplySignatureRequest,
  CreateSignatureEnvelopeRequest,
  DeclineSignatureRequest,
  InstantiateTemplateRequest,
  PublicSignatureView,
  SignatureEnvelopeDTO,
  SignatureEnvelopeStatus,
  SignatureEventDTO,
  SignatureTemplateDTO,
  SignatureTemplateRequest
} from '../models/signature.models';

/**
 * Client for the e-Sign API.
 *
 * - Initiator endpoints (`/signatures`) and templates (`/signature-templates`)
 *   are OIDC-authenticated by the global interceptor.
 * - Public endpoints (`/public/signatures`) are token-only: the single-use
 *   token in the query string is the authenticator. The interceptor may still
 *   attach a bearer when a session happens to exist (the backend ignores it);
 *   the public signing page works with no session at all.
 */
@Injectable({ providedIn: 'root' })
export class SignatureService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiURL}/signatures`;
  private readonly templatesBase = `${environment.apiURL}/signature-templates`;
  private readonly publicBase = `${environment.apiURL}/public/signatures`;

  // ── Initiator ──────────────────────────────────────────────────────────

  createEnvelope(req: CreateSignatureEnvelopeRequest): Observable<SignatureEnvelopeDTO> {
    return this.http.post<SignatureEnvelopeDTO>(this.base, req);
  }

  send(id: string): Observable<SignatureEnvelopeDTO> {
    return this.http.post<SignatureEnvelopeDTO>(`${this.base}/${id}/send`, null);
  }

  listSent(status?: SignatureEnvelopeStatus): Observable<SignatureEnvelopeDTO[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http.get<SignatureEnvelopeDTO[]>(this.base, { params });
  }

  listToSign(): Observable<SignatureEnvelopeDTO[]> {
    return this.http.get<SignatureEnvelopeDTO[]>(`${this.base}/to-sign`);
  }

  get(id: string): Observable<SignatureEnvelopeDTO> {
    return this.http.get<SignatureEnvelopeDTO>(`${this.base}/${id}`);
  }

  events(id: string): Observable<SignatureEventDTO[]> {
    return this.http.get<SignatureEventDTO[]>(`${this.base}/${id}/events`);
  }

  cancel(id: string): Observable<SignatureEnvelopeDTO> {
    return this.http.post<SignatureEnvelopeDTO>(`${this.base}/${id}/cancel`, null);
  }

  resend(id: string, recipientId: string): Observable<SignatureEnvelopeDTO> {
    return this.http.post<SignatureEnvelopeDTO>(`${this.base}/${id}/recipients/${recipientId}/resend`, null);
  }

  downloadSignedDocument(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/signed-document`, { responseType: 'blob' });
  }

  // ── Templates ──────────────────────────────────────────────────────────

  createTemplate(req: SignatureTemplateRequest): Observable<SignatureTemplateDTO> {
    return this.http.post<SignatureTemplateDTO>(this.templatesBase, req);
  }

  updateTemplate(id: string, req: SignatureTemplateRequest): Observable<SignatureTemplateDTO> {
    return this.http.put<SignatureTemplateDTO>(`${this.templatesBase}/${id}`, req);
  }

  listTemplates(): Observable<SignatureTemplateDTO[]> {
    return this.http.get<SignatureTemplateDTO[]>(this.templatesBase);
  }

  getTemplate(id: string): Observable<SignatureTemplateDTO> {
    return this.http.get<SignatureTemplateDTO>(`${this.templatesBase}/${id}`);
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.templatesBase}/${id}`);
  }

  instantiateTemplate(id: string, req: InstantiateTemplateRequest): Observable<SignatureEnvelopeDTO> {
    return this.http.post<SignatureEnvelopeDTO>(`${this.templatesBase}/${id}/envelopes`, req);
  }

  // ── Public (token) ─────────────────────────────────────────────────────

  view(token: string): Observable<PublicSignatureView> {
    return this.http.get<PublicSignatureView>(this.publicBase, { params: this.tokenParams(token) });
  }

  markViewed(token: string): Observable<PublicSignatureView> {
    return this.http.post<PublicSignatureView>(`${this.publicBase}/viewed`, null,
      { params: this.tokenParams(token) });
  }

  loadDocument(token: string): Observable<Blob> {
    return this.http.get(`${this.publicBase}/document`, {
      params: this.tokenParams(token),
      responseType: 'blob'
    });
  }

  requestOtp(token: string): Observable<void> {
    return this.http.post<void>(`${this.publicBase}/otp/request`, null,
      { params: this.tokenParams(token) });
  }

  verifyOtp(token: string, code: string): Observable<PublicSignatureView> {
    return this.http.post<PublicSignatureView>(`${this.publicBase}/otp/verify`, { code },
      { params: this.tokenParams(token) });
  }

  sign(token: string, req: ApplySignatureRequest): Observable<PublicSignatureView> {
    return this.http.post<PublicSignatureView>(`${this.publicBase}/sign`, req,
      { params: this.tokenParams(token) });
  }

  decline(token: string, req: DeclineSignatureRequest): Observable<PublicSignatureView> {
    return this.http.post<PublicSignatureView>(`${this.publicBase}/decline`, req,
      { params: this.tokenParams(token) });
  }

  private tokenParams(token: string): HttpParams {
    return new HttpParams().set('token', token);
  }

  // ── Error mapping ──────────────────────────────────────────────────────

  /**
   * Map an API error to a `signature.errors.*` i18n key. 422 responses carry a
   * human-readable validation message in the body which callers may surface
   * through {@link serverMessage}.
   */
  static errorKey(err: unknown, fallback = 'signature.errors.generic'): string {
    const status = (err as HttpErrorResponse)?.status;
    switch (status) {
      case 0: return 'signature.errors.network';
      case 403: return 'signature.errors.forbidden';
      case 404: return 'signature.errors.notFound';
      case 409: return 'signature.errors.conflict';
      case 410: return 'signature.errors.expired';
      case 422: return 'signature.errors.validation';
      case 429: return 'signature.errors.tooMany';
      default: return fallback;
    }
  }

  /** Best-effort extraction of the message returned by the server (422 / 409 bodies). */
  static serverMessage(err: unknown): string | undefined {
    const e = err as HttpErrorResponse;
    const body = e?.error;
    if (!body) return undefined;
    if (typeof body === 'string') return body.length < 400 ? body : undefined;
    if (typeof body === 'object') {
      const m = (body as { message?: unknown; detail?: unknown; error?: unknown });
      const msg = m.message ?? m.detail ?? m.error;
      return typeof msg === 'string' ? msg : undefined;
    }
    return undefined;
  }
}
