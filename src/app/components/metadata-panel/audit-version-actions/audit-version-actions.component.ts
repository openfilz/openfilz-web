import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';

import { ConfirmDialogComponent, ConfirmDialogData } from '../../../dialogs/confirm-dialog/confirm-dialog.component';
import { FileViewerDialogComponent } from '../../../dialogs/file-viewer-dialog/file-viewer-dialog.component';
import { DocumentVersionInfo, RestoreVersionResponse } from '../../../models/document-versions.models';
import { DocumentVersionsService } from '../../../services/document-versions.service';
import { RoleService } from '../../../services/role.service';
import { isPreviewableVersion } from '../../../utils/viewer-mode.util';

/**
 * View / Download / Restore actions for one version-creating audit entry
 * (UPLOAD_DOCUMENT, REPLACE_DOCUMENT_CONTENT, RESTORE_DOCUMENT_VERSION) in the
 * metadata-panel audit timeline. Renders nothing when the versioning flag is off
 * or the entry could not be mapped to a surviving storage version.
 */
@Component({
  selector: 'app-audit-version-actions',
  standalone: true,
  templateUrl: './audit-version-actions.component.html',
  styleUrls: ['./audit-version-actions.component.css'],
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslatePipe
  ]
})
export class AuditVersionActionsComponent {
  @Input({ required: true }) documentId!: string;
  /** versionId this audit entry maps to (details.versionId, or legacy index pairing) */
  @Input({ required: true }) versionId!: string;
  @Input({ required: true }) versions: DocumentVersionInfo[] = [];
  @Input() fileName?: string;
  @Input() contentType?: string;
  @Output() restored = new EventEmitter<RestoreVersionResponse>();

  busy: boolean = false;

  private documentVersionsService = inject(DocumentVersionsService);
  private roleService = inject(RoleService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  /** The surviving storage version this entry refers to (undefined → render nothing) */
  get version(): DocumentVersionInfo | undefined {
    return this.versions.find(v => v.versionId === this.versionId);
  }

  get visible(): boolean {
    return this.documentVersionsService.isVersioningEnabled() && !!this.version;
  }

  get canView(): boolean {
    return isPreviewableVersion(this.fileName, this.contentType);
  }

  /** Restore makes no sense on the entry that IS the current latest version */
  get canRestore(): boolean {
    const version = this.version;
    return !!version && !version.latest && this.roleService.hasRole('CONTRIBUTOR');
  }

  get versionDate(): string {
    const version = this.version;
    return version ? new Date(version.lastModified).toLocaleString() : '';
  }

  /** 1-based version number, oldest = v1 (position in the ascending version history) */
  get versionNumber(): number {
    const version = this.version;
    if (!version) return 0;
    return this.versions.slice()
      .sort((a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime())
      .findIndex(v => v.versionId === version.versionId) + 1;
  }

  view() {
    const version = this.version;
    if (!version) return;
    this.dialog.open(FileViewerDialogComponent, {
      width: '95vw',
      height: '95vh',
      maxWidth: '1400px',
      maxHeight: '900px',
      panelClass: 'file-viewer-dialog-container',
      data: {
        documentId: this.documentId,
        fileName: this.fileName || '',
        contentType: this.contentType || '',
        fileSize: version.size,
        versionId: version.versionId,
        versionLabel: this.versionDate
      }
    });
  }

  download() {
    const version = this.version;
    if (!version) return;
    this.busy = true;
    this.documentVersionsService.downloadVersion(this.documentId, version.versionId).subscribe({
      next: (blob) => {
        saveAs(blob, this.versionedFileName(version));
        this.busy = false;
      },
      error: () => {
        this.busy = false;
        this.snackBar.open(this.translate.instant('versions.downloadError'),
          this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  restore() {
    const version = this.version;
    if (!version || !this.canRestore) return;

    const dialogData: ConfirmDialogData = {
      title: this.translate.instant('versions.restoreConfirmTitle'),
      message: this.translate.instant('versions.restoreConfirmMessage', { date: this.versionDate }),
      type: 'warning',
      confirmText: this.translate.instant('versions.restore'),
      cancelText: this.translate.instant('common.cancel'),
      icon: 'settings_backup_restore'
    };
    this.dialog.open(ConfirmDialogComponent, { width: '450px', data: dialogData })
      .afterClosed().subscribe(confirmed => {
        if (!confirmed) return;
        this.busy = true;
        this.documentVersionsService.restoreVersion(this.documentId, version.versionId).subscribe({
          next: (response) => {
            this.busy = false;
            this.snackBar.open(this.translate.instant('versions.restoreSuccess'),
              this.translate.instant('common.close'), { duration: 3000 });
            this.restored.emit(response);
          },
          error: () => {
            this.busy = false;
            this.snackBar.open(this.translate.instant('versions.restoreError'),
              this.translate.instant('common.close'), { duration: 3000 });
          }
        });
      });
  }

  /**
   * Suggested download name: stem + version timestamp suffix, so multiple
   * downloaded versions of the same file don't collide (no ':' — Windows-safe).
   */
  private versionedFileName(version: DocumentVersionInfo): string {
    const name = this.fileName || 'document';
    const date = new Date(version.lastModified);
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}`;
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0) {
      return `${name} (${stamp})`;
    }
    return `${name.substring(0, lastDot)} (${stamp})${name.substring(lastDot)}`;
  }
}
