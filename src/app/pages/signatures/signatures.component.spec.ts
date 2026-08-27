import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { SignaturesComponent } from './signatures.component';
import { SignatureAccessService } from '../../services/signature-access.service';
import { SignatureEnvelopeDTO, SignatureRecipientDTO, SignatureTemplateDTO } from '../../models/signature.models';
import { environment } from '../../../environments/environment';

const API = environment.apiURL;

function recipient(p: Partial<SignatureRecipientDTO> & { id: string }): SignatureRecipientDTO {
  return { email: `${p.id}@x.io`, orderIndex: 0, role: 'SIGNER', authMethod: 'NONE', status: 'PENDING', reminderCount: 0, fields: [], ...p };
}

function envelope(p: Partial<SignatureEnvelopeDTO> & { id: string }): SignatureEnvelopeDTO {
  return {
    title: 'Doc ' + p.id, sourceDocId: 'src-' + p.id, status: 'SENT', initiatorEmail: 'me@x.io', sequential: false,
    currentOrder: 0, createdAt: '2026-01-01T00:00:00Z', expiresAt: '2026-02-01T00:00:00Z',
    recipients: [recipient({ id: 'a', status: 'SIGNED' }), recipient({ id: 'b' }), recipient({ id: 'c', role: 'CC' })],
    ...p
  };
}

class FakeDialog {
  nextResult: unknown = true;
  open(): { afterClosed: () => Observable<unknown> } {
    return { afterClosed: () => of(this.nextResult) };
  }
}

describe('SignaturesComponent', () => {
  let fixture: ComponentFixture<SignaturesComponent>;
  let component: SignaturesComponent;
  let http: HttpTestingController;
  let dialog: FakeDialog;
  const navigations: unknown[][] = [];
  const queryParams = new BehaviorSubject(convertToParamMap({}));

  beforeEach(() => {
    dialog = new FakeDialog();
    navigations.length = 0;
    queryParams.next(convertToParamMap({}));
    TestBed.configureTestingModule({
      imports: [SignaturesComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations(), provideTranslateService(),
        { provide: Router, useValue: { navigate: (...args: unknown[]) => { navigations.push(args); return Promise.resolve(true); } } },
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams } },
        // Feature on + requester role not required — the pre-toggle behaviour the spec pins.
        { provide: SignatureAccessService, useValue: { canRequestSignature: true } }
      ]
    });
    // MatDialogModule (imported by the standalone component) would shadow a root-level override.
    TestBed.overrideComponent(SignaturesComponent, { set: { providers: [{ provide: MatDialog, useValue: dialog }] } });
    fixture = TestBed.createComponent(SignaturesComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function flushInitialLoads(sent: SignatureEnvelopeDTO[] = [], toSign: SignatureEnvelopeDTO[] = [], templates: SignatureTemplateDTO[] = []): void {
    http.expectOne(r => r.url === `${API}/signatures` && !r.params.has('status')).flush(sent);
    http.expectOne(`${API}/signatures/to-sign`).flush(toSign);
    http.expectOne(`${API}/signature-templates`).flush(templates);
    fixture.detectChanges();
  }

  it('loads the three tabs on init', () => {
    const e = envelope({ id: '1' });
    flushInitialLoads([e], [envelope({ id: '2' })], []);
    expect(component.sent.length).toBe(1);
    expect(component.toSign.length).toBe(1);
    expect(component.templates).toEqual([]);
    expect(component.loadingSent).toBe(false);
    expect(component.loadingToSign).toBe(false);
    expect(component.loadingTemplates).toBe(false);
  });

  it('selects the tab named by the ?tab= query param', () => {
    flushInitialLoads();
    expect(component.selectedTab).toBe(0);
    queryParams.next(convertToParamMap({ tab: 'sent' }));
    expect(component.selectedTab).toBe(1);
    queryParams.next(convertToParamMap({ tab: 'templates' }));
    expect(component.selectedTab).toBe(2);
    queryParams.next(convertToParamMap({ tab: 'nope' }));
    expect(component.selectedTab).toBe(2);
  });

  it('computes signer progress ignoring CC recipients', () => {
    flushInitialLoads();
    const e = envelope({ id: '1' });
    expect(component.signers(e).length).toBe(2);
    expect(component.signedCount(e)).toBe('1/2');
    expect(component.progressPct(e)).toBe(50);
  });

  it('filters the sent list by status', () => {
    flushInitialLoads();
    component.setSentFilter('COMPLETED');
    http.expectOne(r => r.url === `${API}/signatures` && r.params.get('status') === 'COMPLETED').flush([envelope({ id: '9', status: 'COMPLETED' })]);
    expect(component.sent[0].status).toBe('COMPLETED');
  });

  it('decides when cancel / resend are possible', () => {
    flushInitialLoads();
    const sent = envelope({ id: '1' });
    expect(component.canCancel(sent)).toBe(true);
    expect(component.canCancel(envelope({ id: '2', status: 'COMPLETED' }))).toBe(false);
    const [signed, pending, cc] = sent.recipients;
    expect(component.canResend(sent, signed)).toBe(false);
    expect(component.canResend(sent, pending)).toBe(true);
    expect(component.canResend(sent, cc)).toBe(false);
    // Sequential: only the recipient whose turn it is can be re-invited.
    const seq = envelope({ id: '3', sequential: true, currentOrder: 1, recipients: [recipient({ id: 'p', orderIndex: 0 }), recipient({ id: 'q', orderIndex: 1 })] });
    expect(component.canResend(seq, seq.recipients[0])).toBe(false);
    expect(component.canResend(seq, seq.recipients[1])).toBe(true);
  });

  it('opens the detail drawer and loads its events', () => {
    const e = envelope({ id: '1' });
    flushInitialLoads([e]);
    component.openDetail(e);
    expect(component.loadingDetail).toBe(true);
    http.expectOne(`${API}/signatures/1/events`).flush([{ type: 'ENVELOPE_SENT', createdAt: '2026-01-01T00:00:00Z' }]);
    expect(component.detail?.id).toBe('1');
    expect(component.detailEvents.length).toBe(1);
    component.openDetail(e); // toggles closed
    expect(component.detail).toBeNull();
  });

  it('cancels an envelope after confirmation and reloads', () => {
    const e = envelope({ id: '1' });
    flushInitialLoads([e]);
    component.cancel(e);
    const req = http.expectOne(`${API}/signatures/1/cancel`);
    expect(req.request.method).toBe('POST');
    req.flush(envelope({ id: '1', status: 'CANCELLED' }));
    http.expectOne(r => r.url === `${API}/signatures`).flush([envelope({ id: '1', status: 'CANCELLED' })]);
    expect(component.sent[0].status).toBe('CANCELLED');
  });

  it('does not cancel when the confirmation is dismissed', () => {
    const e = envelope({ id: '1' });
    flushInitialLoads([e]);
    dialog.nextResult = false;
    component.cancel(e);
    http.expectNone(`${API}/signatures/1/cancel`);
  });

  it('resends a link and patches the envelope in place', () => {
    const e = envelope({ id: '1' });
    flushInitialLoads([e]);
    component.resend(e, e.recipients[1]);
    expect(component.isBusy('1:b')).toBe(true);
    http.expectOne(`${API}/signatures/1/recipients/b/resend`).flush(envelope({ id: '1', recipients: [recipient({ id: 'b', reminderCount: 1 })] }));
    expect(component.isBusy('1:b')).toBe(false);
    expect(component.sent[0].recipients[0].reminderCount).toBe(1);
  });

  it('downloads the signed document', () => {
    const e = envelope({ id: '1', status: 'COMPLETED', signedDocId: 'signed-1' });
    flushInitialLoads([e]);
    // Object URLs / anchor clicks are not available in every test DOM — stub them.
    const origCreate = URL.createObjectURL, origRevoke = URL.revokeObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    let clicked = 0;
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    HTMLAnchorElement.prototype.click = function () { clicked++; };
    try {
      component.downloadSigned(e);
      const req = http.expectOne(`${API}/signatures/1/signed-document`);
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
      expect(component.isBusy('1:dl')).toBe(false);
      expect(clicked).toBe(1);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('navigates to the signed document in the explorer', () => {
    flushInitialLoads();
    component.openSigned(envelope({ id: '1', signedDocId: 'signed-1' }));
    expect(navigations[0]).toEqual([['/my-folder'], { queryParams: { targetFileId: 'signed-1', openViewer: true } }]);
    component.openSigned(envelope({ id: '2' })); // no signed doc → no navigation
    expect(navigations.length).toBe(1);
  });

  it('deletes a template after confirmation', () => {
    const t: SignatureTemplateDTO = { id: 't1', ownerEmail: 'me', name: 'NDA', roles: [], fields: [], sequential: false, createdAt: '', updatedAt: '' };
    flushInitialLoads([], [], [t]);
    component.deleteTemplate(t);
    const req = http.expectOne(`${API}/signature-templates/t1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    http.expectOne(`${API}/signature-templates`).flush([]);
    expect(component.templates).toEqual([]);
  });
});
