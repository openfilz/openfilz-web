import { Component, inject, OnInit } from '@angular/core';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { A11yModule } from '@angular/cdk/a11y';
import { DocumentTemplateType } from '../../models/document.models';

export interface CreateDocumentDialogData {
  documentType: DocumentTemplateType;
}

export interface CreateDocumentDialogResult {
  name: string;
  documentType: DocumentTemplateType;
}

@Component({
  selector: 'app-create-document-dialog',
  standalone: true,
  templateUrl: './create-document-dialog.component.html',
  styleUrls: ['./create-document-dialog.component.css'],
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    FormsModule,
    TranslatePipe,
    A11yModule
  ],
})
export class CreateDocumentDialogComponent implements OnInit {
  documentName = '';

  readonly dialogRef = inject(MatDialogRef<CreateDocumentDialogComponent>);
  readonly data = inject<CreateDocumentDialogData>(MAT_DIALOG_DATA);

  ngOnInit() {
    // Set default name based on document type
    this.documentName = this.getDefaultName();
  }

  getDefaultName(): string {
    switch (this.data.documentType) {
      case 'WORD':
        return 'Untitled Document.docx';
      case 'EXCEL':
        return 'Untitled Spreadsheet.xlsx';
      case 'POWERPOINT':
        return 'Untitled Presentation.pptx';
      case 'TEXT':
        return 'Untitled.txt';
    }
  }

  getIcon(): string {
    switch (this.data.documentType) {
      case 'WORD':
        return 'description';
      case 'EXCEL':
        return 'table_chart';
      case 'POWERPOINT':
        return 'slideshow';
      case 'TEXT':
        return 'article';
    }
  }

  getTitleKey(): string {
    return 'dialogs.createDocument.title';
  }

  getSubtitleKey(): string {
    switch (this.data.documentType) {
      case 'WORD':
        return 'dialogs.createDocument.subtitleWord';
      case 'EXCEL':
        return 'dialogs.createDocument.subtitleExcel';
      case 'POWERPOINT':
        return 'dialogs.createDocument.subtitlePowerpoint';
      case 'TEXT':
        return 'dialogs.createDocument.subtitleText';
    }
  }

  getExtension(): string {
    switch (this.data.documentType) {
      case 'WORD':
        return '.docx';
      case 'EXCEL':
        return '.xlsx';
      case 'POWERPOINT':
        return '.pptx';
      case 'TEXT':
        return '.txt';
    }
  }

  onCreate() {
    if (this.documentName?.trim()) {
      let name = this.documentName.trim();
      const extension = this.getExtension();

      // Ensure correct extension
      if (!name.toLowerCase().endsWith(extension)) {
        name = name + extension;
      }

      const result: CreateDocumentDialogResult = {
        name,
        documentType: this.data.documentType
      };
      this.dialogRef.close(result);
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
