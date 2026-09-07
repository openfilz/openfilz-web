import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WorkflowService } from '../../../services/workflow.service';
import { WorkflowAccessService } from '../../../services/workflow-access.service';
import { WorkflowInstanceDTO, WorkflowTransition } from '../../../models/workflow.models';

/**
 * "Workflow" section of the details panel for FILE documents: the running instance (status
 * chip, who it waits for, my transition buttons when I am a candidate, link to the monitor),
 * or a "Start workflow" button when there is none. Hidden when the feature is off.
 * Dedicated file for the enterprise fork; the panel only hosts the element.
 */
@Component({
  selector: 'app-document-workflow',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, TranslatePipe],
  templateUrl: './document-workflow.component.html',
  styleUrls: ['./document-workflow.component.css']
})
export class DocumentWorkflowComponent implements OnChanges {
  @Input() documentId?: string;
  @Input() documentType?: string;
  @Input() documentName?: string;
  /** The document may have moved (an on-enter action): the listing should refresh. */
  @Output() changed = new EventEmitter<void>();

  private workflows = inject(WorkflowService);
  private access = inject(WorkflowAccessService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  loading = false;
  instance: WorkflowInstanceDTO | null = null;
  busy = false;
  private requestId = 0;

  get enabled(): boolean {
    return this.access.enabled && this.documentType === 'FILE' && !!this.documentId;
  }

  get canStart(): boolean {
    return this.access.canStart;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['documentId'] || changes['documentType']) {
      this.load();
    }
  }

  load(): void {
    const requestId = ++this.requestId;
    this.instance = null;
    if (!this.enabled) return;
    this.loading = true;
    this.workflows.runningInstanceOf(this.documentId!).subscribe({
      next: instance => {
        if (requestId !== this.requestId) return;
        this.instance = instance;
        this.loading = false;
      },
      error: () => {
        if (requestId === this.requestId) this.loading = false;
      }
    });
  }

  get waitingFor(): string {
    const task = this.instance?.currentTask;
    if (!task) return '';
    if (task.candidateRole) return this.translate.instant('workflow.monitor.anyoneWith', { role: task.candidateRole });
    return task.candidates.join(', ');
  }

  start(): void {
    if (!this.documentId || !this.canStart) return;
    import('../../../dialogs/start-workflow-dialog/start-workflow-dialog.component').then(m => {
      this.dialog.open(m.StartWorkflowDialogComponent, {
        width: '720px', maxWidth: '96vw', maxHeight: '92dvh', autoFocus: false,
        data: { documentId: this.documentId, documentName: this.documentName ?? '' }
      }).afterClosed().subscribe(result => {
        if (result?.success) {
          this.load();
          this.changed.emit();
        }
      });
    });
  }

  act(t: WorkflowTransition): void {
    const task = this.instance?.currentTask;
    if (!task || this.busy) return;
    const run = (comment: string | null) => {
      this.busy = true;
      this.workflows.complete(task.id, { transitionKey: t.key, comment }).subscribe({
        next: instance => {
          this.busy = false;
          this.instance = instance.status === 'RUNNING' ? instance : null;
          this.snackBar.open(this.translate.instant('workflow.tasks.done', { state: instance.currentStateLabel }),
            this.translate.instant('common.close'), { duration: 4000 });
          this.changed.emit();
        },
        error: err => {
          this.busy = false;
          const detail = WorkflowService.serverMessage(err);
          const msg = this.translate.instant(WorkflowService.errorKey(err));
          this.snackBar.open(detail ? `${msg} — ${detail}` : msg, this.translate.instant('common.close'), { duration: 6000 });
          this.load();
        }
      });
    };
    import('../../../dialogs/workflow-decision-dialog/workflow-decision-dialog.component').then(m => {
      this.dialog.open(m.WorkflowDecisionDialogComponent, {
        width: '520px', maxWidth: '96vw', autoFocus: false,
        data: {
          title: t.label, subtitle: this.instance?.documentName, mode: 'comment', commentRequired: !!t.requireComment,
          confirmLabel: t.label, danger: t.style === 'DANGER'
        }
      }).afterClosed().subscribe(result => {
        if (result) run(result.comment);
      });
    });
  }

  openMonitor(): void {
    if (this.instance) {
      this.router.navigate(['/workflows'], { queryParams: { tab: 'monitor', instance: this.instance.id } });
    }
  }

  styleClass(t: WorkflowTransition): string {
    return 'style-' + (t.style ?? 'PRIMARY').toLowerCase();
  }
}
