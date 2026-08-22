import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

import { SignComponent } from './sign.component';
import { PublicSignatureView, SignatureFieldDTO } from '../../models/signature.models';
import { environment } from '../../../environments/environment';

const PUBLIC = `${environment.apiURL}/public/signatures`;
const TOKEN = 'tok-1';

function field(partial: Partial<SignatureFieldDTO> & { id: string; type: SignatureFieldDTO['type'] }): SignatureFieldDTO {
  return { recipientId: 'r1', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.05, required: true, ...partial };
}

function view(partial: Partial<PublicSignatureView> = {}): PublicSignatureView {
  return {
    envelopeTitle: 'Contract', initiatorEmail: 'boss@acme.test', documentName: 'contract.pdf',
    recipientName: 'Jane Doe', recipientEmail: 'jane@acme.test',
    envelopeStatus: 'SENT', recipientStatus: 'VIEWED', myTurn: true,
    authMethod: 'NONE', otpRequired: false, otpVerified: false,
    fields: [], otherFields: [], ...partial
  };
}

/** Records dialog opens and resolves them with a scripted result. */
class FakeDialog {
  opened: unknown[] = [];
  nextResult: unknown = undefined;
  open(component: unknown): { afterClosed: () => Observable<unknown> } {
    this.opened.push(component);
    return { afterClosed: () => of(this.nextResult) };
  }
}

describe('SignComponent', () => {
  let fixture: ComponentFixture<SignComponent>;
  let component: SignComponent;
  let http: HttpTestingController;
  let dialog: FakeDialog;

  function setup(token: string | null = TOKEN): void {
    dialog = new FakeDialog();
    TestBed.configureTestingModule({
      imports: [SignComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations(), provideTranslateService(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } } }
      ]
    });
    // MatDialogModule (imported by the standalone component) would shadow a root-level override.
    TestBed.overrideComponent(SignComponent, { set: { providers: [{ provide: MatDialog, useValue: dialog }] } });
    fixture = TestBed.createComponent(SignComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit → POST /viewed
  }

  /** Answer the initial /viewed call. */
  function flushViewed(v: PublicSignatureView): void {
    http.expectOne(r => r.url === `${PUBLIC}/viewed` && r.params.get('token') === TOKEN).flush(v);
    fixture.detectChanges();
  }

  /** Answer the document download with a failure so pdf.js is never exercised in unit tests. */
  function failDocument(): void {
    http.expectOne(r => r.url === `${PUBLIC}/document`).error(new ProgressEvent('error'), { status: 500, statusText: 'err' });
    fixture.detectChanges();
  }

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('shows an error when the link has no token', () => {
    setup(null);
    expect(component.phase).toBe('error');
    expect(component.error).toBe('signature.sign.missingToken');
    http.expectNone(r => r.url.startsWith(PUBLIC));
  });

  it('maps 410 on /viewed to the expired-link message', () => {
    setup();
    http.expectOne(r => r.url === `${PUBLIC}/viewed`).flush('', { status: 410, statusText: 'Gone' });
    expect(component.phase).toBe('error');
    expect(component.error).toBe('signature.sign.linkExpired');
  });

  it('maps other /viewed failures to the invalid-link message', () => {
    setup();
    http.expectOne(r => r.url === `${PUBLIC}/viewed`).flush('', { status: 404, statusText: 'Not found' });
    expect(component.error).toBe('signature.sign.invalidLink');
  });

  describe('OTP gating', () => {
    it('stays on the OTP step and does not load the document until verified', () => {
      setup();
      flushViewed(view({ authMethod: 'EMAIL_OTP', otpRequired: true, otpVerified: false }));
      expect(component.phase).toBe('otp');
      expect(component.canAct).toBe(false);
      http.expectNone(r => r.url === `${PUBLIC}/document`);

      component.requestOtp();
      http.expectOne(r => r.url === `${PUBLIC}/otp/request`).flush(null, { status: 202, statusText: 'Accepted' });
      expect(component.otpSent).toBe(true);

      component.otpCode = '123456';
      component.verifyOtp();
      const verify = http.expectOne(r => r.url === `${PUBLIC}/otp/verify`);
      expect(verify.request.body).toEqual({ code: '123456' });
      verify.flush(view({ authMethod: 'EMAIL_OTP', otpRequired: true, otpVerified: true }));
      fixture.detectChanges();

      expect(component.phase).toBe('signing');
      failDocument();
    });

    it('surfaces 403 / 410 / 429 OTP errors with dedicated messages', () => {
      setup();
      flushViewed(view({ authMethod: 'SMS_OTP', otpRequired: true }));
      component.otpCode = '1';
      component.verifyOtp();
      http.expectOne(r => r.url === `${PUBLIC}/otp/verify`).flush('', { status: 403, statusText: 'Forbidden' });
      expect(component.otpError).toBe('signature.sign.otpInvalid');
      component.verifyOtp();
      http.expectOne(r => r.url === `${PUBLIC}/otp/verify`).flush('', { status: 410, statusText: 'Gone' });
      expect(component.otpError).toBe('signature.sign.otpExpired');
      component.verifyOtp();
      http.expectOne(r => r.url === `${PUBLIC}/otp/verify`).flush('', { status: 429, statusText: 'Too many' });
      expect(component.otpError).toBe('signature.sign.otpTooMany');
    });

    it('skips the OTP step when already verified', () => {
      setup();
      flushViewed(view({ authMethod: 'EMAIL_OTP', otpRequired: true, otpVerified: true }));
      expect(component.phase).toBe('signing');
      failDocument();
    });
  });

  describe('states', () => {
    it('is "waiting" when it is not my turn', () => {
      setup();
      flushViewed(view({ myTurn: false }));
      expect(component.phase).toBe('waiting');
      expect(component.canAct).toBe(false);
      failDocument();
    });

    it('is "signed" once the recipient signed (marks stay visible)', () => {
      setup();
      const f = field({ id: 'f1', type: 'SIGNATURE', valueImage: 'data:image/png;base64,AAA' });
      flushViewed(view({ recipientStatus: 'SIGNED', fields: [f] }));
      expect(component.phase).toBe('signed');
      expect(component.entry(f).valueImage).toBe('data:image/png;base64,AAA');
      failDocument();
    });

    it('is "declined" / "closed" for terminal statuses', () => {
      setup();
      flushViewed(view({ recipientStatus: 'DECLINED', envelopeStatus: 'DECLINED' }));
      expect(component.phase).toBe('declined');
      failDocument();
      TestBed.resetTestingModule();

      for (const status of ['CANCELLED', 'EXPIRED', 'COMPLETED'] as const) {
        setup();
        flushViewed(view({ envelopeStatus: status }));
        expect(component.phase).toBe('closed');
        failDocument();
        TestBed.resetTestingModule();
      }
    });
  });

  describe('required-field progress and payload', () => {
    const sig = field({ id: 'sig', type: 'SIGNATURE' });
    const initials = field({ id: 'ini', type: 'INITIALS', required: false });
    const text = field({ id: 'txt', type: 'TEXT' });
    const check = field({ id: 'chk', type: 'CHECKBOX' });
    const date = field({ id: 'dt', type: 'DATE_SIGNED' });
    const select = field({ id: 'sel', type: 'SELECT', required: false, options: { choices: ['A', 'B'] } });

    beforeEach(() => {
      setup();
      flushViewed(view({ fields: [sig, initials, text, check, date, select] }));
      failDocument();
    });

    it('excludes DATE_SIGNED and optional fields from the required count', () => {
      expect(component.requiredFields.map(f => f.id)).toEqual(['sig', 'txt', 'chk']);
      expect(component.completedRequired).toBe(0);
      expect(component.canSign).toBe(false);
    });

    it('counts filled fields and enables Sign only when all required are done', () => {
      component.setValue(text, 'hello');
      expect(component.completedRequired).toBe(1);
      component.toggleCheckbox(check);
      expect(component.completedRequired).toBe(2);
      component.toggleCheckbox(check); // unchecked required checkbox does not count
      expect(component.completedRequired).toBe(1);
      component.toggleCheckbox(check);
      component.entry(sig).valueImage = 'data:image/png;base64,SIG';
      expect(component.completedRequired).toBe(3);
      expect(component.progressPct).toBe(100);
      expect(component.canSign).toBe(true);
    });

    it('applies a pad result to all sibling fields of the same type when requested', () => {
      const sig2 = field({ id: 'sig2', type: 'SIGNATURE' });
      component.view = view({ fields: [sig, sig2, initials] });
      dialog.nextResult = { image: 'data:image/png;base64,X', applyToAll: true };
      component.openPad(sig);
      expect(component.entry(sig).valueImage).toBe('data:image/png;base64,X');
      expect(component.entry(sig2).valueImage).toBe('data:image/png;base64,X');
      expect(component.entry(initials).valueImage).toBeUndefined();
    });

    it('posts only filled fields as { fields: [...] }', () => {
      component.setValue(text, '  hello ');
      component.toggleCheckbox(check);
      component.entry(sig).valueImage = 'data:image/png;base64,SIG';
      component.setValue(select, 'B');
      const payload = component.buildPayload();
      expect(payload.fields).toEqual([
        { fieldId: 'sig', valueImage: 'data:image/png;base64,SIG' },
        { fieldId: 'txt', value: 'hello' },
        { fieldId: 'chk', value: 'true' },
        { fieldId: 'sel', value: 'B' }
      ]);

      component.sign();
      expect(component.signing).toBe(true);
      const req = http.expectOne(r => r.url === `${PUBLIC}/sign` && r.params.get('token') === TOKEN);
      expect(req.request.body).toEqual(payload);
      req.flush(view({ recipientStatus: 'SIGNED', fields: [{ ...sig, valueImage: 'data:image/png;base64,SIG' }] }));
      expect(component.signing).toBe(false);
      expect(component.phase).toBe('signed');
    });

    it('does not sign while required fields are missing', () => {
      component.sign();
      http.expectNone(r => r.url === `${PUBLIC}/sign`);
    });

    it('declines with the reason captured by the dialog', () => {
      dialog.nextResult = { reason: 'Wrong amount' };
      component.decline();
      const req = http.expectOne(r => r.url === `${PUBLIC}/decline`);
      expect(req.request.body).toEqual({ reason: 'Wrong amount' });
      req.flush(view({ recipientStatus: 'DECLINED', envelopeStatus: 'DECLINED' }));
      expect(component.phase).toBe('declined');
    });

    it('does nothing when the decline dialog is dismissed', () => {
      dialog.nextResult = undefined;
      component.decline();
      http.expectNone(r => r.url === `${PUBLIC}/decline`);
    });
  });
});

describe('SignComponent language switcher', () => {
  function build(): SignComponent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SignComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations(), provideTranslateService(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } }
      ]
    });
    return TestBed.createComponent(SignComponent).componentInstance;
  }

  afterEach(() => localStorage.removeItem('preferredLanguage'));

  it('offers the eight shipped locales and starts from the saved preference', () => {
    localStorage.setItem('preferredLanguage', 'de');
    const c = build();
    expect(c.languages.map(l => l.code)).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'nl', 'pt']);
    expect(c.currentLanguage.code).toBe('de');
  });

  it('switches the language, remembers it and flips the document direction for Arabic', () => {
    const c = build();
    c.switchLanguage({ code: 'ar', name: 'العربية' });
    expect(c.currentLanguage.code).toBe('ar');
    expect(localStorage.getItem('preferredLanguage')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    c.switchLanguage({ code: 'fr', name: 'Français' });
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(document.documentElement.getAttribute('lang')).toBe('fr');
  });
});
