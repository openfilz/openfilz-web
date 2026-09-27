/**
 * Role extraction from a decoded access token — the client mirror of the API's
 * `openfilz.security.role-token-lookup` / `openfilz.security.root-group` settings
 * (`AutorizationMode` + `AbstractSecurityService` in openfilz-core).
 *
 * The UI must never grant more than the backend does, so this follows the backend's
 * matching exactly: in GROUPS mode a role counts only when the `groups` claim holds the
 * exact path `/<root>/<ROLE>` (case-sensitive, no nested sub-groups, no other roots).
 *
 * Pure functions (no Angular) so the rules are unit-testable in isolation.
 */

export type RoleTokenLookup = 'REALM_ACCESS' | 'GROUPS';

export const DEFAULT_ROOT_GROUP = 'OPENFILZ';

export interface RoleLookupConfig {
  lookup: RoleTokenLookup;
  rootGroup: string;
}

/** Normalises NG_APP_ROLE_TOKEN_LOOKUP: anything but GROUPS (incl. unset/empty) is REALM_ACCESS. */
export function parseRoleTokenLookup(value: unknown): RoleTokenLookup {
  return typeof value === 'string' && value.trim().toUpperCase() === 'GROUPS' ? 'GROUPS' : 'REALM_ACCESS';
}

/**
 * Normalises NG_APP_ROOT_GROUP like the API normalises openfilz.security.root-group:
 * trimmed, leading/trailing '/' stripped, unset/blank → OPENFILZ.
 */
export function parseRootGroup(value: unknown): string {
  const root = typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/g, '') : '';
  return root !== '' ? root : DEFAULT_ROOT_GROUP;
}

/** Valid roles listed in `realm_access.roles`, in token order, without duplicates. */
export function extractRealmAccessRoles<R extends string>(decodedToken: any, validRoles: readonly R[]): R[] {
  const roles = decodedToken?.realm_access?.roles;
  if (!Array.isArray(roles)) {
    return [];
  }
  return dedupe(roles.filter((role: unknown): role is R =>
    typeof role === 'string' && (validRoles as readonly string[]).includes(role)));
}

/**
 * Valid roles granted through groups: only groups whose full path is exactly
 * `/<rootGroup>/<ROLE>` count (`/OTHER/ADMIN`, `/<root>/x/ADMIN`, `ADMIN` are ignored).
 */
export function extractGroupRoles<R extends string>(decodedToken: any, validRoles: readonly R[], rootGroup: string): R[] {
  const groups = decodedToken?.groups;
  if (!Array.isArray(groups)) {
    return [];
  }
  const prefix = `/${rootGroup}/`;
  const roles: R[] = [];
  for (const group of groups) {
    if (typeof group !== 'string' || !group.startsWith(prefix)) {
      continue;
    }
    const roleName = group.substring(prefix.length);
    if ((validRoles as readonly string[]).includes(roleName)) {
      roles.push(roleName as R);
    }
  }
  return dedupe(roles);
}

/**
 * Roles of the token for the configured lookup mode — exactly what the API reads, never more:
 * - REALM_ACCESS: valid `realm_access.roles` only; groups are never read (the API ignores them
 *   in this mode, so a groups fallback would show actions the API refuses).
 * - GROUPS: exact groups `/<root>/<ROLE>` only; realm roles (e.g. default-roles READER) are ignored.
 */
export function extractTokenRoles<R extends string>(decodedToken: any, validRoles: readonly R[], config: RoleLookupConfig):
    { roles: R[]; source: 'realm_access' | 'groups' | null } {
  if (config.lookup === 'GROUPS') {
    const roles = extractGroupRoles(decodedToken, validRoles, config.rootGroup);
    return { roles, source: roles.length > 0 ? 'groups' : null };
  }
  const roles = extractRealmAccessRoles(decodedToken, validRoles);
  return { roles, source: roles.length > 0 ? 'realm_access' : null };
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}
