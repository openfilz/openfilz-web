import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { extractTokenRoles } from '../utils/token-roles';

export type UserRole = 'READER' | 'CONTRIBUTOR' | 'AUDITOR' | 'CLEANER' | 'SIGN_REQUESTER' | 'WORKFLOW_DESIGNER';

const VALID_ROLES: UserRole[] = ['READER', 'CONTRIBUTOR', 'AUDITOR', 'CLEANER', 'SIGN_REQUESTER', 'WORKFLOW_DESIGNER'];

@Injectable({ providedIn: 'root' })
export class RoleService {
  private userRoles: UserRole[] = [];
  private initialized = false;
  private oidcSecurityService = inject(OidcSecurityService);
  private router = inject(Router);

  /**
   * Check if the user has a specific role.
   * When authentication is disabled, always returns true.
   */
  hasRole(role: UserRole): boolean {
    if (!environment.authentication.enabled) {
      return true;
    }
    return this.userRoles.includes(role);
  }

  /**
   * Get all roles of the current user.
   */
  getRoles(): UserRole[] {
    if (!environment.authentication.enabled) {
      return [...VALID_ROLES];
    }
    return [...this.userRoles];
  }

  /**
   * Initialize roles from the JWT access token.
   * Should be called after successful authentication.
   * Returns true if at least one valid role was found, false otherwise.
   */
  async initializeRoles(): Promise<boolean> {
    if (!environment.authentication.enabled) {
      this.initialized = true;
      return true;
    }

    const accessToken = await firstValueFrom(this.oidcSecurityService.getAccessToken());
    if (!accessToken) {
      console.error('No access token available');
      return false;
    }

    const decodedToken = this.decodeToken(accessToken);
    if (!decodedToken) {
      console.error('Failed to decode access token');
      return false;
    }

    // Mirror the backend's role-token-lookup: realm_access.roles (default) or, in GROUPS
    // mode, only the groups /<root>/<ROLE> (see utils/token-roles.ts).
    const { roles, source } = extractTokenRoles(decodedToken, VALID_ROLES, environment.roles);
    if (roles.length > 0) {
      this.userRoles = roles;
      this.initialized = true;
      console.log(`Roles initialized from ${source}:`, this.userRoles);
      return true;
    }

    // No valid roles found
    console.error('No valid roles found in token');
    this.initialized = true;
    return false;
  }

  /**
   * Check if roles have been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Handle the case when user has no valid roles.
   * Shows error message and logs out.
   */
  handleNoRoles(): void {
    alert('You do not have the required role to access this application');
    this.oidcSecurityService.logoff();
  }

  /**
   * Decode a JWT token.
   */
  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch (e) {
      console.error('Error decoding token:', e);
      return null;
    }
  }
}
