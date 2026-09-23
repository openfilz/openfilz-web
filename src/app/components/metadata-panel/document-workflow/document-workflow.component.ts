import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { LocalDatePipe } from '../../../i18n/local-date.pipe';
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
import { WorkflowReviewProgressComponent } from '../../workflow-review-progress/workflow-review-progress.component';
import { transitionIcon } from '../../../utils/workflow-spec';

/**
 * "Workflow" section of the details panel for FILE documents: the running instance (status chip
 * and workflow, who it waits for and by when, the previous person's note, the progress of a
 * parallel review, "Your decision" with my transition buttons when I am a candidate, link to the
 * monitor), or a short "no workflow" note with a "Start workflow" button when there is none; then
 * a folded "Past workflows" section: the document's completed / cancelled workflows, newest first,
 * each opening in the monitor. They are only asked for when the user unfolds it — opening the
 * panel costs no extra request. Hidden when the feature is off.
 * Dedicated file for the enterprise fork; the panel only hosts the element.
 */
@Component({
  selector: 'app-document-workflow',
  standalone: true,
  imports: [LocalDatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, TranslatePipe, WorkflowReviewProgressComponent],
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
  /** Past workflows unfolded by the user. */
  historyOpen = false;
  historyLoading = false;
  /** Finished workflows of the document, newest first (at most HISTORY_SIZE); null until first unfolded. */
  history: WorkflowInstanceDTO[] | null = null;
  /** Older finished workflows not listed. */
  historyHidden = 0;
  private static readonly HISTORY_SIZE = 10;
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
    // Another document: fold its history back and forget the previous one's.
    this.historyOpen = false;
    this.historyLoading = false;
    this.history = null;
    this.historyHidden = 0;
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

  /** Unfolds / folds "Past workflows"; the first unfolding of a document fetches them. */
  toggleHistory(): void {
    this.historyOpen = !this.historyOpen;
    if (this.historyOpen && this.history === null && !this.historyLoading) this.loadHistory();
  }

  /** Every instance of the document (any status), keeping the finished ones. */
  private loadHistory(): void {
    const requestId = this.requestId;
    this.historyLoading = true;
    // Over-fetch by one: the running instance, if any, is in the same page.
    const size = DocumentWorkflowComponent.HISTORY_SIZE + 1;
    this.workflows.listInstances({ documentId: this.documentId!, status: null, page: 0, size }).subscribe({
      next: page => {
        if (requestId !== this.requestId) return;
        this.historyLoading = false;
        const running = page.items.filter(i => i.status === 'RUNNING').length;
        const finished = page.items
          .filter(i => i.status !== 'RUNNING')
          .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
        this.history = finished.slice(0, DocumentWorkflowComponent.HISTORY_SIZE);
        this.historyHidden = Math.max(0, page.total - running - this.history.length);
      },
      // The history is a convenience: the running workflow above still works without it.
      error: () => {
        if (requestId !== this.requestId) return;
        this.historyLoading = false;
        this.history = [];
      }
    });
  }

  get waitingFor(): string {
    const task = this.instance?.currentTask;
    if (!task) return '';
    if (task.review) return task.review.pending.join(', ');
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
          // A workflow that just ended joins the history — refreshed only if the user already asked for it.
          if (!this.instance && this.history !== null) this.loadHistory();
          const stillInReview = !!task.review && instance.status === 'RUNNING' && instance.currentStateKey === task.stateKey;
          this.snackBar.open(stillInReview
              ? this.translate.instant('workflow.review.voted')
              : this.translate.instant('workflow.tasks.done', { state: instance.currentStateLabel }),
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
          title: t.label, subtitle: this.instance?.documentName, stateLabel: this.instance?.currentStateLabel, mode: 'comment',
          commentRequired: !!t.requireComment, confirmLabel: t.label, style: t.style, review: !!task.review
        }
      }).afterClosed().subscribe(result => {
        if (result) run(result.comment);
      });
    });
  }

  openMonitor(i: WorkflowInstanceDTO | null = this.instance): void {
    if (i) {
      this.router.navigate(['/workflows'], { queryParams: { tab: 'monitor', instance: i.id } });
    }
  }

  readonly actionIcon = transitionIcon;

  /** First letter of an e-mail, for the note's avatar. */
  initial(who: string | null): string {
    return (who ?? '?').trim().charAt(0) || '?';
  }

  styleClass(t: WorkflowTransition): string {
    return 'style-' + (t.style ?? 'PRIMARY').toLowerCase();
  }
}
