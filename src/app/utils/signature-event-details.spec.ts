import { SignatureEventDTO } from '../models/signature.models';
import { eventDetailsView, showsExpiry } from './signature-event-details';

function ev(type: SignatureEventDTO['type'], details?: string): SignatureEventDTO {
  return { type, details, createdAt: '2026-09-21T12:05:11Z' };
}

describe('eventDetailsView', () => {
  it('translates recipient and field counts with singular / plural keys', () => {
    expect(eventDetailsView(ev('ENVELOPE_SENT', '1 recipient(s)')))
      .toEqual({ key: 'signature.eventDetails.recipients.one', params: { count: 1 } });
    expect(eventDetailsView(ev('ENVELOPE_SENT', '3 recipient(s)')))
      .toEqual({ key: 'signature.eventDetails.recipients.other', params: { count: 3 } });
    expect(eventDetailsView(ev('RECIPIENT_SIGNED', '2 field(s)')))
      .toEqual({ key: 'signature.eventDetails.fields.other', params: { count: 2 } });
  });

  it('replaces the sealer id on the completion event by the certificate name', () => {
    expect(eventDetailsView(ev('ENVELOPE_COMPLETED', 'seal=archiving-api PDF/A-2b'), 'OpenFilz SAS'))
      .toEqual({ key: 'signature.eventDetails.sealedArchived', params: { signer: 'OpenFilz SAS', flavor: 'PDF/A-2b' } });
    expect(eventDetailsView(ev('ENVELOPE_COMPLETED', 'seal=pkcs12'), 'ACME'))
      .toEqual({ key: 'signature.eventDetails.sealed', params: { signer: 'ACME' } });
    expect(eventDetailsView(ev('ENVELOPE_COMPLETED', 'seal=archiving-api PDF/A-2b')))
      .toEqual({ key: 'signature.eventDetails.archived', params: { flavor: 'PDF/A-2b' } });
    expect(eventDetailsView(ev('ENVELOPE_COMPLETED', 'seal=self-signed-dev'))).toBeNull();
  });

  it('translates the verified auth method', () => {
    expect(eventDetailsView(ev('RECIPIENT_OTP_VERIFIED', 'EMAIL_OTP'))).toEqual({ key: 'signature.authMethods.EMAIL_OTP' });
  });

  it('keeps free text (e-mails, decline reasons) and drops empty details', () => {
    expect(eventDetailsView(ev('RECIPIENT_REMINDED', 'bob@example.com'))).toEqual({ text: 'bob@example.com' });
    expect(eventDetailsView(ev('RECIPIENT_DECLINED', 'Wrong amount'))).toEqual({ text: 'Wrong amount' });
    expect(eventDetailsView(ev('ENVELOPE_CREATED'))).toBeNull();
  });
});

describe('showsExpiry', () => {
  it('shows the expiry only while waiting for signatures or once expired', () => {
    expect(showsExpiry('DRAFT')).toBe(true);
    expect(showsExpiry('SENT')).toBe(true);
    expect(showsExpiry('EXPIRED')).toBe(true);
    expect(showsExpiry('COMPLETED')).toBe(false);
    expect(showsExpiry('DECLINED')).toBe(false);
    expect(showsExpiry('CANCELLED')).toBe(false);
  });
});
