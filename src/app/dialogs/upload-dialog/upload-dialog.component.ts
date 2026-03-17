import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { FileIconService } from '../../services/file-icon.service';

export interface UploadDialogData {
  files: File[];
  parentFolderId?: string;
}

export interface UploadDialogResult {
  files: File[];
  allowDuplicates: boolean;
}

@Component({
  selector: 'app-upload-dialog',
  standalone: true,
  templateUrl: './upload-dialog.component.html',
  styleUrls: ['./upload-dialog.component.css'],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatListModule,
    MatCheckboxModule,
    FormsModule
  ],
})
export class UploadDialogComponent {
  files: File[] = [];
  totalSize: number = 0;
  allowDuplicates: boolean = false;

  readonly dialogRef = inject(MatDialogRef<UploadDialogComponent>);
  readonly data = inject<UploadDialogData>(MAT_DIALOG_DATA);
  private fileIconService = inject(FileIconService);

  constructor() {
    this.files = this.data.files;
    this.totalSize = this.files.reduce((sum, file) => sum + file.size, 0);
  }

  removeFile(index: number) {
    this.files.splice(index, 1);
    this.totalSize = this.files.reduce((sum, file) => sum + file.size, 0);

    if (this.files.length === 0) {
      this.dialogRef.close();
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  getFileIcon(file: File): string {
    return this.fileIconService.getFileIcon(file.name, 'FILE');
  }

  getFileColor(file: File): string {
    return this.fileIconService.getFileColor(file.name, 'FILE');
  }

  onCancel() {
    this.dialogRef.close();
  }

  onUpload() {
    const result: UploadDialogResult = {
      files: this.files,
      allowDuplicates: this.allowDuplicates
    };

    this.dialogRef.close(result);
  }

  get canUpload(): boolean {
    return this.files.length > 0;
  }
}
