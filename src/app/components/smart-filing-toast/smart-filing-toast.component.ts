import { Component, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';

/** Data of the "X filed · Y left in place" toast — a snackbar with two actions (Undo + Show). */
export interface SmartFilingToastData {
  filed: number;
  left: number;
  /** Undo is only offered when something was actually moved. */
  canUndo: boolean;
  onUndo: () => void;
  onShow: () => void;
}

/**
 * Result toast of an upload's smart filing. Material's snackbar takes a single action label,
 * and this one needs two ("Undo" + "Show"), hence a component. Dedicated file so the enterprise
 * fork can take it as-is.
 */
@Component({
  selector: 'app-smart-filing-toast',
  standalone: true,
  imports: [MatButtonModule, TranslatePipe],
  template: `
    <div class="smart-filing-toast">
      <span class="message">{{ 'smartFiling.toast.done' | translate:{ filed: data.filed, left: data.left } }}</span>
      <span class="actions">
        @if (data.canUndo) {
          <button mat-button class="toast-action" (click)="undo()">{{ 'smartFiling.toast.undo' | translate }}</button>
        }
        <button mat-button class="toast-action" (click)="show()">{{ 'smartFiling.toast.show' | translate }}</button>
      </span>
    </div>
  `,
  styles: [`
    .smart-filing-toast { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .message { flex: 1 1 auto; }
    .actions { display: flex; gap: 4px; flex: 0 0 auto; }
    .toast-action { color: var(--mat-snack-bar-button-color, #a5b4fc); font-weight: 600; }
  `]
})
export class SmartFilingToastComponent {
  readonly data = inject<SmartFilingToastData>(MAT_SNACK_BAR_DATA);
  private snackBarRef = inject(MatSnackBarRef<SmartFilingToastComponent>);

  undo(): void {
    this.snackBarRef.dismiss();
    this.data.onUndo();
  }

  show(): void {
    this.snackBarRef.dismiss();
    this.data.onShow();
  }
}
