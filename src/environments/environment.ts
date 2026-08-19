export const environment = {
    apiURL: import.meta.env['NG_APP_API_URL'],
    graphQlURL: import.meta.env['NG_APP_GRAPHQL_URL'],
    authentication: {
        authority: import.meta.env['NG_APP_AUTHENTICATION_AUTHORITY'],
        clientId: import.meta.env['NG_APP_AUTHENTICATION_CLIENT_ID'],
        enabled: import.meta.env['NG_APP_AUTHENTICATION_ENABLED'] === 'true'
    },
    onlyOffice: {
        enabled: import.meta.env['NG_APP_ONLYOFFICE_ENABLED'] === 'true',
        maxFileSize: Number(import.meta.env['NG_APP_ONLYOFFICE_MAX_FILE_SIZE']) || 30
    },
    versioning: {
        // Mirrors STORAGE_MINIO_VERSIONING_ENABLED on the backend — both must be set in tandem
        enabled: import.meta.env['NG_APP_STORAGE_MINIO_VERSIONING_ENABLED'] === 'true'
    }
};
