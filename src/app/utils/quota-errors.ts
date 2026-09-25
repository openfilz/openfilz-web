/**
 * Upload refusals → i18n keys. The API answers 413 (file too large) and 507 (storage full) with a
 * JSON body whose `error` tells "your space is full" (UserQuotaExceeded) from "the server is full"
 * (InstanceQuotaExceeded). Works with an HttpErrorResponse body (object) and with the raw text body
 * tus-js-client exposes (originalResponse.getBody()).
 */
export const QUOTA_ERROR_KEYS = {
  fileTooLarge: 'upload.errors.fileTooLarge',
  userQuota: 'upload.errors.quotaExceeded',
  instanceQuota: 'upload.errors.instanceQuotaExceeded'
} as const;

export function quotaErrorCode(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      return quotaErrorCode(JSON.parse(body));
    } catch {
      return null;
    }
  }
  const code = (body as { error?: unknown }).error;
  return typeof code === 'string' ? code : null;
}

/** The i18n key for a 413 / 507 refusal, or null when the status is neither. */
export function quotaErrorKey(status: number | undefined, body?: unknown): string | null {
  if (status === 413) return QUOTA_ERROR_KEYS.fileTooLarge;
  if (status === 507) {
    return quotaErrorCode(body) === 'InstanceQuotaExceeded' ? QUOTA_ERROR_KEYS.instanceQuota : QUOTA_ERROR_KEYS.userQuota;
  }
  return null;
}
