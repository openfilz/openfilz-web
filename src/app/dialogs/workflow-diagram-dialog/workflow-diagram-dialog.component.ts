import { Component, HostListener, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { WorkflowDiagramComponent } from '../../components/workflow-diagram/workflow-diagram.component';
import { WorkflowSpec } from '../../models/workflow.models';

export interface WorkflowDiagramDialogData {
  spec: WorkflowSpec | null;
  /** Shown as the dialog title — typically the workflow name. */
  title?: string | null;
  currentStateKey?: string | null;
  selectedStateKey?: string | null;
  /** `${fromKey}:${transitionKey}` of the transitions already taken (drawn bold). */
  taken?: string[];
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const STEP = 1.25;

/**
 * A big, zoomable look at a workflow diagram — the designer preview and the monitor timeline are
 * too narrow to read a wide workflow. The picture is drawn at a fixed scale (100 % = its natural
 * size) inside a scrolling box; zoom with the buttons, Ctrl/⌘+wheel or +/-/0.
 * Closes with the clicked status key so the caller can jump to it, or undefined.
 * Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-workflow-diagram-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe, WorkflowDiagramComponent],
  templateUrl: './workflow-diagram-dialog.component.html',
  styleUrls: ['./workflow-diagram-dialog.component.css']
})
export class WorkflowDiagramDialogComponent {
  readonly data = inject<WorkflowDiagramDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<WorkflowDiagramDialogComponent, string | undefined>);

  scale = 1;

  get percent(): number {
    return Math.round(this.scale * 100);
  }

  get canZoomIn(): boolean {
    return this.scale < MAX_SCALE;
  }

  get canZoomOut(): boolean {
    return this.scale > MIN_SCALE;
  }

  zoomIn(): void {
    this.setScale(this.scale * STEP);
  }

  zoomOut(): void {
    this.setScale(this.scale / STEP);
  }

  reset(): void {
    this.scale = 1;
  }

  /** Ctrl/⌘+wheel zooms; a plain wheel keeps scrolling the box. */
  onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (event.deltaY < 0) this.zoomIn(); else this.zoomOut();
  }

  /* The dialog is modal, so a document-level listener only ever sees this dialog's keys —
     and unlike a host listener it fires wherever Material parked the initial focus. */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === '+' || event.key === '=') this.zoomIn();
    else if (event.key === '-') this.zoomOut();
    else if (event.key === '0') this.reset();
    else return;
    event.preventDefault();
  }

  pick(stateKey: string): void {
    this.dialogRef.close(stateKey);
  }

  close(): void {
    this.dialogRef.close();
  }

  private setScale(value: number): void {
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 100) / 100));
  }
}
