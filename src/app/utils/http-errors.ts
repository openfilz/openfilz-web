import { HttpErrorResponse } from '@angular/common/http';

/**
 * "The browser never got an HTTP answer from the API": HttpClient reports status 0 when the request
 * could not be sent or was blocked — API down, wrong NG_APP_API_URL / NG_APP_GRAPHQL_URL (e.g.
 * `localhost` seen from another machine), or the page origin missing from the API's CORS allowed
 * origins. The server logs nothing in those cases, so the generic "operation failed" message
 * leaves an administrator with no lead (openfilz-core#326).
 *
 * Apollo wraps the HttpErrorResponse of a GraphQL call (`cause`, or `networkError` in older
 * versions), so the chain is walked.
 */
export const API_UNREACHABLE_KEY = 'common.apiUnreachable';

export function isApiUnreachable(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof HttpErrorResponse) {
      return current.status === 0;
    }
    const wrapper = current as { cause?: unknown; networkError?: unknown };
    current = wrapper.cause ?? wrapper.networkError;
  }
  return false;
}

/** The i18n key to show for a failed call: the "API unreachable" one, else the caller's own. */
export function httpErrorKey(err: unknown, fallbackKey: string): string {
  return isApiUnreachable(err) ? API_UNREACHABLE_KEY : fallbackKey;
}
