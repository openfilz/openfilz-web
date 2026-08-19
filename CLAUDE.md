# CLAUDE.md — OpenFilz Web (Core)

## Overview

Open-source Angular 21 frontend for OpenFilz DMS. Provides document management UI with file explorer, search, dashboard, recycle bin, and OnlyOffice integration.

**Version:** 1.1.32-SNAPSHOT
**License:** AGPL-3.0

---

## Tech Stack

- **Angular:** 21.2.5 (Standalone Components)
- **TypeScript:** 5.9.3
- **UI:** Angular Material 21.2.3, Angular CDK 21.2.3
- **GraphQL:** Apollo Angular 13.0.0, @apollo/client 4.0.11
- **Auth:** angular-auth-oidc-client 20.0.3 (Keycloak OIDC)
- **i18n:** @ngx-translate/core 17.0.0
- **Editors:** ngx-monaco-editor-v2 20.3.0, pdfjs-dist 4.10.38
- **Uploads:** tus-js-client 4.2.3 (resumable uploads)
- **Other:** file-saver, xlsx, mammoth, marked, highlight.js, rxjs 7.8.1

---

## Project Structure

```
src/app/
├── components/          21 reusable UI components
│   ├── base/            FileOperationsComponent (shared operations)
│   ├── breadcrumb/      Navigation breadcrumbs
│   ├── dashboard/       Home dashboard
│   ├── file-explorer/   Main file/folder browser
│   ├── file-grid/       Grid view
│   ├── file-list/       List view
│   ├── header/          App header (search, language selector)
│   ├── metadata-editor/ Document metadata editor
│   ├── metadata-panel/  Metadata display
│   ├── onlyoffice-editor/ OnlyOffice wrapper
│   ├── search-filters/  Advanced search UI
│   ├── search-results/  Search results display
│   ├── sidebar/         Navigation sidebar
│   ├── text-editor/     Text file editor
│   ├── toolbar/         Action toolbar
│   ├── upload-progress/ Upload tracking
│   └── upload-zone/     File drop zone
├── dialogs/             13 dialog components
│   ├── confirm-dialog, confirm-replace-dialog
│   ├── create-document-dialog, create-folder-dialog
│   ├── document-properties-dialog
│   ├── file-too-large-dialog, file-viewer-dialog
│   ├── folder-tree-dialog
│   ├── keyboard-shortcuts-dialog
│   ├── partial-upload-result-dialog
│   ├── rename-dialog, settings-dialog, upload-dialog
├── pages/               Route pages
│   ├── dashboard/       Dashboard overview
│   ├── favorites/       Favorited documents
│   ├── recycle-bin/     Deleted items
│   └── settings/       Application settings
├── services/            14 services (see below)
├── guards/              Route guards (authGuard, recycleBinGuard)
├── models/              TypeScript interfaces
├── directives/          4 custom directives
├── types/               Type definitions
├── config/              App configuration
└── i18n/                Translation setup
```

---

## Routing

```
/                   → redirect to /dashboard
/dashboard          Dashboard (authGuard)
/my-folder          File explorer (authGuard)
/search             Search results (authGuard)
/recycle-bin        Recycle bin (authGuard + recycleBinGuard)
/favorites          Favorites (authGuard)
/settings           Settings (authGuard)
**                  → /dashboard
```

---

## Services

| Service | Purpose |
|---------|---------|
| `document-api.service` | GraphQL & REST API client (core service) |
| `role.service` | Role-based access (READER, CONTRIBUTOR, AUDITOR, CLEANER) |
| `theme.service` | 10 themes (light, dark, ocean, forest, sunset, lavender, rose, midnight, slate, copper) |
| `settings.service` | App settings (bin interval, quotas, thumbnails) |
| `search.service` | Search with filters and suggestions |
| `user-preferences.service` | User preferences persistence |
| `breadcrumb.service` | Navigation breadcrumb state |
| `drag-drop.service` | Drag-drop operations |
| `file-icon.service` | File type icon mapping |
| `onlyoffice.service` | OnlyOffice editor integration |
| `resumable-upload.service` | TUS protocol for large uploads |
| `keyboard-shortcuts.service` | Keyboard shortcut handling |
| `touch-detection.service` | Touch device detection |
| `mock-auth.service` | Mock auth for development |

---

## API Integration

**Mixed REST + GraphQL pattern:**
- **REST** for mutations: create, rename, move, copy, delete, upload, download
- **GraphQL** for reads: listFolder, search, favorites, recent files, count

**REST base:** `{NG_APP_API_URL}` (default: `http://localhost:8081/api/v1`)
**GraphQL:** `{NG_APP_GRAPHQL_URL}` (default: `http://localhost:8081/graphql/v1`)

**REST endpoints consumed:**
- `/folders/*`, `/files/*`, `/documents/*` — CRUD operations
- `/favorites/*` — favorite management
- `/recycle-bin/*` — trash operations
- `/audit/*` — audit trail
- `/dashboard/*` — statistics
- `/settings` — app settings

---

## Authentication

- **OIDC** with Keycloak via `angular-auth-oidc-client`
- Bearer token in Authorization header
- Silent renew with refresh tokens
- Role extraction from `realm_access.roles` or `groups` in JWT
- Auth guard checks `isAuthenticated$`, handles `login_hint` for email invitations
- Mock mode available for development (`NG_APP_AUTHENTICATION_ENABLED=false`)

---

## Internationalization

- **Framework:** @ngx-translate/core with HTTP loader
- **Locales:** 8 — en (default), fr, de, es, it, nl, pt, ar
- **Files:** `src/i18n/{locale}.json`
- **RTL support:** Document direction updates for Arabic
- **Browser detection:** Auto-loads matching browser language

---

## Environment Variables

Runtime environment variables via `@ngx-env/builder` (prefix: `NG_APP_`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `NG_APP_API_URL` | `http://localhost:8081/api/v1` | REST API base URL |
| `NG_APP_GRAPHQL_URL` | `http://localhost:8081/graphql/v1` | GraphQL endpoint |
| `NG_APP_AUTHENTICATION_AUTHORITY` | `http://localhost:8080/realms/openfilz` | Keycloak realm URL |
| `NG_APP_AUTHENTICATION_CLIENT_ID` | `openfilz-web` | OIDC client ID |
| `NG_APP_AUTHENTICATION_ENABLED` | `true` | Enable/disable auth |
| `NG_APP_ONLYOFFICE_ENABLED` | `true` | Enable OnlyOffice editor |
| `NG_APP_ONLYOFFICE_MAX_FILE_SIZE` | `30` | Max file size for editing (MB) |

---

## Custom Directives

- `auth-image.directive` — add Authorization header to image requests
- `drag-drop.directive` — file drag-drop zone
- `file-draggable.directive` — make elements draggable
- `folder-drop-zone.directive` — drop target for folders

---

## Build & Dev Commands

```bash
npm install                # Install dependencies
npm start                  # Dev server (ng serve, local-dev config)
ng build                   # Production build
```

**Build configurations:** `local-dev` (dev, source maps), `production` (AOT, optimized, hashed)

**Output:** `dist/openfilz-ui/`

**Pagination config:** Default 25 items, options [25, 50, 70, 100]
