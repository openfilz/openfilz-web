import { OidcSecurityService } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';

/**
 * Keeps application bootstrap bounded, and keeps a backgrounded tab's session alive.
 *
 * Angular holds the whole application back until every `provideAppInitializer` promise settles,
 * and until then the page shows the `<app-root>Loading...</app-root>` placeholder from index.html.
 * The auth initializer awaits three network-dependent steps (OIDC `checkAuth`, role extraction,
 * `GET /settings`) and, in two branches, deliberately never resolves while waiting for a redirect
 * to happen. None of that had a deadline, so any request that stalled rather than failed left the
 * app on a blank "Loading..." screen with no way out but a manual refresh.
 *
 * That is routine on mobile: switching apps freezes the tab, and the browser either discards it
 * (forcing a reload that starts over on a radio that has not woken yet) or restores it from the
 * back/forward cache mid-bootstrap with its in-flight request already dead. A stalled request
 * never rejects, so the `try/catch` around it never fires.
 *
 * The rule here is that bootstrap always ends: every step either answers, fails, or times out,
 * and the app boots either way. Booting unauthenticated is not a broken state — `authGuard`
 * redirects to Keycloak, which is what should have happened in the first place.
 */

/** How long any single bootstrap step may take before we stop waiting and carry on without it. */
const STEP_TIMEOUT_MS = 8_000;

/**
 * How long to hold bootstrap after asking the browser to navigate away. Long enough that a real
 * redirect always wins the race, short enough that a redirect which never happens (a blocked
 * navigation, or `authorize()` giving up because the OIDC discovery document never loaded) ends
 * in a usable app rather than a dead screen.
 */
const REDIRECT_GRACE_MS = 10_000;

/** Renew this long before actual expiry, so a request issued right after resume still has a valid token. */
const RENEW_SKEW_SECONDS = 60;

/**
 * Wait for `work`, but never longer than `ms`. A step that times out or rejects resolves to
 * `fallback` — it does not reject, because a failed bootstrap step must not abort bootstrap.
 */
export function withDeadline<T>(work: Promise<T>, label: string, fallback: T, ms = STEP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      console.warn(`[bootstrap] "${label}" did not answer within ${ms}ms — continuing without it.`);
      finish(fallback);
    }, ms);

    work.then(finish, error => {
      console.error(`[bootstrap] "${label}" failed:`, error);
      finish(fallback);
    });
  });
}

/**
 * Hold bootstrap while the browser navigates away. Replaces `new Promise(() => {})`: if the
 * navigation does happen this promise is simply never observed, and if it does not, the app boots
 * anyway and the route guard takes over instead of the user staring at "Loading...".
 */
export function holdForRedirect(label: string): Promise<null> {
  return new Promise<null>(resolve => {
    setTimeout(() => {
      console.warn(`[bootstrap] redirect "${label}" did not happen — booting so the route guard can take over.`);
      resolve(null);
    }, REDIRECT_GRACE_MS);
  });
}

/** Seconds-since-epoch expiry of a JWT, or null when it carries no readable `exp`. */
function expiryOf(accessToken: string | null | undefined): number | null {
  if (!accessToken) {
    return null;
  }
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) {
      return null;
    }
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/**
 * Renew the access token when the user comes back to a tab that was in the background.
 *
 * `silentRenew` schedules renewal on a timer, and a frozen or discarded tab does not run timers —
 * so a tab left alone for longer than the token's lifetime comes back holding an expired token and
 * every API call 401s until something forces a refresh. Resuming is therefore treated as a renewal
 * trigger in its own right: refresh if the token is gone or about to expire, and if the refresh
 * token is spent too, send the user to Keycloak rather than leaving a session that cannot work.
 */
export function installSessionResumeRefresh(oidc: OidcSecurityService): void {
  let inFlight = false;

  const onResume = async () => {
    if (document.visibilityState !== 'visible' || inFlight) {
      return;
    }

    const { isAuthenticated } = await firstValueFrom(oidc.isAuthenticated$);
    if (!isAuthenticated) {
      // Not signed in: authGuard already owns this case, and forcing a redirect from here
      // would fight it (and would hijack the public signing page, which has no session).
      return;
    }

    const exp = expiryOf(await firstValueFrom(oidc.getAccessToken()));
    if (exp !== null && exp - RENEW_SKEW_SECONDS > Date.now() / 1000) {
      return; // still valid for a while — nothing to do
    }

    inFlight = true;
    try {
      await firstValueFrom(oidc.forceRefreshSession());
    } catch (error) {
      console.warn('[auth] token renewal after resume failed — sending the user to sign in again:', error);
      oidc.authorize();
    } finally {
      inFlight = false;
    }
  };

  document.addEventListener('visibilitychange', () => void onResume());
  // A back/forward-cache restore does not always change visibility, so it needs its own hook.
  window.addEventListener('pageshow', event => {
    if ((event as PageTransitionEvent).persisted) {
      void onResume();
    }
  });
}
