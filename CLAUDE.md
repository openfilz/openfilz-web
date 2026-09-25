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
│   ├── search-filters/  Advanced search filter panel
│   ├── search-refine-bar/ Results page chips, sort, view toggle
│   ├── search-result-list/ Results list view (rich rows)
│   ├── search-results/  Search results page
│   ├── sidebar/         Navigation sidebar
│   ├── text-editor/     Text file editor
│   ├── toolbar/         Action toolbar
│   ├── upload-progress/ Upload tracking
│   └── upload-zone/     File drop zone
├── dialogs/             dialog components
│   ├── confirm-dialog, confirm-replace-dialog
│   ├── create-document-dialog, create-folder-dialog
│   ├── file-too-large-dialog, file-viewer-dialog
│   ├── folder-tree-dialog
│   ├── keyboard-shortcuts-dialog
│   ├── partial-upload-result-dialog
│   ├── rename-dialog, upload-dialog
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
| `settings.service` | App settings (bin interval, quotas, thumbnails, AI flags incl. `aiUserSettingsEnabled`) |
| `ai-chat.service` | AI chat panel state + SSE streaming (`/ai/chat`, conversations) |
| `ai-settings.service` | Per-user AI model settings — BYOK (`/settings/ai`, key is write-only) |
| `ai-maintenance.service` | AI maintenance jobs of the settings page — re-embed (`/ai/embeddings/backfill`) and re-enrich (`/ai/insights/backfill`) the documents; `enabled` = AI on + CONTRIBUTOR, `components/ai-maintenance/` polls the job |
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
- `swipe-tabs.directive` — `appSwipeTabs` on a `mat-tab-group`: swipe horizontally to move between tabs on touch screens (used by the metadata panel)

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

## PDF tools (merge / split / rotate / organize pages)

Core feature gated by the API flag `Settings.pdfToolsActive` (`openfilz.pdf-tools.active`) plus the
CONTRIBUTOR role — `services/pdf-tools-access.service.ts` is the single seam (same shape as
`signature-access.service.ts`). No `NG_APP_*` toggle. Everything lives in dedicated files so the
openfilz-web-ee fork only mirrors four descriptor entries:

- `models/pdf-tools.models.ts` (API contract of `/api/v1/pdf/**`), `services/pdf-tools.service.ts`
  (HttpClient client + `errorMessage()` mapping the API's `CODE: message` refusals to `pdfTools.errors.*`),
  `utils/pdf-page-ranges.ts` (client-side mirror of the page-selection grammar `1-3,7,10-`, odd/even/all).
- `components/pdf-page-grid/` — lazy, drag-sortable (CDK drag-drop, `mixed` orientation) page-thumbnail grid
  rendered with pdf.js; thumbnails render on intersection, two at a time, newest first, cached per
  (source, page, rotation, size). Owns selection (click / Shift / keyboard: Space, Delete, R, arrows); every
  structural change is emitted to the owning dialog. `cutMode` turns it into the split "scissors" strip.
- Dialogs (all lazy-imported from `FileOperationsComponent.openPdfTool()`, panelClass `pdf-tools-dialog-panel`,
  header / scrolling body / pinned footer, `dvh`-capped): `pdf-organizer-dialog` (undo/redo model, save as new
  version or new document, extract selection, signed-PDF acknowledgement), `pdf-merge-dialog`,
  `pdf-split-dialog` (five modes, live name preview), `pdf-rotate-dialog`.
- Surfaces: `PDF_TOOLS_SELECTION_ACTIONS` / `PDF_TOOLS_ITEM_ACTIONS` in `models/file-actions.ts`
  (`pdfOnly`-style gating via `pdfToolsAvailable` on the toolbar, `minSelection: 2` for merge), one
  `case` in toolbar / file-list / file-grid, `(pdfToolSelected)` + `(pdfTool)` bindings on file-explorer,
  favorites and search-results, and an "Edit pages" button in the PDF viewer.
- i18n block `pdfTools.*` in all 8 locales. Design doc: `openfilz-core/docs/pdf-tools.md`.

## Search (header box, filter panel, results page)

- **Header box** (`components/header/`): `/` or Ctrl/Cmd+K focuses it; ↑/↓/Enter/Esc drive the panel, whose
  first row always runs the full search, then the `/suggestions` quick matches. Empty box → recent searches
  (browser `localStorage` `openfilz.recentSearches`, helpers in `models/search-refine.ts`). The box mirrors
  `?q=` of `/search` and empties once the user leaves the results. Phones: focusing it turns the header into a
  full-screen search (back arrow, suggestions fill the screen). "All filters" on the results page opens the header's
  panel through `SearchService.requestAdvancedFilters()`.
- **Filter panel** (`components/search-filters/`): segmented scope / type, file-type chip grid, date chips, owner,
  kind / language facets, metadata rows. Desktop popover under the box; bottom sheet (own backdrop) on phones.
- **Results page** (`components/search-results/`): pages of 30 loaded as the user scrolls (IntersectionObserver
  sentinel + "Load more"), skeleton / empty / error states, title + count + time. `:host` is a bounded flex column —
  without it nothing scrolls inside `.main-content.file-explorer-view` (overflow hidden), the old phone bug.
  - Sort lives in the URL (`?sort=&order=`): *Best match* (`relevance` = no `sort` sent) by default for a text query,
    else name / modified / created / size — the only fields both back-ends sort on (`SEARCH_SORT_OPTIONS`; the
    OpenSearch index has no `type`, and `createdBy` is a plain keyword, so sorting on them fails the query).
  - `components/search-refine-bar/`: quick filter chips (type, file type, date, owner, document kind, language /
    metadata chips), "All filters", "Clear all", sort menu, list / grid toggle. It edits `SearchService` filters.
  - `components/search-result-list/`: the list view — highlighted name, type · size · relative date · owner, content
    snippet, category badge, hover actions (favorite, show in folder) + the standard item menu. Touch: tap opens,
    long press / menu "Select" picks. The grid view stays `app-file-grid`.
  - A full-text search sends only metadata / kind / language (`serverSideSearchFilters`); type, file type, date and
    owner are applied **in the browser** on the loaded hits (`matchesSearchRefinements`) — the OpenSearch generic
    filter clause cannot evaluate them (it appends `.keyword` to fields that are not mapped that way), so sending
    them emptied the results. Changing only those re-filters without a request; when they hide most hits, up to 6
    pages load automatically. Filter-only listings (`?scope=`) still filter server-side (`listAllFolder` +
    `countAllFolder` for the total).
- i18n: `searchResults.*` (incl. `refine.*`, `tips.*`, `sort.*`), `searchFilters.reset`, `header.*` search keys.

## Unzip (ZIP extraction)

Core feature, always on for CONTRIBUTORs (`services/unzip-access.service.ts`: role + `isZipItem`). The extraction runs
server-side (`POST /api/v1/files/{id}/unzip`, see `openfilz-core` CLAUDE.md §8): the browser never downloads the archive.
- `UNZIP_ACTION` + `isZipItem()` in `models/file-actions.ts` (per-item menu via `STANDARD_ITEM_ACTIONS`, toolbar via
  `unzipAvailable` / `(unzipSelected)`), `(unzip)` output on file-list / file-grid, bindings on file-explorer,
  search-results and favorites.
- `FileOperationsComponent.onUnzipItem` opens `dialogs/unzip-dialog` (destination: current folder / new folder / any
  writable folder via `FolderTreeDialogComponent`) — the dialog runs the call itself so errors (409 folder exists, 413
  limits, 507 quota…) stay inline — then shows the summary snackbar and `reloadData()`. The protected
  `unzipCurrentFolder()` hook labels the "current folder" option (file explorer only; `writable: false` disables it).
- i18n: `toolbar.unzip`, `dialogs.unzip.*`, `operations.unzipSuccess` / `unzipPartial` in all 8 locales.
- `mat-radio-button` colours come from the `.mat-mdc-radio-button` token block in `global_styles.css` (the M3
  `--mat-sys-*` colours are empty in every theme — same fix as the checkbox / slide-toggle blocks).

## Workflows (statuses / transitions / tasks)

Core feature gated by the API flag `Settings.workflowsActive` (`openfilz.workflows.active`) —
`services/workflow-access.service.ts` is the single seam (`enabled` = flag; `canStart` = + CONTRIBUTOR;
`canDesign` = + `WORKFLOW_DESIGNER` when `Settings.workflowDesignerRoleRequired`). Same file discipline
as e-Sign / PDF tools so the enterprise fork only mirrors the descriptor + route + host bindings:

- `models/workflow.models.ts` (API contract of `/api/v1/workflows/**`), `services/workflow.service.ts`
  (HttpClient client + `errorKey()`/`serverMessage()` + the `myTasksCount$` badge counter refreshed after
  every action and on a 60 s poll from the sidebar), `utils/workflow-spec.ts` (client mirror of the API
  `WorkflowSpecValidator` — same codes and paths; the starter templates; `layoutSpec()` = layered
  left-to-right layout of the diagram; `slugify`/`uniqueKey` for status keys), `guards/workflows.guard.ts`.
- **Parallel review** (a status with `review {rule ALL|FIRST_REJECTION|QUORUM, quorum, approveTransition}` — one task per
  reviewer, see core `docs/workflows.md` §3): `components/workflow-review-progress/` (votes + comments + pending, used by My
  tasks, the monitor drawer and the details panel), the editor's review section, the `parallel-review` template.
  `components/workflow-template-picker/` = the template cards (empty state + `dialogs/workflow-template-dialog`, the
  "New workflow" button), each with a mini flow preview built from `templateSpec()`. `utils/workflow-spec.spec.ts` pins
  every template (valid + structure, mirrored by core `WorkflowTemplatesIT`) — no test runner is configured, run it with
  `npx vitest run src/app/utils/workflow-spec.spec.ts --globals`.
- `components/workflow-diagram/` — pure SVG picture of a spec (current status highlighted, taken
  transitions bold, `stateClick` for the designer).
- `pages/workflows/` — `workflows.component` (tabs, `?tab=tasks|monitor|designer`, `?task=`, `?instance=`),
  `my-tasks/` (one card per task, transition buttons on the card, decision dialog when a comment is
  required), `monitor/` (tiles, filters, table, side drawer with diagram + timeline + reassign / cancel),
  `designer/workflow-designer.component` (definition cards + template menu) and
  `designer/workflow-editor.component` (route `/workflows/definitions/new?template=…` and `/:id`; one
  card per status, live diagram, inline problems; folders picked with `FolderTreeDialogComponent`).
- Dialogs: `dialogs/start-workflow-dialog` (definition cards + diagram, "chosen at start" people,
  *Start* / *Start & <first transition>*), `dialogs/workflow-decision-dialog` (comment / reassign prompt).
- Details panel: `components/metadata-panel/document-workflow/` hosted by one line in the panel
  (running instance, who it waits for, my transition buttons, or "Start a workflow").
- Surfaces: `START_WORKFLOW_ACTION` in `models/file-actions.ts` (files only), `onStartWorkflow` /
  `canStartWorkflowForSelection` in `FileOperationsComponent`, `startWorkflowAvailable` /
  `(startWorkflowSelected)` on the toolbar, `(startWorkflow)` on file-list / file-grid, the sidebar entry
  `workflows` with its badge (count, red when overdue).
- i18n block `workflow.*` + `sidebar.workflows` + `toolbar.startWorkflow` in all 8 locales. Design doc:
  `openfilz-core/docs/workflows.md`.

## Text editor on touch devices

Monaco has no drag-to-select with a finger: `PointerEventHandler._onMouseDown` bails out when
`pointerType === 'touch'` and its gesture recognizer turns a finger drag into a scroll, so the only
selection a phone can make natively is a double-tap on a single word.
`components/text-editor/monaco-touch-selection.ts` (no Angular dependency, so `openfilz-web-ee` can
take it as-is) adds **long press → select word → drag to extend** on top of the editor DOM node,
with auto-scroll near the top/bottom edges. Monaco's recognizer listens on `document` in the bubble
phase, so capture-phase listeners on the editor node + `stopPropagation()` keep it from scrolling
mid-selection; a plain drag is left alone so scrolling still works. `TextEditorComponent` wires it
up only when `TouchDetectionService.isTouchDevice()`, outside the Angular zone, and shows a floating
copy / cut / paste / select-all bar (`textEditor.*` i18n block) whenever the selection is non-empty —
a phone has no Ctrl+C.
