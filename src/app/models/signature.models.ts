/**
 * e-Sign models — TypeScript mirror of the Community Edition signature API
 * (openfilz-api: org.openfilz.dms.dto.signature.* and enums.Signature*).
 *
 * Coordinates are normalized (0..1 of the page media box) with the PDF
 * origin at the bottom-left; pages are 0-based. Image values are base64 PNG
 * data URLs.
 */

// ── Enums ─────────────────────────────────────────────────────────────────

export type SignatureEnvelopeStatus =
  | 'DRAFT' | 'SENT' | 'COMPLETED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';

export type SignatureRecipientStatus = 'PENDING' | 'VIEWED' | 'SIGNED' | 'DECLINED';

/** SIGNER must act; CC only receives the completed document. */
export type SignatureRecipientRole = 'SIGNER' | 'CC';

/** Extra authentication a recipient must pass before signing. */
export type SignatureAuthMethod = 'NONE' | 'EMAIL_OTP' | 'SMS_OTP';

export type SignatureFieldType =
  | 'SIGNATURE' | 'INITIALS' | 'DATE_SIGNED' | 'TEXT' | 'NUMBER' | 'EMAIL' | 'PHONE'
  | 'CHECKBOX' | 'RADIO' | 'SELECT' | 'IMAGE' | 'STAMP';

export type SignatureEventType =
  | 'ENVELOPE_CREATED' | 'ENVELOPE_SENT' | 'RECIPIENT_VIEWED' | 'RECIPIENT_OTP_VERIFIED'
  | 'RECIPIENT_SIGNED' | 'RECIPIENT_DECLINED' | 'RECIPIENT_REMINDED' | 'RECIPIENT_LINK_RESENT'
  | 'ENVELOPE_COMPLETED' | 'ENVELOPE_CANCELLED' | 'ENVELOPE_EXPIRED';

export const SIGNATURE_FIELD_TYPES: SignatureFieldType[] = [
  'SIGNATURE', 'INITIALS', 'DATE_SIGNED', 'TEXT', 'NUMBER', 'EMAIL', 'PHONE',
  'CHECKBOX', 'RADIO', 'SELECT', 'IMAGE', 'STAMP'
];

/** Image-valued field types (value carried in `valueImage`). */
export const IMAGE_FIELD_TYPES: ReadonlySet<SignatureFieldType> =
  new Set<SignatureFieldType>(['SIGNATURE', 'INITIALS', 'IMAGE', 'STAMP']);

/** Field types that satisfy the "every SIGNER needs at least one" server rule. */
export const SIGNING_FIELD_TYPES: ReadonlySet<SignatureFieldType> =
  new Set<SignatureFieldType>(['SIGNATURE', 'INITIALS']);

/** Field types with `options.choices`. */
export const CHOICE_FIELD_TYPES: ReadonlySet<SignatureFieldType> =
  new Set<SignatureFieldType>(['RADIO', 'SELECT']);

export function isImageFieldType(t: SignatureFieldType): boolean { return IMAGE_FIELD_TYPES.has(t); }
export function isAutoFieldType(t: SignatureFieldType): boolean { return t === 'DATE_SIGNED'; }
export function isChoiceFieldType(t: SignatureFieldType): boolean { return CHOICE_FIELD_TYPES.has(t); }

/** Material icon per field type (palette + overlays). */
export const FIELD_TYPE_ICONS: Record<SignatureFieldType, string> = {
  SIGNATURE: 'draw',
  INITIALS: 'short_text',
  DATE_SIGNED: 'event',
  TEXT: 'text_fields',
  NUMBER: 'pin',
  EMAIL: 'alternate_email',
  PHONE: 'call',
  CHECKBOX: 'check_box',
  RADIO: 'radio_button_checked',
  SELECT: 'arrow_drop_down_circle',
  IMAGE: 'image',
  STAMP: 'approval'
};

// ── Field options ─────────────────────────────────────────────────────────

export interface SignatureFieldOptions {
  /** RADIO / SELECT choices. */
  choices?: string[];
  [key: string]: unknown;
}

// ── Inputs (initiator) ────────────────────────────────────────────────────

export interface SignatureFieldInput {
  type: SignatureFieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required?: boolean;
  label?: string;
  options?: SignatureFieldOptions;
}

/** Legacy single-field placement (still accepted by the API). */
export interface SignatureFieldPlacement {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SignatureRecipientInput {
  userId?: string;
  name?: string;
  email: string;
  orderIndex?: number;
  role?: SignatureRecipientRole;
  authMethod?: SignatureAuthMethod;
  phone?: string;
  locale?: string;
  fields?: SignatureFieldInput[];
  /** Legacy single field, superseded by `fields`. */
  field?: SignatureFieldPlacement;
}

export interface CreateSignatureEnvelopeRequest {
  sourceDocId: string;
  title: string;
  message?: string;
  recipients: SignatureRecipientInput[];
  expiresInDays?: number;
  sequential?: boolean;
  reminderDays?: number;
  locale?: string;
  /** Defaults to true server-side. */
  send?: boolean;
  templateId?: string;
}

// ── DTOs (initiator) ──────────────────────────────────────────────────────

export interface SignatureFieldDTO {
  id: string;
  recipientId: string;
  type: SignatureFieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required: boolean;
  label?: string;
  options?: SignatureFieldOptions;
  value?: string;
  valueImage?: string;
  filledAt?: string;
}

export interface SignatureRecipientDTO {
  id: string;
  userId?: string;
  name?: string;
  email: string;
  orderIndex: number;
  role: SignatureRecipientRole;
  authMethod: SignatureAuthMethod;
  status: SignatureRecipientStatus;
  viewedAt?: string;
  signedAt?: string;
  declineReason?: string;
  reminderCount: number;
  fields: SignatureFieldDTO[];
}

export interface SignatureEnvelopeDTO {
  id: string;
  title: string;
  message?: string;
  sourceDocId: string;
  signedDocId?: string;
  status: SignatureEnvelopeStatus;
  initiatorEmail: string;
  sequential: boolean;
  currentOrder: number;
  templateId?: string;
  reminderDays?: number;
  sealProvider?: string;
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
  expiresAt: string;
  recipients: SignatureRecipientDTO[];
}

/** Cloud Signing plan + month-to-date usage relayed from sign.openfilz.com (Settings page). */
export interface CloudSignatureSubscription {
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | string;
  billingMode: 'INCLUDED' | 'METERED' | string;
  monthlyQuota: number;
  usedThisMonth: number;
  remaining: number;
  periodStart: string;
  /** When the monthly quota resets (start of next UTC month). */
  periodEnd: string;
  /** True when signing is blocked once the quota is reached (otherwise overage is billed). */
  hardCap: boolean;
  memberSince?: string;
}

export interface SignatureEventDTO {
  type: SignatureEventType;
  actor?: string;
  docSha256?: string;
  signerIp?: string;
  details?: string;
  createdAt: string;
}

// ── Templates ─────────────────────────────────────────────────────────────

export interface SignatureTemplateRole {
  name: string;
  orderIndex?: number;
  role?: SignatureRecipientRole;
  authMethod?: SignatureAuthMethod;
}

export interface SignatureTemplateField extends SignatureFieldInput {
  /** Name of the template role this field belongs to. */
  role: string;
}

export interface SignatureTemplateRequest {
  name: string;
  description?: string;
  sourceDocId?: string;
  roles: SignatureTemplateRole[];
  fields: SignatureTemplateField[];
  message?: string;
  expiresInDays?: number;
  sequential?: boolean;
}

export interface SignatureTemplateDTO {
  id: string;
  ownerEmail: string;
  name: string;
  description?: string;
  sourceDocId?: string;
  roles: SignatureTemplateRole[];
  fields: SignatureTemplateField[];
  message?: string;
  expiresInDays?: number;
  sequential: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateRoleBinding {
  role: string;
  userId?: string;
  name?: string;
  email: string;
  phone?: string;
  locale?: string;
}

export interface InstantiateTemplateRequest {
  sourceDocId?: string;
  title?: string;
  message?: string;
  recipients: TemplateRoleBinding[];
  expiresInDays?: number;
  reminderDays?: number;
  locale?: string;
  send?: boolean;
}

// ── Public (token) ────────────────────────────────────────────────────────

/** What an external signer sees when opening their tokenized link. */
export interface PublicSignatureView {
  envelopeTitle: string;
  message?: string;
  initiatorEmail: string;
  documentName: string;
  recipientName?: string;
  recipientEmail: string;
  envelopeStatus: SignatureEnvelopeStatus;
  recipientStatus: SignatureRecipientStatus;
  /** False while a sequential envelope is waiting on an earlier signer. */
  myTurn: boolean;
  authMethod: SignatureAuthMethod;
  otpRequired: boolean;
  otpVerified: boolean;
  /** This recipient's fields (values included once filled). */
  fields: SignatureFieldDTO[];
  /** Other recipients' fields — rendered read-only. */
  otherFields: SignatureFieldDTO[];
  /** Legacy single-field placement (first SIGNATURE field). */
  fieldPage?: number;
  fieldX?: number;
  fieldY?: number;
  fieldW?: number;
  fieldH?: number;
  signatureImage?: string;
  signatureTyped?: string;
}

export interface SignatureFieldValue {
  fieldId: string;
  value?: string;
  valueImage?: string;
}

export interface ApplySignatureRequest {
  fields?: SignatureFieldValue[];
  /** Legacy single-signature payload. */
  signatureImage?: string;
  typedName?: string;
}

export interface DeclineSignatureRequest {
  reason?: string;
}

export interface VerifyOtpRequest {
  code: string;
}
