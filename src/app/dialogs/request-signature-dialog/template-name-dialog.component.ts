import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';

export interface TemplateNameDialogData {
  name?: string;
}

/** Tiny prompt used by "Save as template" / "Rename template". Resolves with the trimmed name or undefined. */
@Component({
  selector: 'app-template-name-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'signature.templates.nameTitle' | translate }}</h2>
    <div mat-dialog-content>
      <mat-form-field appearance="outline" class="ff">
        <mat-label>{{ 'signature.templates.name' | translate }}</mat-label>
        <input matInput [(ngModel)]="name" maxlength="255" cdkFocusInitial
               (keydown.enter)="save()" [attr.aria-label]="'signature.templates.name' | translate">
      </mat-form-field>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="ref.close()">{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button color="primary" type="button" [disabled]="!name.trim()" (click)="save()">
        {{ 'common.save' | translate }}
      </button>
    </div>
  `,
  styles: [`
    .ff { width: 100%; min-width: 280px; }
    [mat-dialog-content] { padding-top: 8px; }
  `]
})
export class TemplateNameDialogComponent {
  readonly ref = inject(MatDialogRef<TemplateNameDialogComponent, string | undefined>);
  private readonly data = inject<TemplateNameDialogData>(MAT_DIALOG_DATA, { optional: true });
  name = this.data?.name ?? '';

  save(): void {
    if (this.name.trim()) this.ref.close(this.name.trim());
  }
}
