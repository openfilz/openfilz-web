import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';

import { AuditVersionActionsComponent } from './audit-version-actions/audit-version-actions.component';
import { DocumentApiService } from '../../services/document-api.service';
import { DocumentVersionsService } from '../../services/document-versions.service';
import { DragDropService } from '../../services/drag-drop.service';
import { AuditLog, DocumentInfo } from '../../models/document.models';
import { DocumentVersionInfo } from '../../models/document-versions.models';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { FileIconService } from '../../services/file-icon.service';

/** A single metadata key/value shown in the inline editor */
interface MetadataEntry {
  key: string;
  value: string;
}

@Component({
  selector: 'app-metadata-panel',
  standalone: true,
  templateUrl: './metadata-panel.component.html',
  styleUrls: ['./metadata-panel.component.css'],
  imports: [
    NgClass,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTooltipModule,
    MatTabsModule,
    AuditVersionActionsComponent,
    TranslatePipe
]
})
export class MetadataPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() documentId?: string;
  @Input() isOpen: boolean = false;
  @Output() closePanel = new EventEmitter<void>();
  @Output() metadataSaved = new EventEmitter<void>();

  documentInfo?: DocumentInfo;
  loading: boolean = false;
  error?: string;
  selectedTabIndex: number = 0;

  // Inline metadata editing state (per-field, no global edit mode)
  metadataEntries: MetadataEntry[] = [];
  editingKey: string | null = null;
  editValue: string = '';
  savingKey: string | null = null;
  addingEntry: boolean = false;
  newKey: string = '';
  newValue: string = '';
  newEntryError?: string;

  // Audit
  auditLogs: AuditLog[] = [];
  auditLoading: boolean = false;
  auditError?: string;

  // File versions (MinIO bucket versioning, flag-gated)
  versions: DocumentVersionInfo[] = [];
  // Keyed by the AuditLog OBJECT: the audit trail endpoint returns entries with a
  // null id, so any id-based key would collapse every entry onto the same slot
  private versionIdByLog = new Map<AuditLog, string>();

  /** Audit actions that create a new storage version of the file */
  private readonly VERSION_CREATING_ACTIONS =
    ['UPLOAD_DOCUMENT', 'REPLACE_DOCUMENT_CONTENT', 'RESTORE_DOCUMENT_VERSION', 'COPY_FILE', 'COPY_FILE_CHILD'];

  // External file dragging state
  isExternalFileDragging: boolean = false;
  private dragSubscription?: Subscription;

  // System metadata keys that should not be editable
  private readonly SYSTEM_METADATA_KEYS = ['sha256'];

  private readonly METADATA_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

  // MIME type to translation key mapping
  private readonly MIME_TYPE_KEYS: { [key: string]: string } = {
    'application/pdf': 'mimeTypes.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'mimeTypes.word',
    'application/msword': 'mimeTypes.wordLegacy',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'mimeTypes.excel',
    'application/vnd.ms-excel': 'mimeTypes.excelLegacy',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'mimeTypes.powerpoint',
    'application/vnd.ms-powerpoint': 'mimeTypes.powerpointLegacy',
    'text/plain': 'mimeTypes.text',
    'text/html': 'mimeTypes.html',
    'text/css': 'mimeTypes.css',
    'text/javascript': 'mimeTypes.js',
    'application/json': 'mimeTypes.json',
    'application/xml': 'mimeTypes.xml',
    'text/xml': 'mimeTypes.xml',
    'image/png': 'mimeTypes.png',
    'image/jpeg': 'mimeTypes.jpg',
    'image/gif': 'mimeTypes.gif',
    'image/webp': 'mimeTypes.webp',
    'image/svg+xml': 'mimeTypes.svg',
    'image/bmp': 'mimeTypes.bmp',
    'image/tiff': 'mimeTypes.tiff',
    'audio/mpeg': 'mimeTypes.mp3',
    'audio/wav': 'mimeTypes.wav',
    'audio/ogg': 'mimeTypes.ogg',
    'video/mp4': 'mimeTypes.mp4',
    'video/webm': 'mimeTypes.webm',
    'video/quicktime': 'mimeTypes.mov',
    'application/zip': 'mimeTypes.zip',
    'application/x-rar-compressed': 'mimeTypes.rar',
    'application/x-7z-compressed': 'mimeTypes.7z',
    'application/gzip': 'mimeTypes.gz',
    'application/x-tar': 'mimeTypes.tar'
  };

  // File extension to translation key mapping (fallback when contentType is unavailable)
  private readonly EXTENSION_KEYS: { [key: string]: string } = {
    'pdf': 'mimeTypes.pdf',
    'doc': 'mimeTypes.wordLegacy',
    'docx': 'mimeTypes.word',
    'xls': 'mimeTypes.excelLegacy',
    'xlsx': 'mimeTypes.excel',
    'ppt': 'mimeTypes.powerpointLegacy',
    'pptx': 'mimeTypes.powerpoint',
    'txt': 'mimeTypes.text',
    'html': 'mimeTypes.html',
    'htm': 'mimeTypes.html',
    'css': 'mimeTypes.css',
    'js': 'mimeTypes.js',
    'ts': 'mimeTypes.js',
    'json': 'mimeTypes.json',
    'xml': 'mimeTypes.xml',
    'png': 'mimeTypes.png',
    'jpg': 'mimeTypes.jpg',
    'jpeg': 'mimeTypes.jpg',
    'gif': 'mimeTypes.gif',
    'webp': 'mimeTypes.webp',
    'svg': 'mimeTypes.svg',
    'bmp': 'mimeTypes.bmp',
    'tiff': 'mimeTypes.tiff',
    'tif': 'mimeTypes.tiff',
    'mp3': 'mimeTypes.mp3',
    'wav': 'mimeTypes.wav',
    'ogg': 'mimeTypes.ogg',
    'mp4': 'mimeTypes.mp4',
    'webm': 'mimeTypes.webm',
    'mov': 'mimeTypes.mov',
    'avi': 'mimeTypes.mp4',
    'zip': 'mimeTypes.zip',
    'rar': 'mimeTypes.rar',
    '7z': 'mimeTypes.7z',
    'gz': 'mimeTypes.gz',
    'tar': 'mimeTypes.tar'
  };

  private documentApi = inject(DocumentApiService);
  private documentVersionsService = inject(DocumentVersionsService);
  private dragDropService = inject(DragDropService);
  private fileIconService = inject(FileIconService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  constructor() { }

  ngOnInit() {
    if (this.documentId && this.isOpen) {
      this.loadDocumentInfo();
    }

    // Subscribe to external file dragging state
    this.dragSubscription = this.dragDropService.isExternalFileDragging$.subscribe(
      (isDragging) => {
        this.isExternalFileDragging = isDragging;
      }
    );
  }

  ngOnDestroy() {
    this.dragSubscription?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.isOpen) {
      this.resetState();
      return;
    }
    // Load on open, and reload when the panel stays open but the target
    // document changes (e.g. clicking Details on another item)
    if (this.documentId && (changes['isOpen'] || changes['documentId'])) {
      this.resetState();
      this.loadDocumentInfo();
    }
  }

  private resetState() {
    this.documentInfo = undefined;
    this.error = undefined;
    this.auditLogs = [];
    this.auditError = undefined;
    this.selectedTabIndex = 0;
    this.versions = [];
    this.versionIdByLog.clear();
    this.metadataEntries = [];
    this.cancelEdit();
    this.cancelAdd();
  }

  get versioningEnabled(): boolean {
    return this.documentVersionsService.isVersioningEnabled();
  }

  loadDocumentInfo() {
    if (!this.documentId) return;

    this.loading = true;
    this.error = undefined;

    this.documentApi.getDocumentInfo(this.documentId, true).subscribe({
      next: (info) => {
        this.documentInfo = info;
        this.buildMetadataEntries();
        this.loading = false;
      },
      error: (err) => {
        this.error = 'metadataPanel.errorLoading';
        this.loading = false;
        this.snackBar.open(this.translate.instant(this.error), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  private buildMetadataEntries() {
    const metadata = this.documentInfo?.metadata || {};
    this.metadataEntries = Object.keys(metadata)
      .filter(key => !this.SYSTEM_METADATA_KEYS.includes(key))
      .map(key => ({ key, value: String(metadata[key]) }));
  }

  /**
   * Get SHA256 hash from metadata if it exists
   */
  get sha256Hash(): string | undefined {
    return this.documentInfo?.metadata?.['sha256'];
  }

  get documentIcon(): string {
    if (!this.documentInfo) return 'description';
    return this.fileIconService.getFileIcon(this.documentInfo.name, this.documentInfo.type);
  }

  get documentColor(): string {
    if (!this.documentInfo) return 'var(--primary)';
    return this.fileIconService.getFileColor(this.documentInfo.name, this.documentInfo.type);
  }

  getFriendlyTypeKey(): { key: string, params?: any } {
    if (!this.documentInfo) {
      return { key: 'mimeTypes.unknown' };
    }
    if (this.documentInfo.type === 'FOLDER') {
      return { key: 'common.folder' };
    }

    const contentType = this.documentInfo.contentType;
    if (contentType) {
      if (this.MIME_TYPE_KEYS[contentType]) {
        return { key: this.MIME_TYPE_KEYS[contentType] };
      }
      // Try to parse the MIME type
      const parts = contentType.split('/');
      const category = parts[0];
      const subtype = parts[1];
      if (subtype) {
        const subtypeLower = subtype.toLowerCase();
        if (subtypeLower.includes('pdf')) return { key: 'mimeTypes.pdf' };
        if (subtypeLower.includes('word')) return { key: 'mimeTypes.word' };
        if (subtypeLower.includes('excel') || subtypeLower.includes('spreadsheet')) return { key: 'mimeTypes.excel' };
        if (subtypeLower.includes('powerpoint') || subtypeLower.includes('presentation')) return { key: 'mimeTypes.powerpoint' };
        const friendlySubtype = subtypeLower.replace(/^x-/, '').replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        switch (category) {
          case 'image': return { key: 'mimeTypes.imageType', params: { type: friendlySubtype } };
          case 'video': return { key: 'mimeTypes.videoType', params: { type: friendlySubtype } };
          case 'audio': return { key: 'mimeTypes.audioType', params: { type: friendlySubtype } };
          case 'text': return { key: 'common.fileWithType', params: { type: friendlySubtype } };
          default: return { key: 'common.fileWithType', params: { type: friendlySubtype } };
        }
      }
    }

    // Fallback: try to get type from file extension
    if (this.documentInfo.name) {
      const extension = this.fileIconService.getFileExtension(this.documentInfo.name);
      if (extension && (this.EXTENSION_KEYS as any)[extension]) {
        return { key: (this.EXTENSION_KEYS as any)[extension] };
      }
    }

    return { key: 'common.file' };
  }

  /**
   * Copy SHA256 hash to clipboard
   */
  copySha256ToClipboard() {
    const hash = this.sha256Hash;
    if (hash) {
      navigator.clipboard.writeText(hash).then(() => {
        this.snackBar.open(this.translate.instant('metadataPanel.hashCopied'), this.translate.instant('common.close'), { duration: 2000 });
      }).catch(() => {
        this.snackBar.open(this.translate.instant('metadataPanel.copyFailed'), this.translate.instant('common.close'), { duration: 2000 });
      });
    }
  }

  // ===== Inline metadata editing (per-field save, no edit mode) =====

  startEdit(entry: MetadataEntry) {
    if (this.savingKey) return;
    this.cancelAdd();
    this.editingKey = entry.key;
    this.editValue = entry.value;
  }

  cancelEdit() {
    this.editingKey = null;
    this.editValue = '';
  }

  commitEdit(entry: MetadataEntry) {
    if (this.editingKey !== entry.key) return;
    const newValue = this.editValue.trim();
    if (!newValue || newValue === entry.value) {
      this.cancelEdit();
      return;
    }
    if (!this.documentId) return;

    this.savingKey = entry.key;
    this.documentApi.updateDocumentMetadata(this.documentId, { [entry.key]: newValue }).subscribe({
      next: () => {
        entry.value = newValue;
        this.syncLocalMetadata(entry.key, newValue);
        this.savingKey = null;
        this.cancelEdit();
        this.snackBar.open(this.translate.instant('metadataPanel.saveSuccess'), this.translate.instant('common.close'), { duration: 2000 });
        this.metadataSaved.emit();
      },
      error: () => {
        this.savingKey = null;
        this.snackBar.open(this.translate.instant('metadataPanel.saveFailed'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  deleteEntry(entry: MetadataEntry) {
    if (!this.documentId || this.savingKey) return;

    this.savingKey = entry.key;
    this.documentApi.deleteDocumentMetadata(this.documentId, [entry.key]).subscribe({
      next: () => {
        this.metadataEntries = this.metadataEntries.filter(e => e.key !== entry.key);
        if (this.documentInfo?.metadata) {
          delete this.documentInfo.metadata[entry.key];
        }
        this.savingKey = null;
        this.snackBar.open(this.translate.instant('metadataPanel.keyDeleted', { key: entry.key }), this.translate.instant('common.close'), { duration: 2000 });
        this.metadataSaved.emit();
      },
      error: () => {
        this.savingKey = null;
        this.snackBar.open(this.translate.instant('metadataPanel.saveFailed'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  startAdd() {
    if (this.savingKey) return;
    this.cancelEdit();
    this.addingEntry = true;
    this.newKey = '';
    this.newValue = '';
    this.newEntryError = undefined;
  }

  cancelAdd() {
    this.addingEntry = false;
    this.newKey = '';
    this.newValue = '';
    this.newEntryError = undefined;
  }

  get canCommitAdd(): boolean {
    return !!this.newKey.trim() && !!this.newValue.trim() && !this.savingKey;
  }

  commitAdd() {
    const key = this.newKey.trim();
    const value = this.newValue.trim();
    if (!key || !value || !this.documentId) return;

    if (!this.METADATA_KEY_PATTERN.test(key)) {
      this.newEntryError = 'metadataEditor.errors.invalidKeyFormat';
      return;
    }
    const existingKeys = [...this.metadataEntries.map(e => e.key), ...this.SYSTEM_METADATA_KEYS];
    if (existingKeys.some(k => k.toLowerCase() === key.toLowerCase())) {
      this.newEntryError = 'metadataEditor.errors.duplicateKey';
      return;
    }

    this.newEntryError = undefined;
    this.savingKey = key;
    this.documentApi.updateDocumentMetadata(this.documentId, { [key]: value }).subscribe({
      next: () => {
        this.metadataEntries.push({ key, value });
        this.syncLocalMetadata(key, value);
        this.savingKey = null;
        this.cancelAdd();
        this.snackBar.open(this.translate.instant('metadataPanel.saveSuccess'), this.translate.instant('common.close'), { duration: 2000 });
        this.metadataSaved.emit();
      },
      error: () => {
        this.savingKey = null;
        this.snackBar.open(this.translate.instant('metadataPanel.saveFailed'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  private syncLocalMetadata(key: string, value: string) {
    if (this.documentInfo) {
      this.documentInfo.metadata = { ...(this.documentInfo.metadata || {}), [key]: value };
    }
  }

  formatFileSize(bytes?: number): string {
    if (bytes === undefined || bytes === 0) return '0 B';
    return this.fileIconService.getFileSize(bytes);
  }

  onClose() {
    this.closePanel.emit();
  }

  /**
   * True when an inline metadata edit or add is in progress and would be lost
   * if the panel closed now. Value edits auto-commit on blur, so the only truly
   * unsaved states are: an active value edit whose text differs from the saved
   * value, or a new-entry row with any content typed in.
   */
  get hasPendingChanges(): boolean {
    if (this.editingKey !== null) {
      const entry = this.metadataEntries.find(e => e.key === this.editingKey);
      if (entry && this.editValue.trim() !== entry.value) {
        return true;
      }
    }
    if (this.addingEntry && (!!this.newKey.trim() || !!this.newValue.trim())) {
      return true;
    }
    return false;
  }

  /** Commit the pending inline edit / add (used by the unsaved-changes guard). */
  savePendingChanges() {
    if (this.editingKey !== null) {
      const entry = this.metadataEntries.find(e => e.key === this.editingKey);
      if (entry) {
        this.commitEdit(entry);
      }
    } else if (this.addingEntry && this.canCommitAdd) {
      this.commitAdd();
    }
  }

  /** Drop the pending inline edit / add without saving. */
  discardPendingChanges() {
    this.cancelEdit();
    this.cancelAdd();
  }

  // ===== Activity (audit + versions) =====

  onTabChange(index: number) {
    this.selectedTabIndex = index;
    if (index === 1 && this.auditLogs.length === 0 && !this.auditLoading) {
      this.loadAuditTrail();
    }
  }

  loadAuditTrail() {
    if (!this.documentId) return;

    this.auditLoading = true;
    this.auditError = undefined;

    this.documentApi.getAuditTrail(this.documentId, 'DESC').subscribe({
      next: (logs) => {
        this.auditLogs = logs;
        this.auditLoading = false;
        this.loadVersions();
      },
      error: (err) => {
        this.auditError = 'Failed to load audit history';
        this.auditLoading = false;
      }
    });
  }

  /**
   * Load the file's storage versions alongside the audit trail (only when the
   * versioning flag is on and the document is a file), then map version-creating
   * audit entries to versionIds so each entry gets its view/download/restore actions.
   */
  private loadVersions() {
    if (!this.versioningEnabled || !this.documentId || this.documentInfo?.type !== 'FILE') {
      this.versions = [];
      this.versionIdByLog.clear();
      return;
    }
    this.documentVersionsService.listVersions(this.documentId).subscribe({
      next: (versions) => {
        this.versions = versions;
        this.computeVersionMapping();
      },
      error: () => {
        // Flag drift (backend versioning off → 409) or transient error: just no actions
        this.versions = [];
        this.versionIdByLog.clear();
      }
    });
  }

  /**
   * Map version-creating audit entries to storage versionIds.
   * Primary (exact): details.versionId, stored on every entry written since the
   * versioning feature shipped. Legacy fallback (best-effort): when NO entry has a
   * stored versionId, pair entries with surviving versions index-wise by date — only
   * when the counts line up exactly; otherwise actions are suppressed on legacy entries.
   */
  private computeVersionMapping() {
    this.versionIdByLog.clear();
    const entries = this.auditLogs
      .filter(log => this.VERSION_CREATING_ACTIONS.includes(log.action) && log.resourceType === 'FILE')
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let exactCount = 0;
    for (const log of entries) {
      const versionId = log.details?.['versionId'];
      if (versionId && this.versions.some(v => v.versionId === versionId)) {
        this.versionIdByLog.set(log, versionId);
        exactCount++;
      }
    }

    if (exactCount === 0 && entries.length > 0 && entries.length === this.versions.length) {
      const ascendingVersions = this.versions.slice()
        .sort((a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime());
      entries.forEach((log, i) => this.versionIdByLog.set(log, ascendingVersions[i].versionId));
    }
  }

  getVersionIdFor(log: AuditLog): string | undefined {
    return this.versionIdByLog.get(log);
  }

  onVersionRestored() {
    // The restore created a new version + audit entry, and the document size may
    // have changed — refresh everything and let the parent refresh its item row.
    this.loadDocumentInfo();
    this.loadAuditTrail();
    this.metadataSaved.emit();
  }

  getAuditActionKey(action: string): string {
    return `audit.actions.${action}`;
  }

  getAuditActionIcon(action: string): string {
    const icons: { [key: string]: string } = {
      'COPY_FILE': 'file_copy',
      'COPY_FILE_CHILD': 'file_copy',
      'RENAME_FILE': 'edit',
      'RENAME_FOLDER': 'edit',
      'COPY_FOLDER': 'folder_copy',
      'DELETE_FILE': 'delete',
      'DELETE_FILE_CHILD': 'delete',
      'DELETE_FOLDER': 'folder_delete',
      'CREATE_FOLDER': 'create_new_folder',
      'MOVE_FILE': 'drive_file_move',
      'MOVE_FOLDER': 'drive_folder_upload',
      'UPLOAD_DOCUMENT': 'upload_file',
      'REPLACE_DOCUMENT_CONTENT': 'sync',
      'RESTORE_DOCUMENT_VERSION': 'settings_backup_restore',
      'REPLACE_DOCUMENT_METADATA': 'label',
      'UPDATE_DOCUMENT_METADATA': 'label',
      'DOWNLOAD_DOCUMENT': 'download',
      'DELETE_DOCUMENT_METADATA': 'label_off',
      'SHARE_DOCUMENTS': 'share',
      'RESTORE_FILE': 'restore',
      'RESTORE_FOLDER': 'restore',
      'PERMANENT_DELETE_FILE': 'delete_forever',
      'PERMANENT_DELETE_FOLDER': 'delete_forever',
      'EMPTY_RECYCLE_BIN': 'delete_sweep'
    };
    return icons[action] || 'history';
  }

  getAuditActionColor(action: string): string {
    if (action.includes('DELETE') || action.includes('PERMANENT')) return 'warn';
    if (action.includes('UPLOAD') || action.includes('CREATE')) return 'success';
    if (action.includes('RESTORE')) return 'success';
    return 'primary';
  }

  formatAuditDateKey(timestamp: string): { key: string, params?: any } {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return { key: 'audit.time.justNow' };
    if (diffMins < 60) return { key: diffMins === 1 ? 'audit.time.minAgo' : 'audit.time.minsAgo', params: { count: diffMins } };
    if (diffHours < 24) return { key: diffHours === 1 ? 'audit.time.hourAgo' : 'audit.time.hoursAgo', params: { count: diffHours } };
    if (diffDays < 7) return { key: diffDays === 1 ? 'audit.time.dayAgo' : 'audit.time.daysAgo', params: { count: diffDays } };

    return { key: date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
  }
}
