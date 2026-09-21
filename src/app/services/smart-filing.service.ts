import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Observable, Subject, forkJoin, of, timer } from 'rxjs';
import { catchError, map, switchMap, takeUntil, takeWhile, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SettingsService } from './settings.service';
import {
  AiPreferences,
  AiPreferencesUpdate,
  AutoFileInboxRequest,
  AutoFileJob,
  AutoFileJobsRequest,
  AutoFileRequest,
  FilingOutcome
} from '../models/smart-filing.models';
import { SmartFilingToastComponent, SmartFilingToastData } from '../components/smart-filing-toast/smart-filing-toast.component';
import {
  SmartFilingRecapDialogComponent,
  SmartFilingRecapDialogData
} from '../dialogs/smart-filing-recap-dialog/smart-filing-recap-dialog.component';

/** Polling cadence of the "Filing N document(s)…" toast. */
const POLL_INTERVAL_MS = 2000;
/**
 * How long the toast follows a batch. A fixed minute was enough for one file and far too short
 * for a drop of two hundred, which then always reported them as "left in place" while the server
 * was still filing them: the budget grows with the batch, up to a hard ceiling.
 */
const POLL_TIMEOUT_MIN_MS = 60000;
const POLL_TIMEOUT_PER_DOCUMENT_MS = 3000;
const POLL_TIMEOUT_MAX_MS = 600000;

/**
 * Smart filing: OpenFilz chooses the destination folder of an upload when the user asks for it.
 *
 * Owns the per-user preferences ("Let OpenFilz choose the folder" / "May create new folders" /
 * "Use an Inbox folder"), the filing-job endpoints, the Inbox ("Upload to Inbox", "File my
 * Inbox"), and the non-blocking toast that follows an upload batch. Every
 * `/ai/**` endpoint answers 404 when the feature is off (`Settings.aiAutoFileActive`), so nothing
 * here is called unless {@link enabled} is true. Dedicated file for the enterprise fork.
 */
@Injectable({ providedIn: 'root' })
export class SmartFilingService {
  private readonly baseUrl = environment.apiURL;
  private http = inject(HttpClient);
  private settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
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

  // ── Inbox ──────────────────────────────────────────────────────────────────

  /** The deployment offers the Inbox folder to this user (Inbox switch on and filing available). */
  get inboxAvailable(): boolean {
    return this.enabled && this.preferencesSubject.value?.inboxAvailable === true;
  }

  /** The user has an Inbox folder. */
  get hasInbox(): boolean {
    const prefs = this.preferencesSubject.value;
    return this.enabled && prefs?.inbox === true && !!prefs.inboxFolderId;
  }

  /** The Inbox folder id, null when the user has none. */
  get inboxFolderId(): string | null {
    return this.hasInbox ? this.preferencesSubject.value!.inboxFolderId! : null;
  }

  /** True when `folderId` is the user's Inbox (null / undefined = root level, never the Inbox). */
  isInbox(folderId: string | null | undefined): boolean {
    return !!folderId && folderId === this.inboxFolderId;
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

  /**
   * Persist a change right away (no confirmation) and publish the server's view of the preferences.
   * Turning the Inbox on creates the folder server-side, named in the app's current language —
   * hence the explicit Accept-Language.
   */
  updatePreferences(update: AiPreferencesUpdate): Observable<AiPreferences> {
    const language = this.translate.currentLang || this.translate.defaultLang;
    const headers = language ? new HttpHeaders({ 'Accept-Language': language }) : undefined;
    return this.http.put<AiPreferences>(`${this.baseUrl}/settings/ai/preferences`, update, { headers }).pipe(
      tap(prefs => this.preferencesSubject.next(prefs))
    );
  }

  // ── Filing jobs ────────────────────────────────────────────────────────────

  getJob(jobId: string): Observable<AutoFileJob> {
    return this.http.get<AutoFileJob>(`${this.baseUrl}/ai/auto-file/${jobId}`);
  }

  /**
   * Several jobs in one call. One upload request is sent per file, so a batch leaves one filing
   * job per file: asking for them one by one meant as many requests every poll.
   */
  getJobs(jobIds: string[]): Observable<AutoFileJob[]> {
    if (jobIds.length === 0) {
      return of([]);
    }
    const request: AutoFileJobsRequest = { jobIds };
    return this.http.post<AutoFileJob[]>(`${this.baseUrl}/ai/auto-file/jobs`, request);
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

  /** File every loose file lying in the caller's Inbox (404 when the user has no Inbox). */
  fileInbox(request: AutoFileInboxRequest = {}): Observable<AutoFileJob> {
    return this.http.post<AutoFileJob>(`${this.baseUrl}/ai/auto-file/inbox`, request);
  }

  /**
   * "File my Inbox": start the job with the user's "may create new folders" preference and hand
   * it to the upload toast flow — "Filing N document(s)…", then the result with Undo / Show. An
   * empty Inbox just says so; a failure is reported as a snackbar and yields null. The caller
   * subscribes (and may show a busy state until the job is started).
   */
  fileInboxNow(): Observable<AutoFileJob | null> {
    if (!this.hasInbox) {
      return of(null);
    }
    const allowNewFolders = this.preferencesSubject.value?.autoFileNewFolders === true;
    return this.fileInbox({ allowNewFolders }).pipe(
      tap(job => {
        if (job.total === 0) {
          this.snackBar.open(
            this.translate.instant('smartFiling.inbox.nothingToFile'),
            this.translate.instant('common.close'),
            { duration: 4000 }
          );
          return;
        }
        this.trackUploadBatch([job.jobId], job.total);
      }),
      catchError(error => {
        this.snackBar.open(
          this.translate.instant(error?.status === 404 ? 'smartFiling.inbox.noInbox' : 'smartFiling.inbox.fileFailed'),
          this.translate.instant('common.close'),
          { duration: 4000 }
        );
        return of(null);
      })
    );
  }

  // ── Upload follow-up toast ─────────────────────────────────────────────────

  /**
   * After an upload batch whose responses carried filing job ids: poll the jobs in a single
   * request every 2 s within a budget that grows with the batch, then show "X filed · Y left in
   * place" + Undo / Show — only when at least one document actually left its upload folder (a
   * batch left entirely in place shows nothing). Never blocks: nothing opens on its own, the
   * recap is behind the toast's own action.
   */
  trackUploadBatch(jobIds: string[], documentCount: number): void {
    const ids = Array.from(new Set(jobIds.filter(id => !!id)));
    if (ids.length === 0 || !this.enabled) {
      return;
    }

    let lastJobs: AutoFileJob[] = [];
    let reported = false;
    const report = () => {
      if (reported) {
        return;
      }
      reported = true;
      if (lastJobs.length > 0) {
        this.showResult(lastJobs, documentCount);
      }
    };

    timer(0, POLL_INTERVAL_MS).pipe(
      takeUntil(timer(this.pollBudget(documentCount))),
      switchMap(() => this.getJobs(ids).pipe(catchError(() => of([] as AutoFileJob[])))),
      // An empty answer is a failed poll, not a finished batch: keep what the last one said.
      map(jobs => jobs.length > 0 ? jobs : lastJobs),
      // Keep polling while any job is still running; the emission that ends it is kept.
      takeWhile(jobs => jobs.length === 0 || jobs.some(j => j.status === 'RUNNING'), true)
    ).subscribe({
      next: jobs => {
        lastJobs = jobs;
        if (jobs.length > 0 && !jobs.some(j => j.status === 'RUNNING')) {
          report();
        }
      },
      // Finished, or timed out with jobs still running: report what is known so far
      // (documents still pending count as "left in place").
      complete: () => report()
    });
  }

  /** A minute for a single file, three seconds per document beyond that, ten minutes at most. */
  private pollBudget(documentCount: number): number {
    return Math.min(POLL_TIMEOUT_MAX_MS,
      Math.max(POLL_TIMEOUT_MIN_MS, documentCount * POLL_TIMEOUT_PER_DOCUMENT_MS));
  }

  private showResult(jobs: AutoFileJob[], documentCount: number): void {
    const items = jobs.flatMap(j => j.items ?? []);
    const filedItems = items.filter(i => i.status === 'FILED');
    const filed = filedItems.length;
    const total = items.length || documentCount;
    const left = Math.max(0, total - filed);

    this.foldersChanged$.next(this.foldersOf(items));

    // Nothing left its upload folder: the toast would only say "0 filed", so stay silent.
    const moved = filedItems.some(i => (i.fromFolderId ?? null) !== (i.toFolderId ?? null));
    if (!moved) {
      return;
    }

    const data: SmartFilingToastData = {
      filed,
      left,
      canUndo: filed > 0,
      // A single document goes straight to itself; a batch opens the recap, which is the only
      // place that says which file landed in which folder.
      singleDocument: items.length === 1,
      onUndo: () => this.undoJobs(jobs.filter(j => j.filed > 0).map(j => j.jobId)),
      onShow: () => {
        if (items.length === 1) {
          this.showDocument$.next(items[0].documentId);
          return;
        }
        this.openRecap(items);
      }
    };
    this.snackBar.openFromComponent(SmartFilingToastComponent, { data, duration: 12000 });
  }

  /**
   * Where the batch went, file by file, with an undo per row and one for the lot. Both undos go
   * through the per-document endpoint: one upload request is sent per file, so the batch is one
   * job per file anyway, and undoing the documents that are still filed — rather than the jobs as
   * they were — leaves rows already moved back alone.
   */
  private openRecap(items: FilingOutcome[]): void {
    const data: SmartFilingRecapDialogData = {
      items,
      undoOne: item => this.undoFiling(item.planId!),
      undoAll: filed => forkJoin(filed.map(item => this.undoFiling(item.planId!))),
      openDocument: documentId => this.showDocument$.next(documentId)
    };
    this.dialog.open(SmartFilingRecapDialogComponent, {
      data,
      width: '620px',
      maxWidth: '95vw',
      autoFocus: false
    });
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
