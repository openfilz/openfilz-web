import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { map, take } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../../environments/environment';

export const authGuard: CanActivateFn = (route, state) => {
    if (!environment.authentication.enabled) {
        return of(true);
    }

    const oidcSecurityService = inject(OidcSecurityService);
    const router = inject(Router);

    return oidcSecurityService.isAuthenticated$.pipe(
        take(1),
        map(({ isAuthenticated }) => {
            if (isAuthenticated) {
                return true;
            }

            // Pass login_hint to Keycloak if present in the URL
            // (e.g. from sharing invitation email links).
            // Try route.queryParams first (works for SPA navigation),
            // fall back to window.location.search (works for fresh page load).
            const loginHint = route.queryParams['login_hint']
                || new URLSearchParams(window.location.search).get('login_hint');
            if (loginHint) {
                oidcSecurityService.authorize(undefined, {
                    urlHandler: (url: string) => {
                        const separator = url.includes('?') ? '&' : '?';
                        window.location.href = url + separator + 'login_hint=' + encodeURIComponent(loginHint);
                    }
                });
            } else {
                oidcSecurityService.authorize();
            }
            return false;
        })
    );
};
