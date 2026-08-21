import {
  CreateSignatureEnvelopeRequest,
  isChoiceFieldType,
  SIGNING_FIELD_TYPES,
  SignatureAuthMethod,
  SignatureFieldInput,
  SignatureFieldOptions,
  SignatureFieldType,
  SignatureRecipientRole,
  SignatureTemplateDTO,
  SignatureTemplateRequest
} from '../models/signature.models';
import { isWithinPage } from './signature-geometry';

/** Per-recipient colour palette (the only hardcoded colours in the feature: they identify people, not theme). */
export const RECIPIENT_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16'
];

export function recipientColor(index: number): string {
  return RECIPIENT_COLORS[index % RECIPIENT_COLORS.length];
}

/** A field placed in the builder (client-side id for tracking / selection). */
export interface PlacedField {
  localId: string;
  type: SignatureFieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required: boolean;
  label?: string;
  options?: SignatureFieldOptions;
}

/** A recipient row in the builder. */
export interface RecipientRow {
  name: string;
  email: string;
  role: SignatureRecipientRole;
  authMethod: SignatureAuthMethod;
  phone: string;
  userId?: string;
  locale?: string;
  fields: PlacedField[];
}

export interface EnvelopeDraft {
  title: string;
  message: string;
  expiresInDays: number | null;
  sequential: boolean;
  reminderDays: number | null;
  recipients: RecipientRow[];
  templateId?: string;
}

let localIdSeq = 0;
export function nextLocalId(): string {
  localIdSeq += 1;
  return `f${Date.now().toString(36)}${localIdSeq}`;
}

export function newRecipient(partial: Partial<RecipientRow> = {}): RecipientRow {
  return { name: '', email: '', role: 'SIGNER', authMethod: 'NONE', phone: '', fields: [], ...partial };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(e: string | undefined): boolean {
  return !!e && EMAIL_RE.test(e.trim());
}

/** Validation problem: i18n key + optional params (recipient index is 1-based for display). */
export interface EnvelopeProblem {
  key: string;
  params?: Record<string, unknown>;
  /** Recipient index this problem refers to, when applicable. */
  recipient?: number;
}

/**
 * Client-side mirror of the server rules:
 *  - title required; at least one recipient, at least one SIGNER; valid emails; no duplicate emails
 *  - every SIGNER needs ≥1 SIGNATURE or INITIALS field; CC recipients have no fields
 *  - SMS_OTP recipients need a phone number
 *  - every field lies within its page; RADIO/SELECT have at least one choice
 */
export function validateDraft(draft: EnvelopeDraft): EnvelopeProblem[] {
  const problems: EnvelopeProblem[] = [];
  if (!draft.title?.trim()) problems.push({ key: 'signature.request.errors.titleRequired' });
  if (!draft.recipients.length) problems.push({ key: 'signature.request.errors.noRecipients' });
  else if (!draft.recipients.some(r => r.role !== 'CC')) problems.push({ key: 'signature.request.errors.noSigner' });
  if (draft.expiresInDays != null && (draft.expiresInDays < 1 || draft.expiresInDays > 365)) {
    problems.push({ key: 'signature.request.errors.expiresRange' });
  }
  if (draft.reminderDays != null && (draft.reminderDays < 1 || draft.reminderDays > 90)) {
    problems.push({ key: 'signature.request.errors.reminderRange' });
  }
  const seen = new Set<string>();
  draft.recipients.forEach((r, i) => {
    const n = i + 1;
    const who = r.name?.trim() || r.email?.trim() || `#${n}`;
    if (!validEmail(r.email)) {
      problems.push({ key: 'signature.request.errors.invalidEmail', params: { n, who }, recipient: i });
    } else {
      const key = r.email.trim().toLowerCase();
      if (seen.has(key)) problems.push({ key: 'signature.request.errors.duplicateEmail', params: { n, who }, recipient: i });
      seen.add(key);
    }
    if (r.authMethod === 'SMS_OTP' && !r.phone?.trim()) {
      problems.push({ key: 'signature.request.errors.phoneRequired', params: { n, who }, recipient: i });
    }
    if (r.role === 'CC') {
      if (r.fields.length) problems.push({ key: 'signature.request.errors.ccHasFields', params: { n, who }, recipient: i });
    } else if (!r.fields.some(f => SIGNING_FIELD_TYPES.has(f.type))) {
      problems.push({ key: 'signature.request.errors.signerNeedsSignature', params: { n, who }, recipient: i });
    }
    r.fields.forEach(f => {
      if (!isWithinPage(f)) {
        problems.push({ key: 'signature.request.errors.fieldOutOfPage', params: { n, who }, recipient: i });
      }
      if (isChoiceFieldType(f.type) && !(f.options?.choices ?? []).some(c => !!c?.trim())) {
        problems.push({ key: 'signature.request.errors.choicesRequired', params: { n, who }, recipient: i });
      }
    });
  });
  return problems;
}

function toFieldInput(f: PlacedField): SignatureFieldInput {
  const input: SignatureFieldInput = {
    type: f.type, page: f.page, x: round(f.x), y: round(f.y), w: round(f.w), h: round(f.h), required: f.required
  };
  if (f.label?.trim()) input.label = f.label.trim();
  if (isChoiceFieldType(f.type)) {
    input.options = { ...(f.options ?? {}), choices: (f.options?.choices ?? []).map(c => c.trim()).filter(Boolean) };
  } else if (f.options && Object.keys(f.options).length) {
    input.options = f.options;
  }
  return input;
}

const round = (v: number): number => Math.round(v * 10000) / 10000;

/** Build the API payload from the builder state. */
export function buildCreateRequest(sourceDocId: string, draft: EnvelopeDraft, send = true): CreateSignatureEnvelopeRequest {
  const req: CreateSignatureEnvelopeRequest = {
    sourceDocId,
    title: draft.title.trim(),
    message: draft.message?.trim() || undefined,
    recipients: draft.recipients.map((r, i) => ({
      userId: r.userId || undefined,
      name: r.name?.trim() || undefined,
      email: r.email.trim(),
      orderIndex: draft.sequential ? i : 0,
      role: r.role,
      authMethod: r.authMethod,
      phone: r.authMethod === 'SMS_OTP' ? r.phone.trim() : undefined,
      locale: r.locale || undefined,
      fields: r.fields.map(toFieldInput)
    })),
    expiresInDays: draft.expiresInDays ?? undefined,
    sequential: draft.sequential,
    reminderDays: draft.reminderDays ?? undefined,
    send
  };
  if (draft.templateId) req.templateId = draft.templateId;
  return req;
}

/** Role name used when saving a recipient as a template role (must be unique per template). */
export function roleNameFor(r: RecipientRow, index: number, taken: Set<string>): string {
  const base = (r.name?.trim() || (r.role === 'CC' ? `CC ${index + 1}` : `Signer ${index + 1}`)).slice(0, 60);
  let name = base;
  let k = 2;
  while (taken.has(name)) name = `${base} ${k++}`;
  taken.add(name);
  return name;
}

/** Derive a template (roles + fields) from the current builder state. */
export function buildTemplateRequest(name: string, draft: EnvelopeDraft, sourceDocId?: string): SignatureTemplateRequest {
  const taken = new Set<string>();
  const roleNames = draft.recipients.map((r, i) => roleNameFor(r, i, taken));
  return {
    name: name.trim(),
    sourceDocId,
    roles: draft.recipients.map((r, i) => ({
      name: roleNames[i], orderIndex: draft.sequential ? i : 0, role: r.role, authMethod: r.authMethod
    })),
    fields: draft.recipients.flatMap((r, i) => r.fields.map(f => ({ role: roleNames[i], ...toFieldInput(f) }))),
    message: draft.message?.trim() || undefined,
    expiresInDays: draft.expiresInDays ?? undefined,
    sequential: draft.sequential
  };
}

/**
 * Turn a template into builder recipients: one row per role (in orderIndex order)
 * carrying the role's fields. The role name is kept as a placeholder name so the
 * initiator sees which role each row binds to.
 */
export function templateToRecipients(tpl: SignatureTemplateDTO): RecipientRow[] {
  const roles = [...(tpl.roles ?? [])].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  return roles.map(role => newRecipient({
    name: role.name,
    role: role.role ?? 'SIGNER',
    authMethod: role.authMethod ?? 'NONE',
    fields: (tpl.fields ?? []).filter(f => f.role === role.name).map(f => ({
      localId: nextLocalId(),
      type: f.type, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h,
      required: f.required ?? true,
      label: f.label,
      options: f.options
    }))
  }));
}
