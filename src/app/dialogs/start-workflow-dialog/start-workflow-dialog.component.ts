import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowDefinitionDTO, WorkflowInstanceDTO, WorkflowState, WorkflowTransition } from '../../models/workflow.models';
import { WorkflowDiagramComponent } from '../../components/workflow-diagram/workflow-diagram.component';
import { validEmail } from '../../utils/workflow-spec';

export interface StartWorkflowDialogData {
  documentId: string;
  documentName: string;
}

export interface StartWorkflowDialogResult {
  success: boolean;
  instance?: WorkflowInstanceDTO;
}

/**
 * "Start workflow" on a document: pick a definition (cards + diagram), name the people the
 * definition asks for ("chosen at start"), leave an optional note, then either just start or
 * start and take one of the first transitions right away.
 */
@Component({
  selector: 'app-start-workflow-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressSpinnerModule, MatTooltipModule, TranslatePipe, WorkflowDiagramComponent],
  templateUrl: './start-workflow-dialog.component.html',
  styleUrls: ['./start-workflow-dialog.component.css']
})
export class StartWorkflowDialogComponent implements OnInit {
  readonly data = inject<StartWorkflowDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<StartWorkflowDialogComponent, StartWorkflowDialogResult>);
  private workflows = inject(WorkflowService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  loading = true;
  definitions: WorkflowDefinitionDTO[] = [];
  selected: WorkflowDefinitionDTO | null = null;
  /** stateKey → typed e-mails for the CHOSEN_AT_START statuses of the selected definition. */
  assignments: Record<string, string> = {};
  comment = '';
  starting = false;

  ngOnInit(): void {
    this.workflows.listDefinitions(true).subscribe({
      next: defs => {
        this.definitions = defs;
        this.loading = false;
        if (defs.length === 1) this.select(defs[0]);
      },
      error: err => {
        this.loading = false;
        this.toastError(err, 'workflow.start.loadError');
      }
    });
  }

  select(def: WorkflowDefinitionDTO): void {
    this.selected = def;
    this.assignments = {};
    this.chosenStates.forEach(s => this.assignments[s.key] = '');
  }

  /** Statuses whose people the starter must name. */
  get chosenStates(): WorkflowState[] {
    return (this.selected?.spec.states ?? []).filter(s => s.kind !== 'END' && s.assignees?.type === 'CHOSEN_AT_START');
  }

  /** The first transitions ("Start & submit for approval"). */
  get startTransitions(): WorkflowTransition[] {
    const start = this.selected?.spec.states.find(s => s.kind === 'START');
    return start?.transitions ?? [];
  }

  get startState(): WorkflowState | undefined {
    return this.selected?.spec.states.find(s => s.kind === 'START');
  }

  emailsOf(stateKey: string): string[] {
    return (this.assignments[stateKey] ?? '').split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(e => e);
  }

  invalidEmailOf(stateKey: string): string | null {
    return this.emailsOf(stateKey).find(e => !validEmail(e)) ?? null;
  }

  get assignmentsComplete(): boolean {
    return this.chosenStates.every(s => this.emailsOf(s.key).length > 0 && !this.invalidEmailOf(s.key));
  }

  needsComment(t: WorkflowTransition | null): boolean {
    return !!t?.requireComment && !this.comment.trim();
  }

  canStart(t: WorkflowTransition | null): boolean {
    return !!this.selected && !this.starting && this.assignmentsComplete && !this.needsComment(t);
  }

  start(transition: WorkflowTransition | null): void {
    if (!this.selected || !this.canStart(transition)) return;
    this.starting = true;
    const assignments: Record<string, string[]> = {};
    this.chosenStates.forEach(s => assignments[s.key] = this.emailsOf(s.key));
    this.workflows.start({
      definitionId: this.selected.id,
      documentId: this.data.documentId,
      assignments,
      transitionKey: transition?.key ?? null,
      comment: this.comment.trim() || null
    }).subscribe({
      next: instance => {
        this.snackBar.open(this.translate.instant('workflow.start.started', { workflow: instance.definitionName, state: instance.currentStateLabel }),
          this.translate.instant('common.close'), { duration: 5000 });
        this.dialogRef.close({ success: true, instance });
      },
      error: err => {
        this.starting = false;
        this.toastError(err, 'workflow.start.startError');
      }
    });
  }

  cancel(): void {
    this.dialogRef.close({ success: false });
  }

  styleClass(t: WorkflowTransition): string {
    return 'style-' + (t.style ?? 'PRIMARY').toLowerCase();
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = WorkflowService.serverMessage(err);
    const msg = this.translate.instant(WorkflowService.errorKey(err, fallback));
    this.snackBar.open(detail ? `${msg} — ${detail}` : msg, this.translate.instant('common.close'), { duration: 6000 });
  }
}
