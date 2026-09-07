import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  CompleteTaskRequest,
  MyTasksCountDTO,
  ReassignTaskRequest,
  SaveWorkflowDefinitionRequest,
  StartWorkflowRequest,
  WorkflowDefinitionDTO,
  WorkflowInstanceDTO,
  WorkflowInstanceDetailDTO,
  WorkflowInstancePage,
  WorkflowInstanceStatus,
  WorkflowSummaryDTO,
  WorkflowTaskDTO,
  WorkflowValidationResult
} from '../models/workflow.models';

/**
 * HttpClient client of `/api/v1/workflows/**`. Also owns the "my open tasks" counter shown as the
 * sidebar badge: refreshed on demand after every action and on a slow poll while the app is open.
 * No manual Authorization header — the global authInterceptor() adds it.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiURL}/workflows`;

  private readonly myTasksCountSubject = new BehaviorSubject<MyTasksCountDTO>({ count: 0, overdue: 0 });
  /** Open tasks of the current user (badge). */
  readonly myTasksCount$ = this.myTasksCountSubject.asObservable();

  // ── definitions ─────────────────────────────────────────────────────

  listDefinitions(active?: boolean): Observable<WorkflowDefinitionDTO[]> {
    const params = active === undefined ? undefined : new HttpParams().set('active', active);
    return this.http.get<WorkflowDefinitionDTO[]>(`${this.base}/definitions`, { params });
  }

  getDefinition(id: string): Observable<WorkflowDefinitionDTO> {
    return this.http.get<WorkflowDefinitionDTO>(`${this.base}/definitions/${id}`);
  }

  createDefinition(req: SaveWorkflowDefinitionRequest): Observable<WorkflowDefinitionDTO> {
    return this.http.post<WorkflowDefinitionDTO>(`${this.base}/definitions`, req);
  }

  updateDefinition(id: string, req: SaveWorkflowDefinitionRequest): Observable<WorkflowDefinitionDTO> {
    return this.http.put<WorkflowDefinitionDTO>(`${this.base}/definitions/${id}`, req);
  }

  deleteDefinition(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/definitions/${id}`);
  }

  validateDefinition(req: SaveWorkflowDefinitionRequest): Observable<WorkflowValidationResult> {
    return this.http.post<WorkflowValidationResult>(`${this.base}/definitions/validate`, req);
  }

  // ── instances ───────────────────────────────────────────────────────

  start(req: StartWorkflowRequest): Observable<WorkflowInstanceDTO> {
    return this.http.post<WorkflowInstanceDTO>(`${this.base}/instances`, req).pipe(tap(() => this.refreshMyTasksCount()));
  }

  listInstances(filter: { documentId?: string; definitionId?: string; status?: WorkflowInstanceStatus | null; state?: string;
    mine?: boolean; page?: number; size?: number }): Observable<WorkflowInstancePage> {
    let params = new HttpParams();
    if (filter.documentId) params = params.set('documentId', filter.documentId);
    if (filter.definitionId) params = params.set('definitionId', filter.definitionId);
    if (filter.status) params = params.set('status', filter.status);
    if (filter.state) params = params.set('state', filter.state);
    if (filter.mine) params = params.set('mine', true);
    params = params.set('page', filter.page ?? 0).set('size', filter.size ?? 25);
    return this.http.get<WorkflowInstancePage>(`${this.base}/instances`, { params });
  }

  /** The running instance of a document, or null. */
  runningInstanceOf(documentId: string): Observable<WorkflowInstanceDTO | null> {
    return new Observable(subscriber => {
      this.listInstances({ documentId, status: 'RUNNING', size: 1 }).subscribe({
        next: page => { subscriber.next(page.items[0] ?? null); subscriber.complete(); },
        error: err => subscriber.error(err)
      });
    });
  }

  summary(): Observable<WorkflowSummaryDTO> {
    return this.http.get<WorkflowSummaryDTO>(`${this.base}/instances/summary`);
  }

  getInstance(id: string): Observable<WorkflowInstanceDetailDTO> {
    return this.http.get<WorkflowInstanceDetailDTO>(`${this.base}/instances/${id}`);
  }

  cancel(id: string, comment?: string | null): Observable<WorkflowInstanceDTO> {
    return this.http.post<WorkflowInstanceDTO>(`${this.base}/instances/${id}/cancel`, { comment: comment ?? null })
      .pipe(tap(() => this.refreshMyTasksCount()));
  }

  // ── tasks ───────────────────────────────────────────────────────────

  myTasks(): Observable<WorkflowTaskDTO[]> {
    return this.http.get<WorkflowTaskDTO[]>(`${this.base}/tasks/mine`);
  }

  complete(taskId: string, req: CompleteTaskRequest): Observable<WorkflowInstanceDTO> {
    return this.http.post<WorkflowInstanceDTO>(`${this.base}/tasks/${taskId}/complete`, req)
      .pipe(tap(() => this.refreshMyTasksCount()));
  }

  reassign(taskId: string, req: ReassignTaskRequest): Observable<WorkflowInstanceDTO> {
    return this.http.post<WorkflowInstanceDTO>(`${this.base}/tasks/${taskId}/reassign`, req)
      .pipe(tap(() => this.refreshMyTasksCount()));
  }

  /** Re-reads the badge counter; errors are swallowed (the badge is a convenience). */
  refreshMyTasksCount(): void {
    this.http.get<MyTasksCountDTO>(`${this.base}/tasks/mine/count`)
      .pipe(catchError(() => of({ count: 0, overdue: 0 })))
      .subscribe(c => this.myTasksCountSubject.next(c));
  }

  // ── errors ──────────────────────────────────────────────────────────

  /** Maps the HTTP status to a `workflow.errors.*` key; the body message is appended by callers. */
  static errorKey(err: unknown, fallback = 'workflow.errors.generic'): string {
    const status = (err as HttpErrorResponse)?.status;
    switch (status) {
      case 0: return 'workflow.errors.network';
      case 400: return 'workflow.errors.validation';
      case 403: return 'workflow.errors.forbidden';
      case 404: return 'workflow.errors.notFound';
      case 409: return 'workflow.errors.conflict';
      default: return fallback;
    }
  }

  static serverMessage(err: unknown): string | undefined {
    const body = (err as HttpErrorResponse)?.error;
    if (!body) return undefined;
    if (typeof body === 'string') return body;
    return body.message ?? body.detail ?? body.error;
  }
}
