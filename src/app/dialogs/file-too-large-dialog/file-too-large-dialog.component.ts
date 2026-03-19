import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DocumentApiService } from '../../services/document-api.service';
import { saveAs } from 'file-saver';

export interface FileTooLargeDialogData {
  fileName: string;
  documentId: string;
  isPdf: boolean;
  maxSizeMB: number;
}

@Component({
  selector: 'app-file-too-large-dialog',
  standalone: true,
  templateUrl: './file-too-large-dialog.component.html',
  styleUrls: ['./file-too-large-dialog.component.css'],
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    TranslatePipe
  ],
})
export class FileTooLargeDialogComponent {
  readonly dialogRef = inject(MatDialogRef<FileTooLargeDialogComponent>);
  readonly data = inject<FileTooLargeDialogData>(MAT_DIALOG_DATA);
  private documentApi = inject(DocumentApiService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  downloading = false;

  openInNewTab() {
    this.documentApi.downloadDocument(this.data.documentId).subscribe({
      next: (blob) => {
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.dialogRef.close();
      },
      error: () => this.snackBar.open(
        this.translate.instant('errors.downloadFailed'),
        this.translate.instant('common.close'),
        { duration: 3000 }
      )
    });
  }

  download() {
    this.downloading = true;
    this.documentApi.downloadDocument(this.data.documentId).subscribe({
      next: (blob) => {
        saveAs(blob, this.data.fileName);
        this.downloading = false;
        this.dialogRef.close();
      },
      error: () => {
        this.downloading = false;
        this.snackBar.open(
          this.translate.instant('errors.downloadFailed'),
          this.translate.instant('common.close'),
          { duration: 3000 }
        );
      }
    });
  }

  close() {
    this.dialogRef.close();
  }
}
