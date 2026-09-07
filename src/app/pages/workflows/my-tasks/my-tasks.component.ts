import { Component, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WorkflowService } from '../../../services/workflow.service';
import { WorkflowTaskDTO, WorkflowTransition } from '../../../models/workflow.models';
import { FileIconService } from '../../../services/file-icon.service';

/**
 * "My tasks": one card per open task the user may act on, overdue first, with the transition
 * buttons right on the card. A transition that requires a comment (or the "Add a note" link)
 * opens the decision dialog. Done tasks leave the list and the badge follows.
 */
@Component({
  selector: 'app-workflow-my-tasks',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatMenuModule, MatProgressSpinnerModule, MatTooltipModule, TranslatePipe],
  templateUrl: './my-tasks.component.html',
  styleUrls: ['./my-tasks.component.css']
})
export class MyTasksComponent implements OnInit, OnChanges {
  @Input() highlightTaskId: string | null = null;

  private workflows = inject(WorkflowService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private fileIcons = inject(FileIconService);

  loading = true;
  tasks: WorkflowTaskDTO[] = [];
  busy = new Set<string>();

  ngOnInit(): void {
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['highlightTaskId'] && this.highlightTaskId) {
      setTimeout(() => document.getElementById('task-' + this.highlightTaskId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }

  reload(): void {
    this.loading = true;
    this.workflows.myTasks().subscribe({
      next: tasks => {
        this.tasks = tasks;
        this.loading = false;
        this.workflows.refreshMyTasksCount();
      },
      error: err => {
        this.loading = false;
        this.toastError(err, 'workflow.errors.generic');
      }
    });
  }

  get overdueCount(): number {
    return this.tasks.filter(t => t.overdue).length;
  }

  icon(task: WorkflowTaskDTO): string {
    return this.fileIcons.getFileIcon(task.documentName, 'FILE') || 'description';
  }

  openDocument(task: WorkflowTaskDTO): void {
    this.router.navigate(['/my-folder'], { queryParams: { targetFileId: task.documentId } });
  }

  openInstance(task: WorkflowTaskDTO): void {
    this.router.navigate(['/workflows'], { queryParams: { tab: 'monitor', instance: task.instanceId } });
  }

  waitingFor(task: WorkflowTaskDTO): string {
    if (task.candidateRole) return this.translate.instant('workflow.monitor.anyoneWith', { role: task.candidateRole });
    return task.candidates.join(', ');
  }

  /** Direct button: asks for a comment only when the transition requires one. */
  act(task: WorkflowTaskDTO, t: WorkflowTransition): void {
    if (t.requireComment) {
      this.actWithDialog(task, t);
    } else {
      this.complete(task, t, null);
    }
  }

  /** "With a note…" menu entry: always asks for a comment. */
  actWithDialog(task: WorkflowTaskDTO, t: WorkflowTransition): void {
    import('../../../dialogs/workflow-decision-dialog/workflow-decision-dialog.component').then(m => {
      this.dialog.open(m.WorkflowDecisionDialogComponent, {
        width: '520px', maxWidth: '96vw', autoFocus: false,
        data: { title: t.label, subtitle: task.documentName, mode: 'comment', commentRequired: !!t.requireComment, confirmLabel: t.label, danger: t.style === 'DANGER' }
      }).afterClosed().subscribe(result => {
        if (result) this.complete(task, t, result.comment);
      });
    });
  }

  reassign(task: WorkflowTaskDTO): void {
    import('../../../dialogs/workflow-decision-dialog/workflow-decision-dialog.component').then(m => {
      this.dialog.open(m.WorkflowDecisionDialogComponent, {
        width: '520px', maxWidth: '96vw', autoFocus: false,
        data: {
          title: this.translate.instant('workflow.decision.reassignTitle'), subtitle: task.documentName, mode: 'emails',
          confirmLabel: this.translate.instant('workflow.tasks.reassign'), confirmIcon: 'group', initialEmails: task.candidates
        }
      }).afterClosed().subscribe(result => {
        if (!result?.emails?.length) return;
        this.busy.add(task.id);
        this.workflows.reassign(task.id, { emails: result.emails, comment: result.comment }).subscribe({
          next: () => {
            this.busy.delete(task.id);
            this.snackBar.open(this.translate.instant('workflow.tasks.reassigned'), this.translate.instant('common.close'), { duration: 4000 });
            this.reload();
          },
          error: err => { this.busy.delete(task.id); this.toastError(err, 'workflow.errors.generic'); }
        });
      });
    });
  }

  private complete(task: WorkflowTaskDTO, t: WorkflowTransition, comment: string | null): void {
    this.busy.add(task.id);
    this.workflows.complete(task.id, { transitionKey: t.key, comment }).subscribe({
      next: instance => {
        this.busy.delete(task.id);
        this.tasks = this.tasks.filter(x => x.id !== task.id);
        const next = instance.currentTask?.mine ? instance.currentTask : null;
        if (next) this.tasks = [next, ...this.tasks];
        this.snackBar.open(this.translate.instant('workflow.tasks.done', { state: instance.currentStateLabel }),
          this.translate.instant('common.close'), { duration: 4000 });
      },
      error: err => {
        this.busy.delete(task.id);
        this.toastError(err, 'workflow.errors.generic');
        this.reload();
      }
    });
  }

  styleClass(t: WorkflowTransition): string {
    return 'style-' + (t.style ?? 'PRIMARY').toLowerCase();
  }

  trackTask(_: number, t: WorkflowTaskDTO): string {
    return t.id;
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = WorkflowService.serverMessage(err);
    const msg = this.translate.instant(WorkflowService.errorKey(err, fallback));
    this.snackBar.open(detail ? `${msg} — ${detail}` : msg, this.translate.instant('common.close'), { duration: 6000 });
  }
}
