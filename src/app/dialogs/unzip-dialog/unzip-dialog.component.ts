import { Component, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { A11yModule } from '@angular/cdk/a11y';
import { FileItem, UnzipRequest, UnzipResponse } from '../../models/document.models';
import { DocumentApiService } from '../../services/document-api.service';
import { FolderTreeDialogComponent } from '../folder-tree-dialog/folder-tree-dialog.component';

export interface UnzipDialogData {
  /** The ZIP document to extract. */
  zip: FileItem;
  /**
   * Set by listings that show the ZIP's own folder (the file explorer): the "current folder"
   * option is then labelled with it. `name` undefined = the root; `writable: false` disables the
   * options that write into it. Absent elsewhere (search, favorites), where the option reads
   * "the folder containing the ZIP".
   */
  currentFolder?: { name?: string; writable?: boolean };
}

export type UnzipDestination = 'current' | 'new' | 'pick';

/**
 * Asks where to extract a ZIP — its own folder, a new folder created there, or any folder the
 * user may write into — then runs the extraction (server-side) and closes with its
 * {@link UnzipResponse}. Errors stay in the dialog so the user can adjust and retry.
 */
@Component({
  selector: 'app-unzip-dialog',
  standalone: true,
  templateUrl: './unzip-dialog.component.html',
  styleUrls: ['./unzip-dialog.component.css'],
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    FormsModule,
    TranslatePipe,
    A11yModule
  ],
})
export class UnzipDialogComponent {
  readonly dialogRef = inject(MatDialogRef<UnzipDialogComponent, UnzipResponse>);
  readonly data: UnzipDialogData = inject(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);
  private readonly documentApi = inject(DocumentApiService);

  /** False when the listing knows its folder is read-only for this user. */
  readonly currentWritable = this.data.currentFolder?.writable !== false;
  destination: UnzipDestination = this.currentWritable ? 'current' : 'pick';
  newFolderName = this.data.zip.name.replace(/\.zip$/i, '');
  /** Folder picked in the tree: id, or null for the root; undefined = none picked yet. */
  pickedFolderId?: string | null;
  pickedFolderName?: string;

  extracting = false;
  /** i18n key of the last error, with its params. */
  errorKey?: string;
  errorParams?: Record<string, unknown>;

  get canExtract(): boolean {
    if (this.extracting) return false;
    if (this.destination === 'new') return !!this.newFolderName.trim() && !this.newFolderName.includes('/');
    if (this.destination === 'pick') return this.pickedFolderId !== undefined;
    return true;
  }

  chooseFolder(): void {
    this.destination = 'pick';
    const ref = this.dialog.open(FolderTreeDialogComponent, {
      width: '700px',
      data: { title: 'dialogs.unzip.chooseFolder', actionType: 'copy', excludeIds: [], writableOnly: true }
    });
    ref.afterClosed().subscribe((folderId: string | null | undefined) => {
      if (folderId === undefined) return;
      this.pickedFolderId = folderId;
      this.pickedFolderName = undefined;
      if (folderId) {
        this.documentApi.getDocumentInfo(folderId).subscribe({
          next: info => this.pickedFolderName = info.name,
          error: () => this.pickedFolderName = undefined
        });
      }
    });
  }

  onExtract(): void {
    if (!this.canExtract) return;
    this.extracting = true;
    this.errorKey = undefined;
    this.documentApi.unzipFile(this.data.zip.id, this.buildRequest()).subscribe({
      next: response => {
        this.extracting = false;
        this.dialogRef.close(response);
      },
      error: (err: HttpErrorResponse) => {
        this.extracting = false;
        this.setError(err);
      }
    });
  }

  onCancel(): void {
    if (!this.extracting) {
      this.dialogRef.close();
    }
  }

  private buildRequest(): UnzipRequest {
    switch (this.destination) {
      case 'new':
        return { newFolderName: this.newFolderName.trim() };
      case 'pick':
        return this.pickedFolderId ? { targetFolderId: this.pickedFolderId } : { targetRoot: true };
      default:
        return {};
    }
  }

  private setError(err: HttpErrorResponse): void {
    const message: string = typeof err.error?.message === 'string' ? err.error.message : '';
    const code = message.split(':')[0];
    this.errorParams = undefined;
    switch (err.status) {
      case 409:
        this.errorKey = 'dialogs.unzip.errors.folderExists';
        this.errorParams = { name: this.newFolderName.trim() };
        return;
      case 404:
        this.errorKey = 'dialogs.unzip.errors.notFound';
        return;
      case 403:
        this.errorKey = 'dialogs.unzip.errors.forbidden';
        return;
      case 507:
        this.errorKey = 'dialogs.unzip.errors.quota';
        return;
    }
    switch (code) {
      case 'ZIP_TOO_MANY_ENTRIES':
        this.errorKey = 'dialogs.unzip.errors.tooManyEntries';
        return;
      case 'ZIP_TOO_LARGE':
        this.errorKey = 'dialogs.unzip.errors.tooLarge';
        return;
      case 'ZIP_BOMB':
        this.errorKey = 'dialogs.unzip.errors.suspicious';
        return;
      case 'NOT_A_ZIP':
      case 'ZIP_INVALID':
        this.errorKey = 'dialogs.unzip.errors.invalid';
        return;
      default:
        this.errorKey = 'dialogs.unzip.errors.generic';
    }
  }
}
