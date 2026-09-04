import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subject, forkJoin, of, timer } from 'rxjs';
import { catchError, map, switchMap, takeUntil, takeWhile, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SettingsService } from './settings.service';
import {
  AiPreferences,
  AiPreferencesUpdate,
  AutoFileJob,
  AutoFileRequest,
  FilingOutcome
} from '../models/smart-filing.models';
import { SmartFilingToastComponent, SmartFilingToastData } from '../components/smart-filing-toast/smart-filing-toast.component';

/** Polling cadence / budget of the "Filing N document(s)…" toast. */
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

/**
 * Smart filing: OpenFilz chooses the destination folder of an upload when the user asks for it.
 *
 * Owns the per-user preferences ("Let OpenFilz choose the folder" / "May create new folders"),
 * the filing-job endpoints, and the non-blocking toast that follows an upload batch. Every
 * `/ai/**` endpoint answers 404 when the feature is off (`Settings.aiAutoFileActive`), so nothing
 * here is called unless {@link enabled} is true. Dedicated file for the enterprise fork.
 */
@Injectable({ providedIn: 'root' })
export class SmartFilingService {
  private readonly baseUrl = environment.apiURL;
  private http = inject(HttpClient);
  private settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  private preferencesSubject = new BehaviorSubject<AiPreferences | null>(null);
  /** Last loaded preferences (null until loaded, or when the feature is off). */
  readonly preferences$ = this.preferencesSubject.asObservable();
  private loading = false;

  /**
   * Folders whose content a filing job changed (null = root level) — emitted when a job
   * finishes or is undone, so the listing that shows one of them refreshes.
   */
  readonly foldersChanged$ = new Subject<(string | null)[]>();
  /** "Show" on the result toast: the id of the single document that was filed. */
  readonly showDocument$ = new Subject<string>();

  /** Follows the backend's openfilz.ai.auto-file flag — the only switch for the whole UI. */
  get enabled(): boolean {
    return this.settingsService.isAiAutoFileActive;
  }

  get preferences(): AiPreferences | null {
    return this.preferencesSubject.value;
  }

  /** True when the switch is shown: feature on, preferences loaded and filing available for this user. */
  get available(): boolean {
    return this.enabled && this.preferencesSubject.value?.autoFileAvailable === true;
  }

  /**
   * The `autoFile` value to send with an upload: the switch state when the switch is shown,
   * undefined (= the server applies the saved preference) when the feature is off or the
   * preferences are not loaded yet.
   */
  get autoFileForUpload(): boolean | undefined {
    return this.available ? this.preferencesSubject.value!.autoFile : undefined;
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  /** Load the preferences once; no-op when the feature is off (the endpoint would 404). */
  ensureLoaded(): void {
    if (!this.enabled || this.loading || this.preferencesSubject.value) {
      return;
    }
    this.loading = true;
    this.loadPreferences().subscribe({ complete: () => this.loading = false, error: () => this.loading = false });
  }

  loadPreferences(): Observable<AiPreferences | null> {
    if (!this.enabled) {
      return of(null);
    }
    return this.http.get<AiPreferences>(`${this.baseUrl}/settings/ai/preferences`).pipe(
      tap(prefs => this.preferencesSubject.next(prefs)),
      catchError(() => of(null))
    );
  }

  /** Persist a change right away (no confirmation) and publish the server's view of the preferences. */
  updatePreferences(update: AiPreferencesUpdate): Observable<AiPreferences> {
    return this.http.put<AiPreferences>(`${this.baseUrl}/settings/ai/preferences`, update).pipe(
      tap(prefs => this.preferencesSubject.next(prefs))
    );
  }

  // ── Filing jobs ────────────────────────────────────────────────────────────

  getJob(jobId: string): Observable<AutoFileJob> {
    return this.http.get<AutoFileJob>(`${this.baseUrl}/ai/auto-file/${jobId}`);
  }

  /** Move every FILED document of the job back where it was. */
  undoJob(jobId: string): Observable<AutoFileJob> {
    return this.http.post<AutoFileJob>(`${this.baseUrl}/ai/auto-file/${jobId}/undo`, {}).pipe(
      tap(job => this.foldersChanged$.next(this.foldersOf(job.items)))
    );
  }

  /** Latest filing outcome of a document, or null when it was never filed (404). */
  getDocumentFiling(documentId: string): Observable<FilingOutcome | null> {
    if (!this.enabled) {
      return of(null);
    }
    return this.http.get<FilingOutcome>(`${this.baseUrl}/ai/auto-file/document/${documentId}`).pipe(
      catchError(() => of(null))
    );
  }

  /** Move one filed document back where it was. */
  undoFiling(planId: string): Observable<FilingOutcome> {
    return this.http.post<FilingOutcome>(`${this.baseUrl}/ai/auto-file/filing/${planId}/undo`, {}).pipe(
      tap(outcome => this.foldersChanged$.next(this.foldersOf([outcome])))
    );
  }

  /** File existing documents on demand. */
  fileDocuments(request: AutoFileRequest): Observable<AutoFileJob> {
    return this.http.post<AutoFileJob>(`${this.baseUrl}/ai/auto-file`, request);
  }

  // ── Upload follow-up toast ─────────────────────────────────────────────────

  /**
   * After an upload batch whose responses carried filing job ids: show ONE "Filing N
   * document(s)…" toast, poll the jobs every 2 s for up to 60 s, then replace it with
   * "X filed · Y left in place" + Undo / Show. Never blocks: no dialog, no await.
   */
  trackUploadBatch(jobIds: string[], documentCount: number): void {
    const ids = Array.from(new Set(jobIds.filter(id => !!id)));
    if (ids.length === 0 || !this.enabled) {
      return;
    }

    const pending = this.snackBar.open(
      this.translate.instant('smartFiling.toast.filing', { count: documentCount }),
      undefined,
      { duration: 0 }
    );

    let lastJobs: AutoFileJob[] = [];
    let reported = false;
    const report = () => {
      if (reported) {
        return;
      }
      reported = true;
      pending.dismiss();
      if (lastJobs.length > 0) {
        this.showResult(lastJobs, documentCount);
      }
    };

    timer(0, POLL_INTERVAL_MS).pipe(
      takeUntil(timer(POLL_TIMEOUT_MS)),
      switchMap(() => forkJoin(ids.map(id => this.getJob(id).pipe(catchError(() => of(null)))))),
      map(jobs => jobs.filter((j): j is AutoFileJob => j !== null)),
      // Keep polling while any job is still running; the emission that ends it is kept.
      takeWhile(jobs => jobs.some(j => j.status === 'RUNNING'), true)
    ).subscribe({
      next: jobs => {
        lastJobs = jobs;
        if (!jobs.some(j => j.status === 'RUNNING')) {
          report();
        }
      },
      // Finished, or timed out with jobs still running: report what is known so far
      // (documents still pending count as "left in place").
      complete: () => report(),
      error: () => pending.dismiss()
    });
  }

  private showResult(jobs: AutoFileJob[], documentCount: number): void {
    const items = jobs.flatMap(j => j.items ?? []);
    const filedItems = items.filter(i => i.status === 'FILED');
    const filed = filedItems.length;
    const total = items.length || documentCount;
    const left = Math.max(0, total - filed);

    this.foldersChanged$.next(this.foldersOf(items));

    const data: SmartFilingToastData = {
      filed,
      left,
      canUndo: filed > 0,
      onUndo: () => this.undoJobs(jobs.filter(j => j.filed > 0).map(j => j.jobId)),
      onShow: () => {
        // Exactly one filed document: open its details; otherwise the toast just closes.
        if (filedItems.length === 1) {
          this.showDocument$.next(filedItems[0].documentId);
        }
      }
    };
    this.snackBar.openFromComponent(SmartFilingToastComponent, { data, duration: 12000 });
  }

  private undoJobs(jobIds: string[]): void {
    if (jobIds.length === 0) {
      return;
    }
    forkJoin(jobIds.map(id => this.undoJob(id))).subscribe({
      next: () => this.snackBar.open(
        this.translate.instant('smartFiling.toast.movedBack'),
        this.translate.instant('common.close'),
        { duration: 4000 }
      ),
      error: () => this.snackBar.open(
        this.translate.instant('smartFiling.toast.undoFailed'),
        this.translate.instant('common.close'),
        { duration: 4000 }
      )
    });
  }

  /** Distinct source + destination folders of the outcomes (null = root level). */
  private foldersOf(items: FilingOutcome[]): (string | null)[] {
    const ids = new Set<string | null>();
    for (const item of items) {
      ids.add(item.fromFolderId ?? null);
      ids.add(item.toFolderId ?? null);
    }
    return Array.from(ids);
  }
}
