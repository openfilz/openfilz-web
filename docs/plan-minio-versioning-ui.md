# Implementation Plan — MinIO File Versioning UI (audit-trail driven)

> **Status:** Plan only — no production code written.
> **Scope:** openfilz-core (openfilz-api) + openfilz-web, with EE propagation notes.
> **Feature flag:** backend `STORAGE_MINIO_VERSIONING_ENABLED` (exists, relaxed-bound to `storage.minio.versioning-enabled`) · frontend `NG_APP_STORAGE_MINIO_VERSIONING_ENABLED` (new).

---

## 1. Goal & Current State

When MinIO bucket versioning is enabled, users must be able to **View / Download / Restore** previous versions of a file directly from the audit-trail panel. Restore must **not** delete intermediate history: it produces a *new* latest version plus a new audit entry referencing the restored version.

### What already exists (verified in code)

**Backend** (`openfilz-core/openfilz-api`):

| Capability | Where | Notes |
|---|---|---|
| Bucket versioning enable | `MinioStorageService.ensureBucketExists()` (~line 73) | `SetBucketVersioningArgs` when `MinioProperties.versioningEnabled` |
| Versioned replace | `MinioStorageService.replaceFile()` (lines 100–107) | Overwrites same object; MinIO keeps prior versions; storage path unchanged |
| List versions primitive | `MinioChecksumService.getPreviousVersionId()` (lines 95–116) | `ListObjectsArgs.builder().prefix(...).includeVersions(true)` |
| Get by versionId primitive | `MinioChecksumService` (lines 118–134) | `GetObjectArgs.builder().versionId(...)` |
| Revert primitive | `MinioStorageService.deleteLatestVersion()` (lines 471–496) | Deletes latest version → **history-destroying, do NOT reuse for Restore** |
| Audit trail API | `AuditController` — `GET /api/v1/audit/{id}?sort=` | Returns `Flux<AuditLog>`; `details` is polymorphic JSONB |
| Audit on replace | `SaveDocumentServiceImpl` (~line 185) | Logs `REPLACE_DOCUMENT_CONTENT` with `ReplaceAudit(filename)` only |
| Runtime-switch pattern | `StorageConfig.java` | `@Primary` factory + `@Lazy` providers (native-image safe) |
| IT harness | `MinioChecksumVersioningIT` | Testcontainers `MinIOContainer` with `storage.minio.versioning-enabled=true` |

**Frontend** (`openfilz-web`):

| Capability | Where |
|---|---|
| Runtime env mechanism | `angular.json` `ngxEnv: { prefix: "NG_APP_", runtime: true }` + `docker-entrypoint.d/25-openfilz-ngx-env.sh` regenerates `/ngx-env.js` from **all** `NG_APP_*` vars at container start; nginx serves it no-cache |
| Boolean flag pattern | `environment.ts`: `import.meta.env['NG_APP_ONLYOFFICE_ENABLED'] === 'true'`; service accessor `isOnlyOfficeEnabled()` |
| Audit UI | `metadata-panel.component.{ts,html}` — 3rd tab, timeline of `AuditLog` entries, icon/color helpers |
| Audit model | `models/document.models.ts` → `AuditLog { id, timestamp, username, action, resourceType, details? }` |
| Viewer | `file-viewer-dialog.component.ts` — `FileViewerDialogData { documentId, fileName, contentType, fileSize? }`, `determineViewerMode()` → `pdf/image/text/office/onlyoffice/unsupported`, loads via `documentApi.downloadDocument()` |
| Download | `document-api.service.ts` `downloadDocument(id): Observable<Blob>` + `file-saver` `saveAs(blob, name)` |

### Gaps (what this feature must add)

1. ✗ `putObject()` response `versionId` is never captured (`MinioStorageService.uploadToObject()` discards `ObjectWriteResponse`).
2. ✗ No audit detail carries a versionId (`UploadAudit` / `ReplaceAudit` have no field for it).
3. ✗ No REST endpoints to list versions, download a specific version, or restore one.
4. ✗ No `StorageService` interface methods for version operations (only the checksum-internal primitives).
5. ✗ No `RESTORE_DOCUMENT_VERSION` audit action.
6. ✗ Frontend has no flag, no version service, no per-entry actions in the audit tab.
7. ✗ `STORAGE_MINIO_VERSIONING_ENABLED` is not declared in any compose file / `.env.example` (it currently only works via Spring relaxed binding if someone exports it manually).

---

## 2. Env-Var Wiring

### 2.1 Frontend — `NG_APP_STORAGE_MINIO_VERSIONING_ENABLED`

The runtime mechanism needs **no change**: `25-openfilz-ngx-env.sh` already emits every `NG_APP_*` var into `ngx-env.js`. Only declaration/consumption work:

| File | Change |
|---|---|
| `openfilz-web/src/env.d.ts` | Add `readonly NG_APP_STORAGE_MINIO_VERSIONING_ENABLED: string;` to `Env` |
| `openfilz-web/src/environments/environment.ts` | Add block: `versioning: { enabled: import.meta.env['NG_APP_STORAGE_MINIO_VERSIONING_ENABLED'] === 'true' }` |
| `openfilz-web/src/environments/environment.local-dev.ts` | Same block (dev default may hardcode or read the var the same way — follow whatever the file does for `onlyOffice`) |
| `openfilz-web/.env` | `NG_APP_STORAGE_MINIO_VERSIONING_ENABLED="false"` (local dev default; set `"true"` when developing against a versioned MinIO) |
| `openfilz-web/Dockerfile` / entrypoint / nginx | **No change** |

Boolean parsing follows the existing `=== 'true'` convention (env values are strings).

### 2.2 Backend — `STORAGE_MINIO_VERSIONING_ENABLED`

No new property needed (`storage.minio.versioning-enabled` exists, default `false` in `application.yml:51`, `true` in `application-dev.yml`). Work is **deployment wiring + docs**:

| File | Change |
|---|---|
| `openfilz-core/deploy/docker-compose/docker-compose.yml` | API service env: `STORAGE_MINIO_VERSIONING_ENABLED: ${STORAGE_MINIO_VERSIONING_ENABLED:-false}`; web service env: `NG_APP_STORAGE_MINIO_VERSIONING_ENABLED: ${NG_APP_STORAGE_MINIO_VERSIONING_ENABLED:-false}` |
| `openfilz-core/deploy/docker-compose/.env.example` | Both vars, documented together ("must be set in tandem; frontend flag without backend flag yields 409s") |
| `openfilz-core/deploy/docker-compose/dokploy/compose.yaml` | Same pair |
| `openfilz-core/docs/admin-guide.md` + `deploy/docker-compose/README.md` | Env-var tables: add both rows |

### 2.3 Enterprise propagation (follow-up after core lands)

- `openfilz-enterprise/core` is a **git submodule** → backend + compose changes arrive via submodule bump. (Per repo rules, core source edits during EE development happen under `openfilz-enterprise/core/`.)
- `openfilz-enterprise/docker/dokploy-compose-ee.yml` — add both env vars to `openfilz-api-ee` / `openfilz-web-ee` services.
- `openfilz-enterprise/modules/license-management-api/src/main/resources/templates/ngx-env.template.js` — add `"NG_APP_STORAGE_MINIO_VERSIONING_ENABLED": "${NG_APP_STORAGE_MINIO_VERSIONING_ENABLED}"`, plus the expectations in `ZipPackagingServiceTest` (3 assertion sites) and `docker/generate-demo.sh`.
- `openfilz-web-ee` picks up the UI via the normal upstream merge from `openfilz-web` (see §4.6).

---

## 3. Backend Design (openfilz-core / openfilz-api)

### 3.1 New REST endpoints (REST, not GraphQL — audit is REST-only today; mutations are REST by convention)

All under `DocumentVersionController` (**new file**, keeps `DocumentController` untouched):

```
GET  /api/v1/documents/{documentId}/versions
     → Flux<DocumentVersionInfo>
     DocumentVersionInfo = record(String versionId, OffsetDateTime lastModified,
                                  Long size, boolean isLatest)

GET  /api/v1/documents/{documentId}/versions/{versionId}/download
     → ResponseEntity<Resource>  (same headers as the existing download:
       Content-Disposition attachment + stored contentType)

POST /api/v1/documents/{documentId}/versions/{versionId}/restore
     → Mono<RestoreVersionResponse>
     RestoreVersionResponse = record(UUID documentId, String restoredFromVersionId,
                                     OffsetDateTime restoredFromDate, String newVersionId)
```

Error behavior when versioning is unavailable (flag off **or** `storage.type != minio`): **HTTP 409** with a stable error code (`VERSIONING_DISABLED`) via a new `VersioningDisabledException` → existing exception-handler chain. (409 chosen over 404 so the frontend can distinguish "feature off" from "version not found"; a 404 remains the answer for an unknown documentId/versionId.)

**Security:** `AbstractSecurityService` maps by HTTP method on `/documents/**` paths — GET → `READER`/`CONTRIBUTOR`, POST → `CONTRIBUTOR` — so list/download/restore inherit sensible roles with **no security change**. Verify in IT (see §6). WORM mode already rejects writes, so restore is blocked there by construction.

### 3.2 `StorageService` interface additions

Default implementations so `FileSystemStorageService` needs no edits:

```java
default Flux<FileVersionInfo> listFileVersions(String storagePath) { return Flux.empty(); }
default Mono<Resource> loadFileVersion(String storagePath, String versionId) { return Mono.error(new VersioningDisabledException()); }
/** Server-side copy of the given version on top of the object → new latest version. Returns the NEW versionId. */
default Mono<String> restoreFileVersion(String storagePath, String versionId) { return Mono.error(new VersioningDisabledException()); }
```

`MinioStorageService` implementations (all on `Schedulers.boundedElastic()` per existing convention):

- `listFileVersions` — `ListObjectsArgs.builder().prefix(storagePath).includeVersions(true)`; filter `item.objectName().equals(storagePath)` (prefix-listing can over-match), **skip delete markers**, map to `FileVersionInfo(versionId, lastModified, size, isLatest)`. Same pattern as `MinioChecksumService.getPreviousVersionId()`.
- `loadFileVersion` — `GetObjectArgs.builder().object(storagePath).versionId(versionId)` → `InputStreamResource`, mirroring `loadFile()` (lines 173–189).
- `restoreFileVersion` — `CopyObjectArgs` with `CopySource.builder().bucket(...).object(storagePath).versionId(versionId)` onto the **same** object key. This is the history-preserving restore: MinIO creates a new latest version; nothing is deleted. Capture and return `ObjectWriteResponse.versionId()` of the copy. **Do not use `deleteLatestVersion()`** — it erases history.
  - *Limitation to document:* single-op server-side copy caps at 5 GiB (S3 semantics). Acceptable v1 constraint; note in Javadoc + admin guide. (Fallback for >5 GiB — compose/multipart copy — is out of scope.)

### 3.3 Capturing the versionId on every write

`MinioStorageService.uploadToObject()` (lines 147–160) calls `minioClient.putObject(args)` and discards the response. Change it to capture `ObjectWriteResponse.versionId()` (null when versioning is off — harmless).

Plumbing the id out without breaking the `Mono<String>` storage contract everywhere: keep `saveFile`/`replaceFile` signatures, and add a narrow seam —

```java
/** versionId of the object's latest version, or empty when unsupported/disabled. */
default Mono<String> getLatestVersionId(String storagePath) { return Mono.empty(); }
```

implemented in MinIO via `StatObjectArgs` → `StatObjectResponse.versionId()` (the exact pattern already used by `deleteLatestVersion()`). `SaveDocumentServiceImpl` calls it right after `replaceFile`/`saveFile` succeeds, only when versioning is active (cheap stat; skipped otherwise).

> Alternative considered: change `replaceFile` to return a `StoredObject(storagePath, versionId)` record. Cleaner long-term but touches every `StorageService` implementer (incl. thumbnails/TUS) and the EE submodule surface — the stat-based seam is the low-blast-radius choice for v1; the record refactor can follow.

### 3.4 Audit-trail changes

**No DB migration** — `audit_logs.details` is JSONB.

1. **`ReplaceAudit`** — add optional `String versionId` (the **new** version created by the replace), `@JsonInclude(NON_NULL)`.
2. **`UploadAudit`** — add optional `String versionId` likewise (the initial version), so the very first audit entry is also actionable.
3. **New `AuditAction.RESTORE_DOCUMENT_VERSION`** + new details subtype:

```java
// type discriminator: "restoreVersion"
public class RestoreVersionAudit extends AuditLogDetails {
    private String filename;
    private String restoredFromVersionId;     // the version that was restored
    private OffsetDateTime restoredFromDate;  // its lastModified — human-readable reference
    private String versionId;                 // the NEW version created by the restore
}
```

`versionId` is deliberately the same field name across `UploadAudit`/`ReplaceAudit`/`RestoreVersionAudit` so the frontend can treat "entry that created version X" uniformly.

4. Restore flow logs `RESTORE_DOCUMENT_VERSION` through the existing `auditService.logAction(...)`, attributed to the authenticated principal (per repo rule: actor from security context, never a string override).

**Jackson/native:** new fields on already-registered polymorphic DTOs are fine; the new `RestoreVersionAudit` subtype must be registered wherever the other `AuditLogDetails` subtypes are (the `@JsonSubTypes` list on `AuditLogDetails`) and — if audit DTOs appear in `reflect-config.json` — added there too.

### 3.5 Service layer & feature toggle (native-image safe)

New `DocumentVersionService` interface + two impls, following the **`@Lazy @Qualifier` + factory `@Configuration`** pattern (per the `native-safe-feature-toggle` skill — **never** `@ConditionalOnProperty`/`@Profile`, which are evaluated at AOT build time in native images):

```java
public interface DocumentVersionService {
    Flux<DocumentVersionInfo> listVersions(UUID documentId);
    Mono<DownloadableVersion> downloadVersion(UUID documentId, String versionId);
    Mono<RestoreVersionResponse> restoreVersion(UUID documentId, String versionId);
}

@Service @Lazy @Qualifier("versioningEnabled")
class DocumentVersionServiceImpl implements DocumentVersionService { ... }

@Service @Lazy @Qualifier("versioningDisabled")
class NoOpDocumentVersionService implements DocumentVersionService {
    // every method: Mono/Flux.error(new VersioningDisabledException())
}

@Configuration
class DocumentVersionConfig {
    @Bean @Primary
    DocumentVersionService documentVersionService(
            @Value("${storage.type:local}") String storageType,
            @Value("${storage.minio.versioning-enabled:false}") boolean versioningEnabled,
            @Lazy @Qualifier("versioningEnabled") DocumentVersionService enabled,
            @Lazy @Qualifier("versioningDisabled") DocumentVersionService disabled) {
        return ("minio".equals(storageType) && versioningEnabled) ? enabled : disabled;
    }
}
```

The effective toggle is `storage.type == minio && versioning-enabled` — guards against a frontend flag set without MinIO.

`DocumentVersionServiceImpl` responsibilities:
- Resolve document via `DocumentDAO.findById(documentId, AccessType...)` (`R` for list/download, `RWD` for restore — mirrors `replaceDocumentContent`), reject folders (`type == FILE` filter, as in `DocumentServiceImpl.replaceDocumentContent` lines 671–688).
- Delegate to the new `StorageService` version methods.
- On restore: copy-restore → stat new size → `document.setSize(...)` + `documentDAO.update(...)` → recompute checksum if `openfilz.calculate-checksum` enabled (reuse `ChecksumService` seam) → audit log → response. Content-type/name are unchanged by design (versions of the same logical document).
- **Restoring the latest version**: allow but short-circuit (no copy, no audit) or reject with 400 — *decision: reject with 400 `CANNOT_RESTORE_LATEST`*, simpler to reason about and test.
- Soft-deleted documents: `findById` already excludes them in normal flows — restore on a trashed doc returns 404 (consistent with replace-content).

### 3.6 Native-image checklist

- `CopySource` / `CopyObjectArgs` are already used by `copyFile()`; `ListObjectsArgs`, `GetObjectArgs`, `StatObjectArgs` are used by checksum/storage code — verify all appear in `native-image-config/.../reflect-config.json` (MinIO `BaseArgs.Builder.build()` instantiates via reflection). Add any missing entries (likely `CopySource` with versionId path is the only risk).
- New DTOs (`DocumentVersionInfo`, `RestoreVersionResponse`, `RestoreVersionAudit`) → register for Jackson if the project registers DTOs explicitly (check how existing audit DTOs are handled; Spring AOT usually infers controller-bound types, but the polymorphic `AuditLogDetails` subtype registration is mandatory regardless).
- Smoke-test the native image with the flag on and off (both impls compiled in; `@Lazy` keeps the unused one un-initialized).

---

## 4. Frontend Design (openfilz-web)

Fork-friendliness rule: prefer **new dedicated files**; keep edits to shared files (metadata-panel, file-viewer-dialog, models) small and additive so `openfilz-web-ee` merges cleanly.

### 4.1 New `DocumentVersionsService` — `src/app/services/document-versions.service.ts` (new file)

```ts
@Injectable({ providedIn: 'root' })
export class DocumentVersionsService {
  isVersioningEnabled(): boolean {
    return (environment as any).versioning?.enabled ?? false;
  }
  listVersions(documentId: string): Observable<DocumentVersionInfo[]>;        // GET  .../documents/{id}/versions
  downloadVersion(documentId: string, versionId: string): Observable<Blob>;   // GET  .../versions/{versionId}/download  (responseType: 'blob')
  restoreVersion(documentId: string, versionId: string): Observable<RestoreVersionResponse>; // POST .../versions/{versionId}/restore
}
```

Deliberately **not** added to `document-api.service.ts` (keeps the core service diff-free for the EE fork). Base URL from `environment.apiURL` like other services.

### 4.2 Models — `src/app/models/document.models.ts` (small additive edit)

- Extend `AuditAction` union with `'RESTORE_DOCUMENT_VERSION'`.
- `AuditLogDetails` already has an index signature (`[key: string]: any`) → `details.versionId`, `details.restoredFromVersionId`, `details.restoredFromDate` need no interface change, but add a typed `DocumentVersionInfo` + `RestoreVersionResponse` interface (could live in a new `document-versions.models.ts` to minimize the shared-file diff — *chosen approach*).

### 4.3 Audit tab — per-entry version actions

**New child component** `src/app/components/metadata-panel/audit-version-actions/audit-version-actions.component.ts` (new folder/file, standalone). The metadata-panel template gets a ~5-line addition inside the existing `@for(log of auditLogs...)` entry:

```html
@if (versioningEnabled && isVersionEntry(log)) {
  <app-audit-version-actions
      [documentId]="documentId!"
      [auditLog]="log"
      [fileName]="documentName"
      [contentType]="documentContentType"
      [versions]="versions"
      (restored)="onVersionRestored()"/>
}
```

Component behavior:
- Renders a compact `mat-icon-button` row (or a single `more_vert` → `mat-menu` on narrow widths — reuse the panel's existing responsive conventions): **View** (`visibility`), **Download** (`download`), **Restore** (`restore`).
- **View** shown only when the type is previewable (§4.4) and the resolved version exists; **Restore** hidden on the entry that *is* the current latest version and hidden for users without `CONTRIBUTOR` (reuse `RoleService.hasRole('CONTRIBUTOR')`, same check as `file-viewer-dialog.canEditDocument`).
- Entire component renders nothing when the flag is off (belt) in addition to the parent `@if` (suspenders).

**Which entries get actions** — `isVersionEntry(log)`: `action ∈ { UPLOAD_DOCUMENT, REPLACE_DOCUMENT_CONTENT, RESTORE_DOCUMENT_VERSION }` **and** `resourceType === 'FILE'`.

**Mapping an audit entry to a MinIO versionId:**
1. **Primary (exact):** `log.details.versionId` — present on all entries written after this feature ships (§3.4).
2. **Fallback (legacy entries):** metadata-panel loads `versions = listVersions(documentId)` once alongside the audit trail (only when flag on); sort surviving versions by `lastModified` ascending and version-creating audit entries by `timestamp` ascending, then pair index-wise. This is best-effort: entries from before versioning was enabled, or versions pruned by lifecycle rules, can break alignment — when counts don't pair up cleanly, **suppress actions on unmatched legacy entries** rather than guessing. (Stated as an accepted v1 limitation; exactness is guaranteed going forward by the stored versionId.)

`onVersionRestored()` → reload the audit trail **and** the versions list, plus a translated snackbar, and emit an output so the file-explorer can refresh the item row (size may change).

### 4.4 View (preview a version)

Reuse `file-viewer-dialog` with two small additive changes:

- `FileViewerDialogData` gains optional fields: `versionId?: string; versionLabel?: string;` (label e.g. the formatted version date shown in the dialog title).
- `loadDocument()` uses `documentVersionsService.downloadVersion(...)` when `versionId` is set; otherwise unchanged.
- `determineViewerMode()`: when `versionId` is set, **skip the OnlyOffice branch** (OnlyOffice edits the live document — wrong for an immutable historical version) and fall through to pdf/image/text/office; the dialog's save/edit affordances are hidden in version mode (`canEditDocument && !data.versionId`).
- "Is viewable" check for showing the View button without opening the dialog: extract the pure mime/extension logic of `determineViewerMode()` into a small exported helper (new file `src/app/utils/viewer-mode.util.ts`, used by both the dialog and `audit-version-actions`) — avoids duplicating the regex lists. The viewer needs `fileName`/`contentType`: metadata-panel already has the document's info; versions share the current document's contentType by design (§3.5).

### 4.5 Download (a version)

`audit-version-actions` → `downloadVersion(...).subscribe(blob => saveAs(blob, fileName))` — identical pattern to `file-viewer-dialog.download()` (file-saver). Suggested filename: `name` stem + version timestamp suffix, e.g. `report (2026-06-01 14:32).pdf`, so multiple downloaded versions don't collide.

### 4.6 Restore UX

- Click Restore → existing `confirm-dialog` with translated body: *"Replace the current version with the version from {date}? The current version is kept in history."*
- On confirm → `restoreVersion(...)`; success snackbar; reload audit + versions (the new `RESTORE_DOCUMENT_VERSION` entry appears at the top, showing the restored-from date via `details.restoredFromDate`).
- Audit rendering for the new action in the metadata-panel maps: icon `settings_backup_restore`, color `success` (the existing `getAuditActionColor` already returns success for `RESTORE`-containing actions; add the icon to `getAuditActionIcon`).

### 4.7 Flag-gating summary (requirement 3: everything hidden when flag false)

- `metadata-panel`: `versioningEnabled = inject(DocumentVersionsService).isVersioningEnabled()` — the `@if` around `app-audit-version-actions` plus skipping the `listVersions` call entirely.
- No other UI surface exists for v1 (no toolbar/menu entries), so this single gate + the component-internal guard covers it.
- Optional hardening (Phase 2): expose effective versioning state in `GET /api/v1/settings` and AND it with the env flag, eliminating misconfiguration drift; not required for v1 since a mismatch only yields 409s with a clear error code.

### 4.8 i18n

Add to **all 8** locale files `src/i18n/{en,fr,de,es,it,nl,pt,ar}.json`:

```json
"audit": { "actions": { "RESTORE_DOCUMENT_VERSION": "Version Restored" } },
"versions": {
  "view": "View this version",
  "download": "Download this version",
  "restore": "Restore this version",
  "restoreConfirmTitle": "Restore version",
  "restoreConfirmMessage": "Replace the current version with the version from {{date}}? The current version will be kept in the history.",
  "restoreSuccess": "Version restored",
  "restoreError": "Failed to restore version",
  "current": "Current version",
  "restoredFrom": "Restored from version of {{date}}"
}
```

### 4.9 EE fork (`openfilz-web-ee`)

All work happens upstream in `openfilz-web`; the EE fork takes it via the normal merge. New files (`document-versions.service.ts`, `audit-version-actions/`, `viewer-mode.util.ts`, `document-versions.models.ts`) merge trivially; the only conflict-prone surfaces are the small additive edits to `metadata-panel.component.{ts,html}`, `file-viewer-dialog.component.ts`, `env.d.ts`, `environment.ts`, and the i18n files — all kept minimal by design.

---

## 5. Restore Semantics & Audit Entry Design (decision record)

- **Mechanism:** server-side `CopyObject(CopySource{object, versionId})` onto the same key → MinIO creates a **new latest version**. All intermediate versions remain. (Explicitly *not* `deleteLatestVersion()` roll-back, which destroys history and only steps back one version.)
- **Audit entry:** new action `RESTORE_DOCUMENT_VERSION`, details `RestoreVersionAudit{ filename, restoredFromVersionId, restoredFromDate, versionId }` — satisfies "references the date of the restored version *and* its MinIO version id", and makes the restore entry itself actionable (it carries the new `versionId`).
- **Timeline example:** v1 upload → v2 replace → v3 replace → restore v1 ⇒ v4 (content of v1); history v1…v4 intact; audit shows UPLOAD, REPLACE, REPLACE, RESTORE_DOCUMENT_VERSION(restoredFrom=v1).
- **DB side-effects of restore:** `documents.size` updated to the restored version's size; `storage_path` unchanged (versioned replace keeps the same key); checksum recomputed when checksum feature is on; OpenSearch re-index hook — check whether `MetadataPostProcessor` runs on replace-content and mirror that behavior (content changed, so full-text index should refresh) — flagged as an implementation-time check.
- **Concurrency:** two simultaneous restores both succeed (each creates a version) — last write wins, history complete; no locking needed for v1.

---

## 6. Test Strategy

Per repo rule: ITs set up state and assert **through REST/GraphQL APIs**, never the DB.

### 6.1 Backend ITs (openfilz-api, Testcontainers — model on `MinioChecksumVersioningIT`)

**New `DocumentVersioningIT`** (`storage.type=minio`, `storage.minio.versioning-enabled=true` via `@DynamicPropertySource`, `MinIOContainer`):

1. **List:** upload → replace ×2 (all via REST) → `GET /documents/{id}/versions` returns 3, exactly one `isLatest`, descending `lastModified`.
2. **VersionId in audit:** `GET /audit/{id}` → `UPLOAD_DOCUMENT` and both `REPLACE_DOCUMENT_CONTENT` entries carry distinct `details.versionId` values that all appear in the versions list.
3. **Download version:** download the oldest versionId → bytes equal the originally uploaded content; correct `Content-Disposition`/`Content-Type` headers.
4. **Restore:** restore oldest → 200 with `newVersionId`; versions list now 4; `GET /documents/{id}/download` (current) returns the v1 content; audit gains `RESTORE_DOCUMENT_VERSION` with `restoredFromVersionId` = oldest id and `restoredFromDate` ≈ v1's lastModified; document size (via `documentById` GraphQL or `GET /documents/{id}`) equals v1's size.
5. **Restore-latest rejected:** restoring the current latest versionId → 400 `CANNOT_RESTORE_LATEST`.
6. **History preserved:** after restore, every pre-restore versionId still downloads successfully.
7. **Errors:** unknown documentId → 404; unknown versionId → 404; folder id → 404/400; soft-deleted doc → 404.
8. **Checksum interplay** (when `openfilz.calculate-checksum=true`): restored document's stored checksum equals the original v1 checksum (assert via the API surface that exposes it, e.g. document info).

**New `DocumentVersioningDisabledIT`** (`versioning-enabled=false` and/or `storage.type=local`): all three endpoints → 409 `VERSIONING_DISABLED`; replace still works as before (regression).

**Security IT additions** (in whichever IT exercises role mapping): READER can list/download versions, cannot restore (403); CONTRIBUTOR can restore; WORM mode blocks restore.

**Unit tests:** version↔audit assembly logic if any lands in `DocumentVersionServiceImpl` (pure mapping), `RestoreVersionAudit` Jackson round-trip (polymorphic `type` discriminator).

### 6.2 Frontend (Karma/Jasmine, `ng test`)

- `DocumentVersionsService` spec: flag parsing (`'true'`/`'false'`/undefined), URL construction, blob response type.
- `AuditVersionActionsComponent` spec: hidden when flag off; rendered only for `UPLOAD_DOCUMENT`/`REPLACE_DOCUMENT_CONTENT`/`RESTORE_DOCUMENT_VERSION` FILE entries; View hidden for non-previewable contentType (use `viewer-mode.util` cases: pdf ✓, png ✓, exe ✗); Restore hidden on latest-version entry and for non-CONTRIBUTOR; restore flow = confirm-dialog → service call → `restored` output emitted; legacy entry without `details.versionId` and unmatched fallback → actions suppressed.
- `viewer-mode.util` spec: extracted pure function — table-driven mime/extension cases (cheap, high value).
- `file-viewer-dialog` spec additions: `versionId` present → version download path used, OnlyOffice mode never selected, edit/save controls hidden.
- Metadata-panel spec addition: versions list not fetched when flag off.

### 6.3 E2E (optional, `demo-e2e` Playwright — Phase 2)

Versioned-MinIO compose profile: upload → replace → open properties → audit tab shows actions → restore → new audit entry visible → download current equals original. Gate on an env flag in the e2e config since the standard stack runs unversioned.

---

## 7. Suggested Implementation Order

| # | Step | Repo | Size |
|---|---|---|---|
| 1 | StorageService version methods + MinIO impls + versionId capture (`uploadToObject`, `getLatestVersionId`) | openfilz-core | M |
| 2 | Audit: `versionId` on Upload/Replace audit, `RESTORE_DOCUMENT_VERSION` + `RestoreVersionAudit` (+ subtype registration) | openfilz-core | S |
| 3 | `DocumentVersionService` (+ no-op + factory config, native-safe) + `DocumentVersionController` + exceptions | openfilz-core | M |
| 4 | Backend ITs (`DocumentVersioningIT`, `DocumentVersioningDisabledIT`, security cases) | openfilz-core | M |
| 5 | Compose/.env.example/docs wiring for `STORAGE_MINIO_VERSIONING_ENABLED` + `NG_APP_…` | openfilz-core | S |
| 6 | Frontend flag (`env.d.ts`, environments, `.env`) + `DocumentVersionsService` + models | openfilz-web | S |
| 7 | `viewer-mode.util` extraction + `file-viewer-dialog` version mode | openfilz-web | S |
| 8 | `audit-version-actions` component + metadata-panel integration + i18n ×8 | openfilz-web | M |
| 9 | Frontend specs | openfilz-web | M |
| 10 | Native-image reflect-config verification + native smoke test (flag on/off) | openfilz-core | S |
| 11 | EE propagation: submodule bump, dokploy-compose-ee, ngx-env template + ZipPackagingServiceTest, web-ee merge | openfilz-enterprise | S |

---

## 8. Open Questions / Accepted v1 Limitations

1. **Legacy audit entries** (pre-feature) have no `versionId`; index-pairing fallback is best-effort and suppressed when ambiguous (§4.3). Exact mapping is guaranteed only going forward.
2. **>5 GiB restore** not supported (single CopyObject limit) — documented; multipart-copy fallback is Phase 2.
3. **OnlyOffice preview of versions** intentionally disabled (read-only historical content); office formats fall back to the mammoth/xlsx in-app renderers.
4. **Settings-API exposure** of effective backend versioning state (defense against flag drift) deferred to Phase 2 (§4.7).
5. **Version pruning / lifecycle policies** (bucket lifecycle rules to cap version count/age) are an ops concern, out of scope here — but worth an admin-guide note since unlimited versions grow storage.
