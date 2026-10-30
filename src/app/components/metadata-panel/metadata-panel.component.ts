import { Component, ElementRef, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
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
import { DocumentInsightsComponent } from './document-insights/document-insights.component';
import { DocumentWorkflowComponent } from './document-workflow/document-workflow.component';
import { SwipeTabsDirective } from '../../directives/swipe-tabs.directive';
import { JsonTreeComponent } from '../json-tree/json-tree.component';
import {
  JsonSummary, METADATA_VALUE_TYPES, MetadataValueType, formatMetadataValue, isJsonContainer, jsonSummary,
  lenientJsonLoaded, loadLenientJson, looksLikeJsonContainer, metadataValueType, parseTypedValue, previewMetadataValue
} from '../../utils/json-values';
import { metadataKeyError } from '../../utils/metadata-key';
import { DocumentApiService } from '../../services/document-api.service';
import { DocumentVersionsService } from '../../services/document-versions.service';
import { DragDropService } from '../../services/drag-drop.service';
import { AuditLog, DocumentInfo, DocumentType } from '../../models/document.models';
import { DocumentVersionInfo } from '../../models/document-versions.models';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { appLocale } from '../../i18n/app-locale';
import { FileIconService } from '../../services/file-icon.service';

/** A single metadata key/value shown in the inline editor */
interface MetadataEntry {
  key: string;
  /** Text shown and edited: JSON for objects, arrays, numbers and booleans */
  value: string;
  /** The value as stored, so a structured value is saved back with its type */
  raw: unknown;
  /** An object or array: shown as a collapsible tree, edited as indented JSON */
  structured: boolean;
  /** Folded line of a structured value: its size ("6 keys") and a capped one-line JSON preview */
  summary: JsonSummary | null;
  preview: string;
}

/** Entry of the list; the derived fields are computed once here, not on every change detection. */
/** Value being typed in the inline editor: its text, the type it is saved as, and the error shown under it */
interface ValueDraft {
  /** The key: typed in the add row, renamable in the inline edit */
  key: string;
  text: string;
  type: MetadataValueType;
  /** The user picked the type by hand, so a leading { or [ no longer switches it to JSON */
  typeChosen: boolean;
  error?: string;
}

function emptyDraft(): ValueDraft {
  return { key: '', text: '', type: 'text', typeChosen: false };
}

function toMetadataEntry(key: string, raw: unknown): MetadataEntry {
  const value = formatMetadataValue(raw);
  const structured = isJsonContainer(raw);
  return { key, value, raw, structured, summary: structured ? jsonSummary(raw) : null, preview: previewMetadataValue(value) };
}

/** The document a panel navigation action applies to. */
export interface MetadataPanelTarget {
  id: string;
  name: string;
  type: DocumentType;
  contentType?: string;
  size?: number;
}

@Component({
  selector: 'app-metadata-panel',
  standalone: true,
  templateUrl: './metadata-panel.component.html',
  styleUrls: ['./metadata-panel.component.css'],
  imports: [
    NgClass,
    NgTemplateOutlet,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTooltipModule,
    MatTabsModule,
    SwipeTabsDirective,
    JsonTreeComponent,
    AuditVersionActionsComponent,
    DocumentInsightsComponent,
    DocumentWorkflowComponent,
    TranslatePipe
]
})
export class MetadataPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() documentId?: string;
  @Input() isOpen: boolean = false;
  @Output() closePanel = new EventEmitter<void>();
  @Output() metadataSaved = new EventEmitter<void>();
  /** "Open": preview the file, or enter the folder. Handled by the host page. */
  @Output() openDocument = new EventEmitter<MetadataPanelTarget>();
  /** "Go to location": show the item inside the folder that holds it. */
  @Output() goToLocation = new EventEmitter<MetadataPanelTarget>();
  /**
   * Whether to offer "Go to location". Off for the file explorer, which already
   * displays the folder holding the item; on for the listings that don't
   * (search results, favorites), where it is the only way to find the document.
   */
  @Input() showLocationAction: boolean = true;

  documentInfo?: DocumentInfo;
  loading: boolean = false;
  error?: string;
  selectedTabIndex: number = 0;

  // Inline metadata editing state (per-field, no global edit mode)
  metadataEntries: MetadataEntry[] = [];
  editingKey: string | null = null;
  savingKey: string | null = null;
  addingEntry: boolean = false;
  /** The value being typed, for the inline edit or the add row (only one of them is open at a time) */
  draft: ValueDraft = emptyDraft();
  readonly valueTypes = METADATA_VALUE_TYPES;
  readonly booleanLiterals = ['true', 'false'];
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Keys of the structured values unfolded in the list (all folded by default) */
  private openJsonKeys = new Set<string>();

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

  // e-Sign metadata written by the signing pipeline: shown, but locked against edit/delete
  private readonly LOCKED_METADATA_KEYS = ['_signed', '_readOnly', '_signedEnvelopeId'];

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
    this.openJsonKeys.clear();
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
      .map(key => toMetadataEntry(key, metadata[key]));
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

  isLocked(key: string): boolean {
    return this.LOCKED_METADATA_KEYS.includes(key);
  }

  startEdit(entry: MetadataEntry) {
    if (this.savingKey || this.isLocked(entry.key)) return;
    this.cancelAdd();
    this.editingKey = entry.key;
    this.draft = {
      key: entry.key,
      text: entry.structured ? JSON.stringify(entry.raw, null, 2) : entry.value,
      type: metadataValueType(entry.raw),
      typeChosen: false
    };
    if (this.draft.type === 'json') loadLenientJson();
    this.focusDraftControl();
  }

  cancelEdit() {
    this.editingKey = null;
    this.draft = emptyDraft();
  }

  commitEdit(entry: MetadataEntry) {
    // A blur while the save is in flight (Ctrl+Enter then a click elsewhere) must not send it twice
    if (this.editingKey !== entry.key || this.savingKey) return;
    const key = this.draft.key.trim();
    const text = this.draft.text.trim();
    if (!text) {
      this.cancelEdit();
      return;
    }
    if (!this.documentId) return;
    const keyError = this.keyError(key, entry.key);
    if (keyError) {
      this.draft.error = keyError;
      return;
    }
    const parsed = parseTypedValue(this.draft.type, text);
    if ('error' in parsed) {
      if (this.lenientJsonPending(parsed.error)) {
        this.lenientJsonRetried = true;
        loadLenientJson().then(() => { this.commitEdit(entry); this.lenientJsonRetried = false; });
        return;
      }
      this.draft.error = 'metadataPanel.' + parsed.error;
      return;
    }
    // Retyping the same value (or re-indenting a JSON one) is not a change; a new type or key is
    const saved = parsed.value;
    const oldKey = entry.key;
    const renamed = key !== oldKey;
    if (!renamed && JSON.stringify(saved) === JSON.stringify(entry.raw)) {
      this.cancelEdit();
      return;
    }

    const documentId = this.documentId;
    const oldRaw = entry.raw;
    const done = () => {
      this.savingKey = null;
      this.cancelEdit();
      this.snackBar.open(this.translate.instant('metadataPanel.saveSuccess'), this.translate.instant('common.close'), { duration: 2000 });
      this.metadataSaved.emit();
    };
    this.savingKey = oldKey;
    // A rename writes the value under its new key first, then removes the old key: a failure in
    // between leaves both keys on the document, never the value lost
    this.documentApi.updateDocumentMetadata(documentId, { [key]: saved }).subscribe({
      next: () => {
        Object.assign(entry, toMetadataEntry(key, saved));
        this.syncLocalMetadata(key, saved);
        if (!renamed) {
          done();
          return;
        }
        this.savingKey = key;
        this.documentApi.deleteDocumentMetadata(documentId, [oldKey]).subscribe({
          next: () => {
            delete this.documentInfo?.metadata?.[oldKey];
            done();
          },
          error: () => {
            const at = this.metadataEntries.indexOf(entry);
            this.metadataEntries.splice(at + 1, 0, toMetadataEntry(oldKey, oldRaw));
            this.savingKey = null;
            this.cancelEdit();
            this.snackBar.open(this.translate.instant('metadataPanel.renameOldKeyKept', { key, old: oldKey }), this.translate.instant('common.close'), { duration: 5000 });
            this.metadataSaved.emit();
          }
        });
      },
      error: () => {
        this.savingKey = null;
        this.snackBar.open(this.translate.instant('metadataPanel.saveFailed'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  /** Why the typed key cannot be saved (as a new entry, or as the new name of `current`), or null */
  private keyError(key: string, current?: string): string | null {
    const taken = this.metadataEntries.map(e => e.key).filter(k => k !== current);
    const error = metadataKeyError(key, taken, [...this.SYSTEM_METADATA_KEYS, ...this.LOCKED_METADATA_KEYS]);
    return error && 'metadataEditor.errors.' + error;
  }

  deleteEntry(entry: MetadataEntry) {
    if (!this.documentId || this.savingKey || this.isLocked(entry.key)) return;
    if (this.editingKey === entry.key) {
      this.cancelEdit();
    }

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
    this.draft = emptyDraft();
  }

  cancelAdd() {
    this.addingEntry = false;
    this.draft = emptyDraft();
  }

  get canCommitAdd(): boolean {
    return !!this.draft.key.trim() && !!this.draft.text.trim() && !this.savingKey;
  }

  commitAdd() {
    const key = this.draft.key.trim();
    const text = this.draft.text.trim();
    if (!key || !text || !this.documentId) return;

    const keyError = this.keyError(key);
    if (keyError) {
      this.draft.error = keyError;
      return;
    }
    const parsed = parseTypedValue(this.draft.type, text);
    if ('error' in parsed) {
      if (this.lenientJsonPending(parsed.error)) {
        this.lenientJsonRetried = true;
        loadLenientJson().then(() => { this.commitAdd(); this.lenientJsonRetried = false; });
        return;
      }
      this.draft.error = 'metadataPanel.' + parsed.error;
      return;
    }
    const value = parsed.value;

    this.draft.error = undefined;
    this.savingKey = key;
    this.documentApi.updateDocumentMetadata(this.documentId, { [key]: value }).subscribe({
      next: () => {
        this.metadataEntries.push(toMetadataEntry(key, value));
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

  /** Enter / Ctrl+Enter in the value editor: saves the inline edit of `entry`, or the add row when there is none */
  commitDraft(entry: MetadataEntry | null) {
    if (entry) {
      this.commitEdit(entry);
    } else {
      this.commitAdd();
    }
  }

  /** Esc in the value editor */
  cancelDraft(entry: MetadataEntry | null) {
    if (entry) {
      this.cancelEdit();
    } else {
      this.cancelAdd();
    }
  }

  /** The type picker: the text is kept across types (a boolean can only be one of its two literals) */
  setDraftType(type: MetadataValueType) {
    if (this.draft.type === type) return;
    this.draft.type = type;
    this.draft.typeChosen = true;
    this.draft.error = undefined;
    if (type === 'boolean' && !this.booleanLiterals.includes(this.draft.text.trim())) {
      this.draft.text = 'true';
    }
    if (type === 'json') loadLenientJson();
    this.focusDraftControl();
  }

  /** Typing a value: an untouched text type becomes JSON as soon as the text opens an object or array */
  onDraftInput() {
    this.draft.error = undefined;
    if (this.draft.type === 'text' && !this.draft.typeChosen && looksLikeJsonContainer(this.draft.text)) {
      this.draft.type = 'json';
      loadLenientJson();
      this.focusDraftControl();
    }
  }

  /**
   * Invalid JSON while the JSON5 parser is still on its way (typed and saved within the instant the
   * editor opened): the save retries once it has landed, rather than refusing JSON5 syntax once.
   * After a failed load the parser never counts as loaded, and the strict refusal stands.
   */
  private lenientJsonPending(error: string): boolean {
    return error === 'invalidJson' && !lenientJsonLoaded() && !this.lenientJsonRetried;
  }
  private lenientJsonRetried = false;

  /**
   * Focus the control of the open editor once it is rendered (the field of a text / number / JSON value,
   * the chosen literal of a boolean), caret at the end. Called whenever the control changes element.
   */
  private focusDraftControl() {
    setTimeout(() => {
      const editor = this.host.nativeElement.querySelector('.metadata-row.editing, .metadata-row.add-row');
      const control = editor?.querySelector<HTMLElement>('.metadata-json-input, .metadata-value-input, .metadata-bool-picker button.selected');
      if (!control) return;
      control.focus();
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        const end = control.value.length;
        control.setSelectionRange(end, end);
      }
    });
  }

  /**
   * The inline edit saves when the focus leaves its row (click elsewhere, Tab away). Moving within the
   * row (type picker, boolean literals, save / cancel buttons) is not leaving it. Those buttons also
   * cancel their mousedown so the field keeps the focus in browsers that do not focus clicked buttons.
   * Chrome fires focusout for a control that is being replaced too (value button → field, field → JSON
   * textarea), while it is still attached: the decision waits for the end of the task, when such a
   * control is detached — and still comes before the click that follows a mousedown elsewhere, so
   * the unsaved-changes guard sees a save in flight, not a pending edit.
   */
  onRowFocusOut(event: FocusEvent, entry: MetadataEntry) {
    if (this.editingKey !== entry.key) return;
    const row = event.currentTarget as HTMLElement;
    const next = event.relatedTarget;
    if (next instanceof Node && row.contains(next)) return;
    const control = event.target as Node;
    queueMicrotask(() => {
      if (!control.isConnected || this.editingKey !== entry.key) return;
      const active = document.activeElement;
      if (active && row.contains(active)) return;
      this.commitEdit(entry);
    });
  }

  private isEditDirty(entry: MetadataEntry): boolean {
    if (this.draft.key.trim() !== entry.key) return true;
    const parsed = parseTypedValue(this.draft.type, this.draft.text.trim());
    return 'error' in parsed || JSON.stringify(parsed.value) !== JSON.stringify(entry.raw);
  }

  /** Height of the JSON editor: fits the value, between 4 and 16 lines (then it scrolls) */
  get jsonEditRows(): number {
    if (this.draft.text !== this.jsonEditRowsFor) {
      this.jsonEditRowsFor = this.draft.text;
      let lines = 1;
      for (let i = this.draft.text.indexOf('\n'); i !== -1 && lines < 16; i = this.draft.text.indexOf('\n', i + 1)) lines++;
      this.jsonEditRowsValue = Math.min(16, Math.max(4, lines));
    }
    return this.jsonEditRowsValue;
  }
  private jsonEditRowsFor = '';
  private jsonEditRowsValue = 4;

  isJsonOpen(key: string): boolean {
    return this.openJsonKeys.has(key);
  }

  toggleJson(key: string) {
    if (!this.openJsonKeys.delete(key)) {
      this.openJsonKeys.add(key);
    }
  }

  copyJson(entry: MetadataEntry) {
    const copyFailed = () =>
      this.snackBar.open(this.translate.instant('metadataPanel.copyFailed'), this.translate.instant('common.close'), { duration: 2000 });
    // `navigator.clipboard` is undefined on insecure origins (plain-http deployments): a plain call would throw
    if (!navigator.clipboard?.writeText) {
      copyFailed();
      return;
    }
    navigator.clipboard.writeText(JSON.stringify(entry.raw, null, 2)).then(() => {
      this.snackBar.open(this.translate.instant('metadataPanel.jsonCopied'), this.translate.instant('common.close'), { duration: 2000 });
    }).catch(copyFailed);
  }

  private syncLocalMetadata(key: string, value: unknown) {
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

  /** Tooltip of the "Open" action: entering a folder and previewing a file read differently. */
  get openTooltipKey(): string {
    return this.documentInfo?.type === DocumentType.FOLDER
      ? 'metadataPanel.openFolderTooltip'
      : 'metadataPanel.openDocumentTooltip';
  }

  /** The document shown, in the shape the host page's navigation handlers expect. */
  private get target(): MetadataPanelTarget | undefined {
    if (!this.documentId || !this.documentInfo) return undefined;
    return {
      id: this.documentId,
      name: this.documentInfo.name,
      type: this.documentInfo.type,
      contentType: this.documentInfo.contentType,
      size: this.documentInfo.size
    };
  }

  onOpen() {
    const target = this.target;
    if (target) {
      this.openDocument.emit(target);
    }
  }

  onGoToLocation() {
    const target = this.target;
    if (target) {
      this.goToLocation.emit(target);
    }
  }

  /** Smart filing "Move back": the document changed folder, let the parent refresh its listing. */
  onMovedBack() {
    this.metadataSaved.emit();
  }

  /**
   * True when an inline metadata edit or add is in progress and would be lost
   * if the panel closed now. Value edits auto-commit on blur, so the only truly
   * unsaved states are: an active value edit whose text differs from the saved
   * value, or a new-entry row with any content typed in.
   */
  get hasPendingChanges(): boolean {
    // A save already on its way (blur-commit, Enter) is not unsaved: the panel may close over it
    if (this.savingKey) return false;
    if (this.editingKey !== null) {
      const entry = this.metadataEntries.find(e => e.key === this.editingKey);
      if (entry && this.isEditDirty(entry)) {
        return true;
      }
    }
    if (this.addingEntry && (!!this.draft.key.trim() || !!this.draft.text.trim())) {
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
   * Primary (exact): details.versionId. Fallback (best-effort): any entry with no
   * matching stored versionId (legacy entries, or EE uploads written before the audit
   * carried one) is paired with the still-unclaimed versions in date order — only when
   * the leftovers line up 1:1, so a version is never mis-attributed to the wrong entry.
   */
  private computeVersionMapping() {
    this.versionIdByLog.clear();
    const entries = this.auditLogs
      .filter(log => this.VERSION_CREATING_ACTIONS.includes(log.action) && log.resourceType === 'FILE')
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Exact pass: entries whose stored details.versionId matches a surviving version.
    const usedVersionIds = new Set<string>();
    const unresolved: AuditLog[] = [];
    for (const log of entries) {
      const versionId = log.details?.['versionId'];
      if (versionId && this.versions.some(v => v.versionId === versionId)) {
        this.versionIdByLog.set(log, versionId);
        usedVersionIds.add(versionId);
      } else {
        unresolved.push(log);
      }
    }

    // Fallback: pair each still-unmapped entry with a still-unclaimed version in date
    // order, but only when the leftovers line up 1:1 (avoids mis-attribution). This
    // covers e.g. an UPLOAD_DOCUMENT (v1) whose audit predates the stored versionId
    // while later REPLACE entries already resolved exactly.
    const remainingVersions = this.versions
      .filter(v => !usedVersionIds.has(v.versionId))
      .sort((a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime());
    if (unresolved.length > 0 && unresolved.length === remainingVersions.length) {
      unresolved.forEach((log, i) => this.versionIdByLog.set(log, remainingVersions[i].versionId));
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
      'OPEN_DOCUMENT': 'visibility',
      'DELETE_DOCUMENT_METADATA': 'label_off',
      'SHARE_DOCUMENTS': 'share',
      'RESTORE_FILE': 'restore',
      'RESTORE_FOLDER': 'restore',
      'PERMANENT_DELETE_FILE': 'delete_forever',
      'PERMANENT_DELETE_FOLDER': 'delete_forever',
      'EMPTY_RECYCLE_BIN': 'delete_sweep',
      'WORKFLOW_STARTED': 'play_circle',
      'WORKFLOW_TRANSITIONED': 'arrow_forward',
      'WORKFLOW_COMPLETED': 'check_circle',
      'WORKFLOW_CANCELLED': 'cancel',
      'WORKFLOW_TASK_REASSIGNED': 'group',
      'WORKFLOW_REVIEWED': 'rate_review',
      'WORKFLOW_ACTION_FAILED': 'error_outline',
      'WORKFLOW_DEFINITION_CREATED': 'design_services',
      'WORKFLOW_DEFINITION_UPDATED': 'design_services',
      'WORKFLOW_DEFINITION_DELETED': 'design_services'
    };
    return icons[action] || 'history';
  }

  getAuditActionColor(action: string): string {
    // An action the workflow could not carry out must read as a problem, not as history.
    if (action.includes('FAILED')) return 'warn';
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

    const locale = appLocale(this.translate.getCurrentLang());
    return { key: date.toLocaleDateString(locale) + ' ' + date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) };
  }
}
