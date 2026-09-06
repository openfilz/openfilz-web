import { Component, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WorkflowService } from '../../../services/workflow.service';
import {
  WorkflowDefinitionDTO, WorkflowEventDTO, WorkflowInstanceDTO, WorkflowInstanceDetailDTO, WorkflowInstanceStatus, WorkflowSummaryDTO
} from '../../../models/workflow.models';
import { WorkflowDiagramComponent } from '../../../components/workflow-diagram/workflow-diagram.component';
import { ConfirmDialogComponent } from '../../../dialogs/confirm-dialog/confirm-dialog.component';

/**
 * "Monitor": counters, filters, the instance table and a side drawer with the diagram (current
 * status highlighted, taken transitions bold), the open task, the timeline and the
 * reassign / cancel actions.
 */
@Component({
  selector: 'app-workflow-monitor',
  standalone: true,
  imports: [DatePipe, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatPaginatorModule, MatProgressSpinnerModule,
    MatSelectModule, MatSlideToggleModule, MatTableModule, MatTooltipModule, TranslatePipe, WorkflowDiagramComponent],
  templateUrl: './workflow-monitor.component.html',
  styleUrls: ['./workflow-monitor.component.css']
})
export class WorkflowMonitorComponent implements OnInit, OnChanges {
  @Input() openInstanceId: string | null = null;

  private workflows = inject(WorkflowService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  summary: WorkflowSummaryDTO | null = null;
  definitions: WorkflowDefinitionDTO[] = [];
  loading = true;
  items: WorkflowInstanceDTO[] = [];
  total = 0;
  page = 0;
  size = 25;
  filterDefinition: string | null = null;
  filterStatus: WorkflowInstanceStatus | null = 'RUNNING';
  filterMine = false;
  columns = ['document', 'workflow', 'state', 'waitingFor', 'startedBy', 'updated'];

  detail: WorkflowInstanceDetailDTO | null = null;
  detailLoading = false;
  busy = false;

  ngOnInit(): void {
    this.workflows.listDefinitions().subscribe(d => this.definitions = d);
    this.reload();
    if (this.openInstanceId) this.open(this.openInstanceId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['openInstanceId'] && !changes['openInstanceId'].firstChange && this.openInstanceId) {
      this.open(this.openInstanceId);
    }
  }

  reload(): void {
    this.loading = true;
    this.workflows.summary().subscribe({ next: s => this.summary = s, error: () => {} });
    this.workflows.listInstances({
      definitionId: this.filterDefinition ?? undefined, status: this.filterStatus, mine: this.filterMine, page: this.page, size: this.size
    }).subscribe({
      next: p => { this.items = p.items; this.total = p.total; this.loading = false; },
      error: err => { this.loading = false; this.toastError(err, 'workflow.errors.generic'); }
    });
  }

  onFilterChange(): void {
    this.page = 0;
    this.reload();
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex;
    this.size = e.pageSize;
    this.reload();
  }

  open(id: string): void {
    this.detailLoading = true;
    this.workflows.getInstance(id).subscribe({
      next: d => { this.detail = d; this.detailLoading = false; },
      error: err => { this.detailLoading = false; this.toastError(err, 'workflow.errors.notFound'); }
    });
  }

  close(): void {
    this.detail = null;
    this.router.navigate([], { queryParams: { instance: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** `${from}:${transition}` of the transitions in the history, for the diagram. */
  taken(d: WorkflowInstanceDetailDTO): string[] {
    return d.history.filter(e => e.type === 'TRANSITIONED' && e.fromState && e.transitionKey).map(e => `${e.fromState}:${e.transitionKey}`);
  }

  waitingFor(i: WorkflowInstanceDTO): string {
    const t = i.currentTask;
    if (!t) return '';
    if (t.candidateRole) return this.translate.instant('workflow.monitor.anyoneWith', { role: t.candidateRole });
    return t.candidates.join(', ');
  }

  eventText(e: WorkflowEventDTO, d: WorkflowInstanceDetailDTO): string {
    const label = (key: string | null) => d.spec.states.find(s => s.key === key)?.label ?? key ?? '';
    switch (e.type) {
      case 'TRANSITIONED': {
        const from = d.spec.states.find(s => s.key === e.fromState);
        const t = from?.transitions.find(x => x.key === e.transitionKey)?.label ?? e.transitionKey;
        return this.translate.instant('workflow.events.TRANSITIONED', { transition: t, state: label(e.toState) });
      }
      case 'ACTION_APPLIED':
      case 'ACTION_FAILED':
        return this.translate.instant('workflow.events.' + e.type, {
          action: this.translate.instant('workflow.actions.' + (e.details?.['action'] ?? '')), error: e.details?.['error'] ?? ''
        });
      case 'REASSIGNED':
        return this.translate.instant('workflow.events.REASSIGNED', { emails: (e.details?.['emails'] as string[] | undefined)?.join(', ') ?? '' });
      case 'STARTED':
        return this.translate.instant('workflow.events.STARTED', { state: label(e.toState) });
      case 'COMPLETED':
        return this.translate.instant('workflow.events.COMPLETED', { state: label(e.toState) });
      default:
        return this.translate.instant('workflow.events.' + e.type);
    }
  }

  eventIcon(type: WorkflowEventDTO['type']): string {
    switch (type) {
      case 'STARTED': return 'play_arrow';
      case 'TRANSITIONED': return 'arrow_forward';
      case 'ACTION_APPLIED': return 'bolt';
      case 'ACTION_FAILED': return 'error';
      case 'REASSIGNED': return 'group';
      case 'REMINDED': return 'notifications';
      case 'COMPLETED': return 'check_circle';
      case 'CANCELLED': return 'cancel';
    }
  }

  openDocument(i: WorkflowInstanceDTO): void {
    this.router.navigate(['/my-folder'], { queryParams: { targetFileId: i.documentId } });
  }

  reassign(): void {
    const task = this.detail?.instance.currentTask;
    if (!task) return;
    import('../../../dialogs/workflow-decision-dialog/workflow-decision-dialog.component').then(m => {
      this.dialog.open(m.WorkflowDecisionDialogComponent, {
        width: '520px', maxWidth: '96vw', autoFocus: false,
        data: {
          title: this.translate.instant('workflow.decision.reassignTitle'), subtitle: this.detail?.instance.documentName, mode: 'emails',
          confirmLabel: this.translate.instant('workflow.tasks.reassign'), confirmIcon: 'group', initialEmails: task.candidates
        }
      }).afterClosed().subscribe(result => {
        if (!result?.emails?.length) return;
        this.busy = true;
        this.workflows.reassign(task.id, { emails: result.emails, comment: result.comment }).subscribe({
          next: () => { this.busy = false; this.open(task.instanceId); this.reload(); },
          error: err => { this.busy = false; this.toastError(err, 'workflow.errors.generic'); }
        });
      });
    });
  }

  cancel(): void {
    const inst = this.detail?.instance;
    if (!inst) return;
    this.dialog.open(ConfirmDialogComponent, {
      width: '440px',
      data: {
        title: this.translate.instant('workflow.monitor.cancel'),
        message: this.translate.instant('workflow.monitor.cancelConfirm', { document: inst.documentName, workflow: inst.definitionName }),
        type: 'danger', icon: 'cancel',
        confirmText: this.translate.instant('workflow.monitor.cancel'), cancelText: this.translate.instant('common.cancel')
      }
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.busy = true;
      this.workflows.cancel(inst.id).subscribe({
        next: () => {
          this.busy = false;
          this.snackBar.open(this.translate.instant('workflow.monitor.cancelled'), this.translate.instant('common.close'), { duration: 4000 });
          this.open(inst.id);
          this.reload();
        },
        error: err => { this.busy = false; this.toastError(err, 'workflow.monitor.cancelError'); }
      });
    });
  }

  trackItem(_: number, i: WorkflowInstanceDTO): string {
    return i.id;
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = WorkflowService.serverMessage(err);
    const msg = this.translate.instant(WorkflowService.errorKey(err, fallback));
    this.snackBar.open(detail ? `${msg} — ${detail}` : msg, this.translate.instant('common.close'), { duration: 6000 });
  }
}
