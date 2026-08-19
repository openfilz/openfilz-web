import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from "@angular/material/icon";
import { TranslatePipe } from '@ngx-translate/core';
import { A11yModule } from '@angular/cdk/a11y';

export interface RenameDialogData {
  name: string;
  type: 'FILE' | 'FOLDER';
}

@Component({
  selector: 'app-rename-dialog',
  standalone: true,
  templateUrl: './rename-dialog.component.html',
  styleUrls: ['./rename-dialog.component.css'],
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
    MatIconModule,
    TranslatePipe,
    A11yModule
],
})
export class RenameDialogComponent implements AfterViewInit {
  newName: string;

  @ViewChild('nameInput') nameInput!: ElementRef<HTMLInputElement>;

  readonly dialogRef = inject(MatDialogRef<RenameDialogComponent>);
  readonly data = inject<RenameDialogData>(MAT_DIALOG_DATA);

  constructor() {
    this.newName = this.data.name;
  }

  ngAfterViewInit() {
    // For files, select only the filename part (before extension) so user can rename without losing the extension
    // For folders, select the entire name
    setTimeout(() => {
      const input = this.nameInput?.nativeElement;
      if (input) {
        if (this.data.type === 'FILE') {
          const dotIndex = this.newName.lastIndexOf('.');
          if (dotIndex > 0) {
            input.setSelectionRange(0, dotIndex);
          } else {
            input.select();
          }
        } else {
          input.select();
        }
      }
    });
  }

  onRename() {
    if (this.newName?.trim() && this.newName.trim() !== this.data.name) {
      this.dialogRef.close(this.newName.trim());
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}