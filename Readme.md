# OpenFilz Web UI

The official open-source web application for [OpenFilz](https://github.com/openfilz/openfilz-core), providing a modern, Google Drive-like interface for document management. Built with **Angular 21** and **Angular Material**, it connects to the OpenFilz API via REST and GraphQL.

---

## Features

### Document Management

- **File Explorer** - Browse folders in grid or list view with sorting, pagination, and breadcrumb navigation.
- **Drag & Drop Upload** - Drag files directly into the browser to upload. Supports multiple files with progress tracking.
- **Resumable Uploads (TUS)** - Large file uploads resume automatically after interruption using the TUS protocol.
- **ZIP Downloads** - Download entire folders or multiple selected files as a single ZIP archive.
- **Bulk Operations** - Move, copy, rename, and delete multiple files/folders with a single action.
- **Create Documents** - Create new blank documents directly in the app.
- **File Replace** - Upload a new version of an existing document.

### Document Viewing & Editing

- **PDF Viewer** - Built-in PDF rendering with zoom, search, and page navigation (PDF.js).
- **Office Document Viewer** - View Word documents (Mammoth) and Excel spreadsheets (XLSX) directly in the browser.
- **Code Editor** - Edit text files, SQL scripts, and source code with the Monaco editor (VS Code engine). Syntax highlighting for 50+ languages.
- **OnlyOffice Integration** - Open and edit .docx, .xlsx, .pptx files in the browser with full editing capabilities.
- **Image Preview** - View images directly in the file viewer dialog.

### Organization

- **Virtual Folders** - Hierarchical folder structure with nested navigation.
- **Favorites** - Star documents and folders for quick access from a dedicated favorites page.
- **Recycle Bin** - Recover accidentally deleted files. Soft-delete with restore and permanent purge options.
- **Search & Filters** - Search by name, type, date range, and metadata. Advanced filter UI with real-time results.

### Metadata Management

- **Metadata Editor** - Reusable key-value pair editor with real-time validation (unique keys, alphanumeric format).
- **Metadata Panel** - Right-side sliding panel (420px) showing document properties and custom metadata. Auto-opens for single file uploads.
- **Document Properties** - Tabbed dialog with general info and metadata tabs. View and edit modes with unsaved changes detection.

### Dashboard & Statistics

- **Dashboard** - Home page showing storage usage, document counts, file type distribution, and recent activity.
- **Auto-Refresh** - Dashboard updates automatically on navigation.

### Accessibility (WCAG 2.1 AA)

- **Full Keyboard Navigation** - All features accessible via keyboard with visible focus indicators.
- **20+ Keyboard Shortcuts** - `?` (help), `Ctrl+U` (upload), `Ctrl+N` (new folder), `Ctrl+D` (download), `F2` (rename), `Delete`, `Ctrl+A`, arrow keys, and more.
- **Screen Reader Support** - ARIA labels, landmarks, and live regions for NVDA, JAWS, VoiceOver, and TalkBack.
- **High Contrast Mode** - Windows High Contrast Mode support.
- **Reduced Motion** - Respects `prefers-reduced-motion` media query.
- **Touch Targets** - Minimum 44x44px touch targets throughout.

### Mobile Optimization

- **Responsive Design** - Optimized layouts for desktop (>768px), tablet, and phone (<480px).
- **Floating Action Button (FAB)** - Bottom-right FAB with speed dial for Upload and New Folder on mobile.
- **Bottom Sheet Menus** - Material Design bottom sheet for file actions on mobile with categorized sections (Organize, Share & Download, Danger Zone).
- **Space Efficiency** - 42% reduction in UI chrome on mobile (82px saved). Content area increased from 65% to 80%.
- **Touch-Friendly** - 56px action rows, optimized toolbar, and integrated breadcrumb/pagination.

### Authentication & Security

- **OpenID Connect** - Full OIDC integration via `angular-auth-oidc-client`.
- **Role-Based Access** - UI adapts to user roles (READER, CONTRIBUTOR, CLEANER, AUDITOR).
- **JWT Token Management** - Automatic token refresh and secure API calls.

### Internationalization

- **Multi-Language** - Full i18n support via `@ngx-translate`. All UI text is translatable.

---

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Angular | 21.0.6 |
| UI Library | Angular Material + CDK | 21.0.5 |
| GraphQL | Apollo Angular + @apollo/client | 13.0.0 / 4.0.11 |
| PDF Viewer | pdfjs-dist | 4.10.38 |
| Code Editor | Monaco Editor | 0.55.1 |
| Word Viewer | Mammoth | 1.11.0 |
| Excel Viewer | SheetJS (XLSX) | 0.20.3 |
| Resumable Upload | tus-js-client | 4.2.3 |
| Authentication | angular-auth-oidc-client | 20.0.3 |
| i18n | @ngx-translate/core | 17.0.0 |
| File Download | file-saver | 2.0.5 |
| Syntax Highlighting | highlight.js | 11.11.1 |
| Build | Angular CLI | 21.0.4 |
| Language | TypeScript | 5.9.3 |

---

## Application Structure

### Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/dashboard` | DashboardComponent | Home page with statistics |
| `/my-folder` | FileExplorerComponent | Main file browser |
| `/search` | SearchResultsComponent | Search results |
| `/favorites` | FavoritesComponent | Starred documents |
| `/recycle-bin` | RecycleBinComponent | Deleted items recovery |
| `/settings` | SettingsComponent | User preferences |

### Components (20)

`base`, `breadcrumb`, `dashboard`, `download-progress`, `download-snackbar`, `file-explorer`, `file-grid`, `file-list`, `header`, `metadata-editor`, `metadata-panel`, `onlyoffice-editor`, `search-filters`, `search-results`, `sidebar`, `text-editor`, `toolbar`, `upload-progress`, `upload-zone`, `wip`

### Dialogs (12)

`confirm-dialog`, `confirm-replace-dialog`, `create-document-dialog`, `create-folder-dialog`, `document-properties-dialog`, `file-viewer-dialog`, `folder-tree-dialog`, `keyboard-shortcuts-dialog`, `partial-upload-result-dialog`, `rename-dialog`, `settings-dialog`, `upload-dialog`

### Services (14)

`breadcrumb`, `document-api`, `drag-drop`, `file-icon`, `keyboard-shortcuts`, `mock-auth`, `onlyoffice`, `resumable-upload`, `role`, `search`, `settings`, `theme`, `touch-detection`, `user-preferences`

---

## Development

### Prerequisites

- Node.js 24.10+
- npm

### Commands

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:4200)
npm start

# Production build
npm run build

# Lint
npm run lint

# Type check
npm run type-check
```

### Docker

```bash
# Build Docker image
docker build -t ghcr.io/openfilz/openfilz-web:latest .

# Pull latest image
docker pull ghcr.io/openfilz/openfilz-web:latest
```

The Docker image uses `nginx-unprivileged:alpine-perl` to serve the Angular build artifacts.

---

## Documentation

- [ACCESSIBILITY.md](ACCESSIBILITY.md) - WCAG 2.1 AA compliance guide, keyboard shortcuts, and screen reader support.
- [METADATA_FEATURES.md](METADATA_FEATURES.md) - Visual guide to metadata management UX.
- [METADATA_IMPLEMENTATION.md](METADATA_IMPLEMENTATION.md) - Technical implementation details and API integration.
- [METADATA_PANEL_REDESIGN.md](METADATA_PANEL_REDESIGN.md) - Metadata panel design decisions.
- [MOBILE_LAYOUT_OPTIMIZATION.md](MOBILE_LAYOUT_OPTIMIZATION.md) - Mobile space efficiency improvements.
- [MOBILE_SELECTION_TOOLBAR_REDESIGN.md](MOBILE_SELECTION_TOOLBAR_REDESIGN.md) - Bottom sheet pattern for mobile actions.
- [MOBILE_TOOLBAR_REDESIGN.md](MOBILE_TOOLBAR_REDESIGN.md) - FAB implementation guide.

---

## License

Apache License 2.0
