import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SignatureService } from './signature.service';
import { environment } from '../../environments/environment';
import { PublicSignatureView, SignatureEnvelopeDTO } from '../models/signature.models';

const API = environment.apiURL;

describe('SignatureService', () => {
  let service: SignatureService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), SignatureService]
    });
    service = TestBed.inject(SignatureService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates an envelope with POST /signatures', () => {
    let result: SignatureEnvelopeDTO | undefined;
    service.createEnvelope({ sourceDocId: 'doc', title: 'T', recipients: [] }).subscribe(r => result = r);
    const req = http.expectOne(`${API}/signatures`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.title).toBe('T');
    req.flush({ id: 'e1', title: 'T' });
    expect(result?.id).toBe('e1');
  });

  it('lists sent envelopes with an optional status filter', () => {
    service.listSent().subscribe();
    http.expectOne(r => r.url === `${API}/signatures` && !r.params.has('status')).flush([]);
    service.listSent('SENT').subscribe();
    http.expectOne(r => r.url === `${API}/signatures` && r.params.get('status') === 'SENT').flush([]);
  });

  it('hits the to-sign, events, cancel and resend endpoints', () => {
    service.listToSign().subscribe();
    http.expectOne(`${API}/signatures/to-sign`).flush([]);
    service.events('e1').subscribe();
    http.expectOne(`${API}/signatures/e1/events`).flush([]);
    service.cancel('e1').subscribe();
    expect(http.expectOne(`${API}/signatures/e1/cancel`).request.method).toBe('POST');
    service.resend('e1', 'r1').subscribe();
    expect(http.expectOne(`${API}/signatures/e1/recipients/r1/resend`).request.method).toBe('POST');
  });

  it('downloads the signed document as a blob', () => {
    let blob: Blob | undefined;
    service.downloadSignedDocument('e1').subscribe(b => blob = b);
    const req = http.expectOne(`${API}/signatures/e1/signed-document`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
    expect(blob).toBeTruthy();
  });

  it('manages templates', () => {
    service.listTemplates().subscribe();
    http.expectOne(`${API}/signature-templates`).flush([]);
    service.createTemplate({ name: 'n', roles: [], fields: [] }).subscribe();
    expect(http.expectOne(`${API}/signature-templates`).request.method).toBe('POST');
    service.updateTemplate('t1', { name: 'n', roles: [], fields: [] }).subscribe();
    expect(http.expectOne(`${API}/signature-templates/t1`).request.method).toBe('PUT');
    service.deleteTemplate('t1').subscribe();
    expect(http.expectOne(`${API}/signature-templates/t1`).request.method).toBe('DELETE');
    service.instantiateTemplate('t1', { recipients: [] }).subscribe();
    expect(http.expectOne(`${API}/signature-templates/t1/envelopes`).request.method).toBe('POST');
  });

  describe('public (token) endpoints', () => {
    const token = 'abc123';
    const view = { envelopeTitle: 'x', fields: [], otherFields: [] } as unknown as PublicSignatureView;

    it('passes the token as a query parameter on every call', () => {
      service.view(token).subscribe();
      http.expectOne(r => r.url === `${API}/public/signatures` && r.params.get('token') === token).flush(view);
      service.markViewed(token).subscribe();
      const viewed = http.expectOne(r => r.url === `${API}/public/signatures/viewed`);
      expect(viewed.request.method).toBe('POST');
      expect(viewed.request.params.get('token')).toBe(token);
      viewed.flush(view);
    });

    it('loads the document as a blob', () => {
      service.loadDocument(token).subscribe();
      const req = http.expectOne(r => r.url === `${API}/public/signatures/document`);
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob());
    });

    it('requests and verifies OTP codes', () => {
      service.requestOtp(token).subscribe();
      const rq = http.expectOne(r => r.url === `${API}/public/signatures/otp/request`);
      expect(rq.request.method).toBe('POST');
      rq.flush(null, { status: 202, statusText: 'Accepted' });

      service.verifyOtp(token, '123456').subscribe();
      const vr = http.expectOne(r => r.url === `${API}/public/signatures/otp/verify`);
      expect(vr.request.body).toEqual({ code: '123456' });
      vr.flush(view);
    });

    it('signs with a fields payload and declines with a reason', () => {
      service.sign(token, { fields: [{ fieldId: 'f1', value: 'hello' }] }).subscribe();
      const sr = http.expectOne(r => r.url === `${API}/public/signatures/sign`);
      expect(sr.request.body).toEqual({ fields: [{ fieldId: 'f1', value: 'hello' }] });
      sr.flush(view);

      service.decline(token, { reason: 'nope' }).subscribe();
      const dr = http.expectOne(r => r.url === `${API}/public/signatures/decline`);
      expect(dr.request.body).toEqual({ reason: 'nope' });
      dr.flush(view);
    });
  });

  describe('error mapping', () => {
    const err = (status: number, error?: unknown) => new HttpErrorResponse({ status, error });

    it('maps HTTP statuses to i18n keys', () => {
      expect(SignatureService.errorKey(err(0))).toBe('signature.errors.network');
      expect(SignatureService.errorKey(err(403))).toBe('signature.errors.forbidden');
      expect(SignatureService.errorKey(err(404))).toBe('signature.errors.notFound');
      expect(SignatureService.errorKey(err(409))).toBe('signature.errors.conflict');
      expect(SignatureService.errorKey(err(410))).toBe('signature.errors.expired');
      expect(SignatureService.errorKey(err(422))).toBe('signature.errors.validation');
      expect(SignatureService.errorKey(err(429))).toBe('signature.errors.tooMany');
      expect(SignatureService.errorKey(err(500), 'x.fallback')).toBe('x.fallback');
      expect(SignatureService.errorKey(undefined)).toBe('signature.errors.generic');
    });

    it('extracts the server message from string and object bodies', () => {
      expect(SignatureService.serverMessage(err(422, 'Field Name is required'))).toBe('Field Name is required');
      expect(SignatureService.serverMessage(err(422, { message: 'Duplicate recipient' }))).toBe('Duplicate recipient');
      expect(SignatureService.serverMessage(err(422, { detail: 'd' }))).toBe('d');
      expect(SignatureService.serverMessage(err(422, { foo: 1 }))).toBeUndefined();
      expect(SignatureService.serverMessage(err(500))).toBeUndefined();
    });
  });
});
