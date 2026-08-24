import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideTranslateService } from '@ngx-translate/core';

import {
  initialsOf, SignaturePadDialogComponent, SignaturePadDialogData, SignaturePadResult
} from './signature-pad-dialog.component';
import { SignatureFieldType } from '../../models/signature.models';

describe('initialsOf', () => {
  it('takes the first letter of every word, uppercased', () => {
    expect(initialsOf('Yann Demel')).toBe('YD');
    expect(initialsOf('jean-pierre du pont')).toBe('JPDP');
    expect(initialsOf('  ada   lovelace ')).toBe('AL');
  });

  it('caps at four letters and tolerates a missing name', () => {
    expect(initialsOf('a b c d e f')).toBe('ABCD');
    expect(initialsOf(undefined)).toBe('');
    expect(initialsOf('')).toBe('');
  });
});

describe('SignaturePadDialogComponent', () => {
  let closed: SignaturePadResult | undefined | 'not-closed';

  function create(data: Partial<SignaturePadDialogData> & { fieldType: SignatureFieldType }):
      ComponentFixture<SignaturePadDialogComponent> {
    closed = 'not-closed';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SignaturePadDialogComponent],
      providers: [
        provideNoopAnimations(),
        provideTranslateService(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: (r?: SignaturePadResult) => { closed = r; } } }
      ]
    });
    const fixture = TestBed.createComponent(SignaturePadDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  // ── INITIALS ────────────────────────────────────────────────────────────

  it('opens initials on the "type" tab, pre-filled from the name the sender entered', () => {
    const c = create({ fieldType: 'INITIALS', suggestedName: 'Yann Demel' }).componentInstance;
    expect(c.isInitials).toBe(true);
    expect(c.modes).toEqual(['type', 'draw', 'upload']);
    expect(c.mode).toBe('type');
    expect(c.suggestion).toBe('YD');
    expect(c.typedName).toBe('YD');
    // Ready to apply straight away — the signer only has to confirm.
    expect(c.canApply).toBe(true);
  });

  it('normalises typed initials (uppercase, no spaces, max 6)', () => {
    const c = create({ fieldType: 'INITIALS', suggestedName: 'Yann Demel' }).componentInstance;
    c.onTypedInput(' y d ');
    expect(c.typedName).toBe('YD');
    c.onTypedInput('abcdefghij');
    expect(c.typedName).toBe('ABCDEF');
    expect(c.maxTypedLength).toBe(6);
  });

  it('offers to restore the suggestion once the signer edited it', () => {
    const c = create({ fieldType: 'INITIALS', suggestedName: 'Yann Demel' }).componentInstance;
    expect(c.canRestoreSuggestion).toBe(false);
    c.onTypedInput('ZZ');
    expect(c.canRestoreSuggestion).toBe(true);
    c.restoreSuggestion();
    expect(c.typedName).toBe('YD');
    expect(c.canRestoreSuggestion).toBe(false);
  });

  it('adopts initials for every initials field by default (opt-out)', () => {
    expect(create({ fieldType: 'INITIALS', suggestedName: 'Ada L', offerApplyToAll: true })
        .componentInstance.applyToAll).toBe(true);
    // …but never claims to apply to fields that do not exist.
    expect(create({ fieldType: 'INITIALS', suggestedName: 'Ada L' })
        .componentInstance.applyToAll).toBe(false);
  });

  it('uses an initials-specific draw placeholder and a squarer pad', () => {
    const c = create({ fieldType: 'INITIALS', suggestedName: 'Ada L' }).componentInstance;
    expect(c.drawPlaceholderKey).toBe('signature.pad.drawInitialsPlaceholder');
    expect(c.padW).toBe(300);
    expect(c.padH).toBe(240);
  });

  it('emits a PNG for the typed initials', () => {
    const c = create({ fieldType: 'INITIALS', suggestedName: 'Yann Demel', offerApplyToAll: true }).componentInstance;
    c.apply();
    expect(closed).not.toBe('not-closed');
    const result = closed as SignaturePadResult;
    // The pixels come from a canvas (not rendered under jsdom) — assert the contract, not the drawing.
    expect(result.image.startsWith('data:image/png;base64,')).toBe(true);
    expect(result.applyToAll).toBe(true);
  });

  // ── SIGNATURE / IMAGE ───────────────────────────────────────────────────

  it('keeps drawing first for a signature and does not force uppercase', () => {
    const c = create({ fieldType: 'SIGNATURE', suggestedName: 'Yann Demel', offerApplyToAll: true }).componentInstance;
    expect(c.isInitials).toBe(false);
    expect(c.modes).toEqual(['draw', 'type', 'upload']);
    expect(c.mode).toBe('draw');
    expect(c.typedName).toBe('Yann Demel');
    expect(c.applyToAll).toBe(false);         // signatures are adopted explicitly
    expect(c.maxTypedLength).toBe(255);
    c.onTypedInput('Yann Demel');
    expect(c.typedName).toBe('Yann Demel');
    expect(c.drawPlaceholderKey).toBe('signature.sign.drawPlaceholder');
    // Nothing drawn yet → cannot apply.
    expect(c.canApply).toBe(false);
  });

  it('offers upload only for image and stamp fields', () => {
    for (const type of ['IMAGE', 'STAMP'] as SignatureFieldType[]) {
      const c = create({ fieldType: type }).componentInstance;
      expect(c.imageOnly).toBe(true);
      expect(c.modes).toEqual(['upload']);
      expect(c.canApply).toBe(false);
    }
  });

  it('closes with nothing on cancel', () => {
    const c = create({ fieldType: 'INITIALS', suggestedName: 'Ada L' }).componentInstance;
    c.cancel();
    expect(closed).toBeUndefined();
  });
});
