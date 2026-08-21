import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideTranslateService } from '@ngx-translate/core';
import { NEVER, of } from 'rxjs';

import { RequestSignatureDialogComponent } from './request-signature-dialog.component';
import { DocumentApiService } from '../../services/document-api.service';
import { cssToPdf, pdfToCss, pdfToPercentStyle, clampBox, isWithinPage, defaultFieldSize } from '../../utils/signature-geometry';
import {
  buildCreateRequest, buildTemplateRequest, EnvelopeDraft, newRecipient, nextLocalId, templateToRecipients, validateDraft
} from '../../utils/signature-envelope';
import { SignatureTemplateDTO } from '../../models/signature.models';
import { environment } from '../../../environments/environment';

describe('signature geometry (coordinate conversion)', () => {
  it('converts a CSS top-left box into a normalized bottom-left PDF box', () => {
    // 1000×2000 px page; a 200×100 box whose top-left is at (100, 300).
    const box = cssToPdf({ left: 100, top: 300, width: 200, height: 100 }, 1000, 2000);
    expect(box.x).toBeCloseTo(0.1, 6);
    expect(box.w).toBeCloseTo(0.2, 6);
    expect(box.h).toBeCloseTo(0.05, 6);
    // top = 300/2000 = 0.15 → y (from bottom) = 1 - 0.15 - 0.05 = 0.8
    expect(box.y).toBeCloseTo(0.8, 6);
  });

  it('round-trips through pdfToCss', () => {
    const css = { left: 123, top: 456, width: 210, height: 70 };
    const back = pdfToCss(cssToPdf(css, 800, 1100), 800, 1100);
    expect(back.left).toBeCloseTo(css.left, 6);
    expect(back.top).toBeCloseTo(css.top, 6);
    expect(back.width).toBeCloseTo(css.width, 6);
    expect(back.height).toBeCloseTo(css.height, 6);
  });

  it('produces percent styles with the y axis flipped', () => {
    const style = pdfToPercentStyle({ x: 0.25, y: 0.1, w: 0.5, h: 0.2 });
    expect(style['left']).toBe('25%');
    expect(style['width']).toBe('50%');
    expect(style['height']).toBe('20%');
    expect(parseFloat(style['top'])).toBeCloseTo(70, 6); // (1 - 0.1 - 0.2) * 100
  });

  it('clamps boxes into the page and detects out-of-page boxes', () => {
    expect(clampBox({ x: 0.9, y: -0.2, w: 0.3, h: 0.1 })).toEqual({ x: 0.7, y: 0, w: 0.3, h: 0.1 });
    expect(isWithinPage({ x: 0.8, y: 0.95, w: 0.3, h: 0.1 })).toBe(false);
    expect(isWithinPage({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 })).toBe(true);
    expect(cssToPdf({ left: -50, top: -50, width: 5000, height: 5000 }, 100, 100)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('gives every field type a default size inside the page', () => {
    for (const t of ['SIGNATURE', 'INITIALS', 'DATE_SIGNED', 'TEXT', 'CHECKBOX', 'RADIO', 'SELECT', 'IMAGE', 'STAMP'] as const) {
      const s = defaultFieldSize(t);
      expect(s.w).toBeGreaterThan(0);
      expect(s.w).toBeLessThanOrEqual(1);
      expect(s.h).toBeGreaterThan(0);
      expect(s.h).toBeLessThanOrEqual(1);
    }
  });
});

describe('envelope validation rules', () => {
  function draft(partial: Partial<EnvelopeDraft> = {}): EnvelopeDraft {
    return {
      title: 'Contract', message: '', expiresInDays: 30, sequential: false, reminderDays: null,
      recipients: [newRecipient({
        email: 'a@b.co', fields: [{ localId: nextLocalId(), type: 'SIGNATURE', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.05, required: true }]
      })],
      ...partial
    };
  }
  const keys = (d: EnvelopeDraft) => validateDraft(d).map(p => p.key);

  it('accepts a well-formed draft', () => {
    expect(validateDraft(draft())).toEqual([]);
  });

  it('requires a title and at least one recipient', () => {
    expect(keys(draft({ title: '  ' }))).toContain('signature.request.errors.titleRequired');
    expect(keys(draft({ recipients: [] }))).toContain('signature.request.errors.noRecipients');
  });

  it('validates expiry and reminder ranges', () => {
    expect(keys(draft({ expiresInDays: 0 }))).toContain('signature.request.errors.expiresRange');
    expect(keys(draft({ expiresInDays: 366 }))).toContain('signature.request.errors.expiresRange');
    expect(keys(draft({ reminderDays: 91 }))).toContain('signature.request.errors.reminderRange');
    expect(keys(draft({ reminderDays: 7 }))).not.toContain('signature.request.errors.reminderRange');
  });

  it('rejects invalid and duplicate emails', () => {
    const d = draft();
    d.recipients[0].email = 'nope';
    expect(keys(d)).toContain('signature.request.errors.invalidEmail');
    const dup = draft();
    dup.recipients.push(newRecipient({ email: 'A@B.CO', fields: [...dup.recipients[0].fields] }));
    expect(keys(dup)).toContain('signature.request.errors.duplicateEmail');
  });

  it('requires a phone for SMS_OTP recipients', () => {
    const d = draft();
    d.recipients[0].authMethod = 'SMS_OTP';
    expect(keys(d)).toContain('signature.request.errors.phoneRequired');
    d.recipients[0].phone = '+33612345678';
    expect(keys(d)).not.toContain('signature.request.errors.phoneRequired');
  });

  it('requires a signature/initials field per SIGNER and no fields for CC', () => {
    const d = draft();
    d.recipients[0].fields = [{ localId: 'x', type: 'TEXT', page: 0, x: 0, y: 0, w: 0.1, h: 0.1, required: true }];
    expect(keys(d)).toContain('signature.request.errors.signerNeedsSignature');
    d.recipients[0].fields[0].type = 'INITIALS';
    expect(keys(d)).not.toContain('signature.request.errors.signerNeedsSignature');

    const cc = draft();
    cc.recipients[0].role = 'CC';
    expect(keys(cc)).toContain('signature.request.errors.ccHasFields');
    cc.recipients[0].fields = [];
    expect(keys(cc)).toEqual(['signature.request.errors.noSigner']); // a CC-only envelope has nobody to sign
    cc.recipients.push(newRecipient({ email: 'z@b.co', fields: [...draft().recipients[0].fields] }));
    expect(validateDraft(cc)).toEqual([]);
  });

  it('rejects fields outside the page and choice fields without options', () => {
    const d = draft();
    d.recipients[0].fields.push({ localId: 'y', type: 'RADIO', page: 0, x: 0.9, y: 0.9, w: 0.2, h: 0.2, required: true, options: { choices: [] } });
    const k = keys(d);
    expect(k).toContain('signature.request.errors.fieldOutOfPage');
    expect(k).toContain('signature.request.errors.choicesRequired');
  });
});

describe('envelope payload + templates', () => {
  it('builds the create request with sequential order indexes and trimmed values', () => {
    const d: EnvelopeDraft = {
      title: ' Contract ', message: ' hi ', expiresInDays: 10, sequential: true, reminderDays: 3,
      recipients: [
        newRecipient({ name: ' Ann ', email: ' ann@x.io ', fields: [{ localId: '1', type: 'SIGNATURE', page: 1, x: 0.123456, y: 0.2, w: 0.3, h: 0.05, required: true, label: ' Sign ' }] }),
        newRecipient({ email: 'bob@x.io', authMethod: 'SMS_OTP', phone: ' +1555 ', fields: [{ localId: '2', type: 'SELECT', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.03, required: false, options: { choices: [' A ', '', 'B'] } }] }),
        newRecipient({ email: 'cc@x.io', role: 'CC' })
      ]
    };
    const req = buildCreateRequest('doc-1', d);
    expect(req.sourceDocId).toBe('doc-1');
    expect(req.title).toBe('Contract');
    expect(req.message).toBe('hi');
    expect(req.sequential).toBe(true);
    expect(req.reminderDays).toBe(3);
    expect(req.send).toBe(true);
    expect(req.recipients.map(r => r.orderIndex)).toEqual([0, 1, 2]);
    expect(req.recipients[0].name).toBe('Ann');
    expect(req.recipients[0].email).toBe('ann@x.io');
    expect(req.recipients[0].fields![0].x).toBe(0.1235);
    expect(req.recipients[0].fields![0].label).toBe('Sign');
    expect(req.recipients[1].phone).toBe('+1555');
    expect(req.recipients[1].fields![0].options?.choices).toEqual(['A', 'B']);
    expect(req.recipients[2].role).toBe('CC');
    expect(req.recipients[2].fields).toEqual([]);

    const parallel = buildCreateRequest('doc-1', { ...d, sequential: false });
    expect(parallel.recipients.map(r => r.orderIndex)).toEqual([0, 0, 0]);
  });

  it('derives a template from the draft and turns it back into recipients', () => {
    const d: EnvelopeDraft = {
      title: 'T', message: 'm', expiresInDays: 15, sequential: true, reminderDays: null,
      recipients: [
        newRecipient({ name: 'Buyer', email: 'b@x.io', fields: [{ localId: '1', type: 'SIGNATURE', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.05, required: true }] }),
        newRecipient({ email: 's@x.io', authMethod: 'EMAIL_OTP', fields: [{ localId: '2', type: 'INITIALS', page: 0, x: 0.5, y: 0.5, w: 0.1, h: 0.05, required: true }] }),
        newRecipient({ email: 'c@x.io', role: 'CC' })
      ]
    };
    const tpl = buildTemplateRequest('My template', d, 'doc-1');
    expect(tpl.name).toBe('My template');
    expect(tpl.roles.map(r => r.name)).toEqual(['Buyer', 'Signer 2', 'CC 3']);
    expect(tpl.roles.map(r => r.orderIndex)).toEqual([0, 1, 2]);
    expect(tpl.roles[1].authMethod).toBe('EMAIL_OTP');
    expect(tpl.roles[2].role).toBe('CC');
    expect(tpl.fields.length).toBe(2);
    expect(tpl.fields[1].role).toBe('Signer 2');

    const dto: SignatureTemplateDTO = {
      id: 't1', ownerEmail: 'o@x.io', createdAt: '', updatedAt: '', sequential: true,
      ...tpl,
      // reverse the role order to prove recipients come back sorted by orderIndex
      roles: [...tpl.roles].reverse()
    };
    const rows = templateToRecipients(dto);
    expect(rows.map(r => r.name)).toEqual(['Buyer', 'Signer 2', 'CC 3']);
    expect(rows[0].fields.length).toBe(1);
    expect(rows[0].fields[0].type).toBe('SIGNATURE');
    expect(rows[1].authMethod).toBe('EMAIL_OTP');
    expect(rows[2].role).toBe('CC');
    expect(rows[2].fields).toEqual([]);
    expect(rows[0].email).toBe(''); // emails are bound by the initiator
  });
});

describe('RequestSignatureDialogComponent', () => {
  let fixture: ComponentFixture<RequestSignatureDialogComponent>;
  let component: RequestSignatureDialogComponent;
  let http: HttpTestingController;
  const closed: unknown[] = [];

  beforeEach(() => {
    closed.length = 0;
    TestBed.configureTestingModule({
      imports: [RequestSignatureDialogComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations(), provideTranslateService(),
        { provide: MAT_DIALOG_DATA, useValue: { documentId: 'doc-1', documentName: 'contract.pdf' } },
        { provide: MatDialogRef, useValue: { close: (r: unknown) => closed.push(r) } },
        // Never resolves: keeps pdf.js out of the unit test.
        { provide: DocumentApiService, useValue: { downloadDocument: () => NEVER } }
      ]
    });
    // MatDialogModule (imported by the standalone component) would shadow a root-level override.
    TestBed.overrideComponent(RequestSignatureDialogComponent, {
      set: { providers: [{ provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(undefined) }) } }] }
    });
    fixture = TestBed.createComponent(RequestSignatureDialogComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.apiURL}/signature-templates`).flush([]);
  });

  afterEach(() => http.verify());

  it('pre-fills the title from the document name and starts with one signer', () => {
    expect(component.title).toBe('contract');
    expect(component.recipients.length).toBe(1);
    expect(component.recipients[0].role).toBe('SIGNER');
    expect(component.canSend).toBe(false);
  });

  it('places a field for the active recipient and drops fields when switching to CC', () => {
    component.recipients[0].email = 'a@b.co';
    component.placeAtCenter('SIGNATURE');
    expect(component.recipients[0].fields.length).toBe(1);
    expect(component.selectedField).toBe(component.recipients[0].fields[0]);
    expect(isWithinPage(component.recipients[0].fields[0])).toBe(true);
    expect(component.canSend).toBe(true);

    component.recipients[0].role = 'CC';
    component.onRoleChange(component.recipients[0]);
    expect(component.recipients[0].fields).toEqual([]);
    expect(component.selectedField).toBeNull();
    expect(component.canSend).toBe(false); // a CC-only envelope has no signer field
  });

  it('refuses to send while problems exist and shows them', () => {
    component.send();
    expect(component.showProblems).toBe(true);
    http.expectNone(`${environment.apiURL}/signatures`);
  });

  it('sends a valid envelope and closes with the created envelope', () => {
    component.recipients[0].email = 'a@b.co';
    component.placeAtCenter('SIGNATURE');
    component.send();
    const req = http.expectOne(`${environment.apiURL}/signatures`);
    expect(req.request.body.recipients[0].fields[0].type).toBe('SIGNATURE');
    req.flush({ id: 'env-1' });
    expect(closed[0]).toEqual({ success: true, envelope: { id: 'env-1' } });
  });

  it('loads a template into recipients', () => {
    component.templates = [{
      id: 't1', ownerEmail: 'o', name: 'NDA', createdAt: '', updatedAt: '', sequential: true, message: 'Please sign', expiresInDays: 7,
      roles: [{ name: 'Signer', orderIndex: 0 }, { name: 'Witness', orderIndex: 1, authMethod: 'SMS_OTP' }],
      fields: [{ role: 'Witness', type: 'INITIALS', page: 0, x: 0.1, y: 0.1, w: 0.1, h: 0.05, required: true }]
    }];
    component.applyTemplate('t1');
    expect(component.templateId).toBe('t1');
    expect(component.recipients.map(r => r.name)).toEqual(['Signer', 'Witness']);
    expect(component.recipients[1].authMethod).toBe('SMS_OTP');
    expect(component.recipients[1].fields.length).toBe(1);
    expect(component.sequential).toBe(true);
    expect(component.message).toBe('Please sign');
    expect(component.expiresInDays).toBe(7);

    component.applyTemplate(null);
    expect(component.templateId).toBeUndefined();
  });
});
