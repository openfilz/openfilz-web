import { Component, OnDestroy, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription, timer } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import { AiMaintenanceService } from '../../services/ai-maintenance.service';
import { BackfillKind, BackfillStatus } from '../../models/ai-maintenance.models';

/** What the page knows about one job: its last snapshot, whether it is being started, the last error. */
interface JobState {
  force: boolean;
  starting: boolean;
  status: BackfillStatus | null;
  error: string | null;
}

/**
 * "AI maintenance" section of the settings page: start the embedding backfill (re-embed the
 * documents that have no vector, or all of them) and the insights backfill (re-enrich the
 * documents), and follow the running job. The jobs run on the API; the page polls their
 * progress every two seconds until they are done and stops polling when it is left. Renders
 * nothing unless AI is on and the user holds the CONTRIBUTOR role. Dedicated file for the
 * enterprise fork; the settings page only hosts the element.
 */
@Component({
  selector: 'app-ai-maintenance',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSlideToggleModule, TranslatePipe],
  templateUrl: './ai-maintenance.component.html',
  styleUrls: ['./ai-maintenance.component.css']
})
export class AiMaintenanceComponent implements OnDestroy {
  private static readonly POLL_INTERVAL_MS = 2000;

  private maintenance = inject(AiMaintenanceService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  readonly jobs: Record<BackfillKind, JobState> = {
    embeddings: { force: false, starting: false, status: null, error: null },
    insights: { force: false, starting: false, status: null, error: null }
  };
  private readonly polls: Partial<Record<BackfillKind, Subscription>> = {};

  get visible(): boolean {
    return this.maintenance.enabled;
  }

  get insightsAvailable(): boolean {
    return this.maintenance.insightsAvailable;
  }

  /** A job is busy from the click until its status says DONE. */
  running(kind: BackfillKind): boolean {
    const job = this.jobs[kind];
    return job.starting || (job.status !== null && job.status.status !== 'DONE');
  }

  start(kind: BackfillKind): void {
    const job = this.jobs[kind];
    if (this.running(kind)) {
      return;
    }
    job.starting = true;
    job.error = null;
    job.status = null;
    this.maintenance.start(kind, job.force).subscribe({
      next: status => {
        job.starting = false;
        job.status = status;
        this.snackBar.open(
          this.translate.instant('settings.aiMaintenance.started'),
          this.translate.instant('common.close'),
          { duration: 3000 }
        );
        this.follow(kind, status);
      },
      error: () => {
        job.starting = false;
        job.error = this.translate.instant('settings.aiMaintenance.startError');
      }
    });
  }

  /** Poll the job until DONE; the first snapshot may still be enumerating (total 0). */
  private follow(kind: BackfillKind, started: BackfillStatus): void {
    if (started.status === 'DONE') {
      return;
    }
    this.polls[kind]?.unsubscribe();
    this.polls[kind] = timer(AiMaintenanceComponent.POLL_INTERVAL_MS, AiMaintenanceComponent.POLL_INTERVAL_MS).pipe(
      switchMap(() => this.maintenance.status(kind, started.jobId)),
      takeWhile(status => status.status !== 'DONE', true)
    ).subscribe({
      next: status => this.jobs[kind].status = status,
      error: () => {
        // The job keeps running on the server; only the page lost sight of it
        this.jobs[kind].error = this.translate.instant('settings.aiMaintenance.statusError');
        this.jobs[kind].status = null;
      }
    });
  }

  ngOnDestroy(): void {
    Object.values(this.polls).forEach(poll => poll?.unsubscribe());
  }
}
