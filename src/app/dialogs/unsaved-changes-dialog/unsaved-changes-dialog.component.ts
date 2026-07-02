import { Component, inject } from '@angular/core';

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

/** Outcome of the unsaved-metadata confirmation dialog. */
export type UnsavedChangesResult = 'save' | 'discard';

/**
 * Shown before the metadata properties panel closes (or switches to another
 * document) while an inline metadata add/edit is still pending. Lets the user
 * save or discard the change, or dismiss to keep editing (returns undefined).
 */
@Component({
  selector: 'app-unsaved-changes-dialog',
  standalone: true,
  templateUrl: './unsaved-changes-dialog.component.html',
  styleUrls: ['./unsaved-changes-dialog.component.css'],
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    TranslatePipe
  ]
})
export class UnsavedChangesDialogComponent {
  readonly dialogRef = inject(MatDialogRef<UnsavedChangesDialogComponent, UnsavedChangesResult | undefined>);

  onSave() {
    this.dialogRef.close('save');
  }

  onDiscard() {
    this.dialogRef.close('discard');
  }

  onKeepEditing() {
    this.dialogRef.close(undefined);
  }
}
