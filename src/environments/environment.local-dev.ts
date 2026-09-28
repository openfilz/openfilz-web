import { parseRoleTokenLookup, parseRootGroup } from '../app/utils/token-roles';

export const environment = {
    apiURL: import.meta.env['NG_APP_API_URL'] ?? 'http://localhost:8081/api/v1',
    graphQlURL: import.meta.env['NG_APP_GRAPHQL_URL'] ?? 'http://localhost:8081/graphql/v1',
    authentication: {
        authority: import.meta.env['NG_APP_AUTHENTICATION_AUTHORITY'] ?? 'http://localhost:8180/realms/openfilz',
        clientId: import.meta.env['NG_APP_AUTHENTICATION_CLIENT_ID'] ?? 'openfilz-web',
        enabled: true
    },
    onlyOffice: {
        enabled: true,
        maxFileSize: Number(import.meta.env['NG_APP_ONLYOFFICE_MAX_FILE_SIZE']) || 30
    },
    /**
     * Where the backend reads roles (openfilz.security.role-token-lookup / root-group):
     * REALM_ACCESS (default) = realm_access.roles; GROUPS = only groups /<rootGroup>/<ROLE>.
     * Must mirror OPENFILZ_SECURITY_ROLE_TOKEN_LOOKUP / OPENFILZ_SECURITY_ROOT_GROUP on the API.
     */
    roles: {
        lookup: parseRoleTokenLookup(import.meta.env['NG_APP_ROLE_TOKEN_LOOKUP']),
        rootGroup: parseRootGroup(import.meta.env['NG_APP_ROOT_GROUP'])
    },
    versioning: {
        // Mirrors STORAGE_MINIO_VERSIONING_ENABLED on the backend — both must be set in tandem
        enabled: true
    }
};
