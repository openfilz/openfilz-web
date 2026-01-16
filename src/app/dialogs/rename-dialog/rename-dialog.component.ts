import { Component, inject } from '@angular/core';

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
export class RenameDialogComponent {
  newName: string;

  readonly dialogRef = inject(MatDialogRef<RenameDialogComponent>);
  readonly data = inject<RenameDialogData>(MAT_DIALOG_DATA);

  constructor() {
    this.newName = this.data.name;
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