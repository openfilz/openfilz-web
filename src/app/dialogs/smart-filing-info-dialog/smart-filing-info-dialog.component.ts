import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

export interface SmartFilingInfoDialogData {
  /** The deployment offers the Inbox folder to this user: the scope rule mentions it. */
  inboxAvailable: boolean;
}

/**
 * "How smart filing works", opened from the info button next to the filing switches: who the
 * switches apply to, where a document may go (the folder it was uploaded into and its sub-folders,
 * the whole library from the root or the Inbox), when a folder may be created, when a document
 * stays put and how to move it back. A dialog rather than a tooltip so it also reads on touch
 * screens. Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-smart-filing-info-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './smart-filing-info-dialog.component.html',
  styleUrls: ['./smart-filing-info-dialog.component.css']
})
export class SmartFilingInfoDialogComponent {
  private dialogRef = inject(MatDialogRef<SmartFilingInfoDialogComponent>);
  data = inject<SmartFilingInfoDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? { inboxAvailable: false };

  close(): void {
    this.dialogRef.close();
  }
}
