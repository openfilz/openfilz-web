import {
  DEFAULT_ROOT_GROUP, RoleLookupConfig, extractGroupRoles, extractTokenRoles, parseRoleTokenLookup, parseRootGroup
} from './token-roles';

/**
 * Role derivation used by RoleService.initializeRoles — must never grant more than the API
 * (AbstractSecurityService: realm_access.roles, or exact groups `/<root>/<ROLE>` in GROUPS mode).
 * Only jasmine/vitest-common matchers (describe / it / expect / toEqual / toBe).
 * Run: `npx vitest run src/app/utils/token-roles.spec.ts --globals`.
 */

const VALID = ['READER', 'CONTRIBUTOR', 'AUDITOR', 'CLEANER', 'ADMIN'] as const;
const REALM: RoleLookupConfig = { lookup: 'REALM_ACCESS', rootGroup: 'OPENFILZ' };
const GROUPS: RoleLookupConfig = { lookup: 'GROUPS', rootGroup: 'OPENFILZ' };

describe('token-roles', () => {
  describe('config parsing', () => {
    it('defaults to REALM_ACCESS unless GROUPS is set (case/space-insensitive)', () => {
      expect(parseRoleTokenLookup(undefined)).toBe('REALM_ACCESS');
      expect(parseRoleTokenLookup('')).toBe('REALM_ACCESS');
      expect(parseRoleTokenLookup('REALM_ACCESS')).toBe('REALM_ACCESS');
      expect(parseRoleTokenLookup('nonsense')).toBe('REALM_ACCESS');
      expect(parseRoleTokenLookup('GROUPS')).toBe('GROUPS');
      expect(parseRoleTokenLookup(' groups ')).toBe('GROUPS');
    });

    it('defaults the root group to OPENFILZ', () => {
      expect(DEFAULT_ROOT_GROUP).toBe('OPENFILZ');
      expect(parseRootGroup(undefined)).toBe('OPENFILZ');
      expect(parseRootGroup('  ')).toBe('OPENFILZ');
      expect(parseRootGroup(' ACME ')).toBe('ACME');
      expect(parseRootGroup('/ACME/')).toBe('ACME');
      expect(parseRootGroup(' //ACME ')).toBe('ACME');
      expect(parseRootGroup('/')).toBe('OPENFILZ');
    });
  });

  describe('REALM_ACCESS mode (default, unchanged)', () => {
    it('reads valid realm roles and drops unknown ones', () => {
      const token = { realm_access: { roles: ['default-roles-openfilz', 'offline_access', 'READER', 'CONTRIBUTOR'] } };
      expect(extractTokenRoles(token, VALID, REALM)).toEqual({ roles: ['READER', 'CONTRIBUTOR'], source: 'realm_access' });
    });

    it('ignores groups when the token has a valid realm role', () => {
      const token = { realm_access: { roles: ['READER'] }, groups: ['/OPENFILZ/CONTRIBUTOR', '/OPENFILZ/ADMIN'] };
      expect(extractTokenRoles(token, VALID, REALM).roles).toEqual(['READER']);
    });

    it('never reads groups — no realm role means no role, even with /<root>/<ROLE> groups', () => {
      const token = {
        realm_access: { roles: ['offline_access', 'default-roles-openfilz'] },
        groups: ['/OPENFILZ/CONTRIBUTOR', '/OPENFILZ/AUDITOR', '/OTHER/ADMIN']
      };
      expect(extractTokenRoles(token, VALID, REALM)).toEqual({ roles: [], source: null });
    });

    it('returns no role (source null) when nothing matches', () => {
      expect(extractTokenRoles({}, VALID, REALM)).toEqual({ roles: [], source: null });
      expect(extractTokenRoles({ groups: ['/OPENFILZ/ADMIN'] }, VALID, REALM)).toEqual({ roles: [], source: null });
    });
  });

  describe('GROUPS mode', () => {
    it('grants only groups whose full path is /<root>/<ROLE>', () => {
      const token = { groups: ['/OPENFILZ/READER', '/OPENFILZ/CONTRIBUTOR', '/OPENFILZ/UNKNOWN'] };
      expect(extractTokenRoles(token, VALID, GROUPS)).toEqual({ roles: ['READER', 'CONTRIBUTOR'], source: 'groups' });
    });

    it('ignores /OTHER/ADMIN and other roots, nested paths, bare names and near-miss roots', () => {
      const token = {
        groups: ['/OTHER/ADMIN', '/OTHER/CONTRIBUTOR', '/OPENFILZ/sub/ADMIN', 'ADMIN', 'OPENFILZ/ADMIN',
          '/OPENFILZ2/ADMIN', '/openfilz/ADMIN', '/OPENFILZ/admin', '/OPENFILZ/', '/OPENFILZ', 42, null]
      };
      expect(extractTokenRoles(token, VALID, GROUPS)).toEqual({ roles: [], source: null });
    });

    it('ignores realm roles — default realm roles + groups yields only the group roles', () => {
      const token = {
        realm_access: { roles: ['default-roles-openfilz', 'READER', 'ADMIN'] },
        groups: ['/OPENFILZ/CONTRIBUTOR', '/OTHER/AUDITOR']
      };
      expect(extractTokenRoles(token, VALID, GROUPS)).toEqual({ roles: ['CONTRIBUTOR'], source: 'groups' });
    });

    it('gives no role from realm roles alone', () => {
      const token = { realm_access: { roles: ['READER', 'CONTRIBUTOR'] } };
      expect(extractTokenRoles(token, VALID, GROUPS)).toEqual({ roles: [], source: null });
    });

    it('honours a custom root group and de-duplicates', () => {
      const token = { groups: ['/ACME/AUDITOR', '/ACME/AUDITOR', '/OPENFILZ/ADMIN'] };
      expect(extractTokenRoles(token, VALID, { lookup: 'GROUPS', rootGroup: 'ACME' }).roles).toEqual(['AUDITOR']);
      expect(extractGroupRoles(token, VALID, 'OPENFILZ')).toEqual(['ADMIN']);
    });
  });
});
