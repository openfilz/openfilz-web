import { SignatureEnvelopeStatus, SignatureEventDTO } from '../models/signature.models';

/**
 * How to show an envelope event's `details` line. The server writes them as short English
 * notes (`"2 recipient(s)"`, `"1 field(s)"`, `"seal=archiving-api PDF/A-2b"`, an auth method,
 * an e-mail, a decline reason) — recognised ones become an i18n key, the rest stays as is.
 */
export type EventDetailsView =
  | { key: string; params?: Record<string, string | number> }
  | { text: string };

const COUNT_DETAILS: Record<string, { pattern: RegExp; key: string }> = {
  ENVELOPE_SENT: { pattern: /^(\d+) recipient\(s\)$/, key: 'signature.eventDetails.recipients' },
  RECIPIENT_SIGNED: { pattern: /^(\d+) field\(s\)$/, key: 'signature.eventDetails.fields' },
};

const AUTH_METHODS = ['NONE', 'EMAIL_OTP', 'SMS_OTP'];

/**
 * @param sealSigner name of the certificate that sealed the envelope (shown on the completion
 *                   event instead of the internal sealer id), when known
 * @returns null when there is nothing worth showing
 */
export function eventDetailsView(ev: SignatureEventDTO, sealSigner?: string | null): EventDetailsView | null {
  const details = ev.details?.trim();
  if (!details) return null;

  const count = COUNT_DETAILS[ev.type];
  if (count) {
    const m = count.pattern.exec(details);
    if (m) {
      const n = Number(m[1]);
      return { key: count.key + (n === 1 ? '.one' : '.other'), params: { count: n } };
    }
  }

  if (ev.type === 'ENVELOPE_COMPLETED') {
    // "seal=<provider>[ <archival flavor>]" — the provider id means nothing to a user.
    const m = /^seal=\S+(?:\s+(.+))?$/.exec(details);
    if (m) {
      const flavor = m[1]?.trim();
      if (sealSigner && flavor) return { key: 'signature.eventDetails.sealedArchived', params: { signer: sealSigner, flavor } };
      if (sealSigner) return { key: 'signature.eventDetails.sealed', params: { signer: sealSigner } };
      if (flavor) return { key: 'signature.eventDetails.archived', params: { flavor } };
      return null;
    }
  }

  if (ev.type === 'RECIPIENT_OTP_VERIFIED' && AUTH_METHODS.includes(details)) {
    return { key: 'signature.authMethods.' + details };
  }

  return { text: details };
}

/** The expiry date only matters while signatures are awaited, or to explain an expired envelope. */
export function showsExpiry(status: SignatureEnvelopeStatus): boolean {
  return status === 'DRAFT' || status === 'SENT' || status === 'EXPIRED';
}
