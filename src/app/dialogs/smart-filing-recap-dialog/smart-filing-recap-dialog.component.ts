import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { FilingOutcome } from '../../models/smart-filing.models';

/**
 * What the recap needs from the service. Callbacks rather than the service itself: the service
 * opens this dialog, so injecting it here would close an import cycle — the same reason the
 * result toast takes its actions as functions.
 */
export interface SmartFilingRecapDialogData {
  /** Every document of the upload batch, filed or not. */
  items: FilingOutcome[];
  /** Move one document back where it came from; emits the updated outcome. */
  undoOne: (item: FilingOutcome) => Observable<FilingOutcome>;
  /**
   * Move back the documents given — the ones still filed at the moment the button is pressed,
   * never the batch as it was: rows undone one by one must not be moved a second time.
   */
  undoAll: (items: FilingOutcome[]) => Observable<unknown>;
  /** Show one document in the explorer (closes the dialog). */
  openDocument: (documentId: string) => void;
}

/** One destination folder and what went into it; `null` path = the documents that stayed put. */
interface RecapGroup {
  path: string | null;
  items: FilingOutcome[];
}

/**
 * Where an upload batch actually went. The result toast only ever said "X filed · Y left in
 * place", and its "Show" could open a document only when exactly one had been filed — with a
 * batch the user had no way of learning which file landed in which folder. This lists them,
 * grouped by destination, and lets any single one be moved back.
 *
 * Dedicated file so the enterprise fork can take it as-is.
 */
@Component({
  selector: 'app-smart-filing-recap-dialog',
  standalone: true,
  templateUrl: './smart-filing-recap-dialog.component.html',
  styleUrls: ['./smart-filing-recap-dialog.component.css'],
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe]
})
export class SmartFilingRecapDialogComponent {
  readonly dialogRef = inject(MatDialogRef<SmartFilingRecapDialogComponent>);
  private readonly data = inject<SmartFilingRecapDialogData>(MAT_DIALOG_DATA);

  /** The outcomes, kept in a signal so an undo updates the row in place. */
  readonly items = signal<FilingOutcome[]>(this.data.items ?? []);
  /** Documents whose undo is in flight — the row's button is disabled meanwhile. */
  readonly undoing = signal<ReadonlySet<string>>(new Set<string>());
  readonly undoingAll = signal(false);

  readonly filed = computed(() => this.items().filter(item => item.status === 'FILED'));
  /** Everything that is not (or no longer) filed — an undone document counts as left in place. */
  readonly left = computed(() => this.items().filter(item => item.status !== 'FILED'));
  readonly canUndoAll = computed(() => this.filed().some(item => !!item.planId) && !this.undoingAll());

  /**
   * The documents by the folder they were moved to, the fullest folder first, then those that
   * never moved. A document moved back keeps its row in the folder it had been filed into, struck
   * through: the undo is then visible where the user just clicked, instead of the row vanishing
   * into another section.
   */
  readonly groups = computed<RecapGroup[]>(() => {
    const byPath = new Map<string, FilingOutcome[]>();
    const stayed: FilingOutcome[] = [];
    for (const item of this.items()) {
      const moved = item.status === 'FILED' || item.status === 'UNDONE';
      if (!moved) {
        stayed.push(item);
        continue;
      }
      const path = item.toPath || '/';
      const bucket = byPath.get(path);
      if (bucket) {
        bucket.push(item);
      } else {
        byPath.set(path, [item]);
      }
    }
    const groups: RecapGroup[] = Array.from(byPath.entries())
      .map(([path, items]) => ({ path, items }))
      .sort((a, b) => b.items.length - a.items.length || a.path!.localeCompare(b.path!));
    if (stayed.length > 0) {
      groups.push({ path: null, items: stayed });
    }
    return groups;
  });

  isUndoing(item: FilingOutcome): boolean {
    return this.undoing().has(item.documentId);
  }

  /** Move one document back; the row becomes "moved back" without reopening the dialog. */
  undo(item: FilingOutcome): void {
    if (!item.planId || this.isUndoing(item)) {
      return;
    }
    this.undoing.update(ids => new Set(ids).add(item.documentId));
    this.data.undoOne(item).subscribe({
      next: updated => this.replace(item.documentId, { ...item, ...updated, status: 'UNDONE' }),
      error: () => this.stopUndoing(item.documentId),
      complete: () => this.stopUndoing(item.documentId)
    });
  }

  undoAll(): void {
    if (!this.canUndoAll()) {
      return;
    }
    const stillFiled = this.filed().filter(item => !!item.planId);
    this.undoingAll.set(true);
    this.data.undoAll(stillFiled).subscribe({
      next: () => {
        const undone = new Set(stillFiled.map(item => item.documentId));
        this.items.update(items => items.map(item =>
          undone.has(item.documentId) ? { ...item, status: 'UNDONE' as const } : item));
      },
      error: () => this.undoingAll.set(false),
      complete: () => this.undoingAll.set(false)
    });
  }

  open(item: FilingOutcome): void {
    this.dialogRef.close();
    this.data.openDocument(item.documentId);
  }

  close(): void {
    this.dialogRef.close();
  }

  private replace(documentId: string, updated: FilingOutcome): void {
    this.items.update(items => items.map(item => item.documentId === documentId ? updated : item));
  }

  private stopUndoing(documentId: string): void {
    this.undoing.update(ids => {
      const next = new Set(ids);
      next.delete(documentId);
      return next;
    });
  }
}
