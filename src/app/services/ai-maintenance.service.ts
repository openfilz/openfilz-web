import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SettingsService } from './settings.service';
import { RoleService } from './role.service';
import { BackfillKind, BackfillStatus } from '../models/ai-maintenance.models';

/**
 * The AI maintenance jobs of the settings page: re-embed the documents
 * (`POST /ai/embeddings/backfill`, after a failed upload embedding or a vector-store reset for
 * an embedding-model change) and re-enrich them (`POST /ai/insights/backfill`). Both run in
 * the background on the API and are followed through `GET …/backfill/{jobId}`. The API needs
 * the CONTRIBUTOR role for both; this seam mirrors that for the UI. Dedicated file for the
 * enterprise fork.
 */
@Injectable({ providedIn: 'root' })
export class AiMaintenanceService {
  private readonly baseUrl = environment.apiURL;
  private http = inject(HttpClient);
  private settingsService = inject(SettingsService);
  private roleService = inject(RoleService);

  /** AI on (openfilz.ai.active) AND the user may write documents: the API's rule, as UX. */
  get enabled(): boolean {
    return this.settingsService.isAiActive && this.roleService.hasRole('CONTRIBUTOR');
  }

  /** The insights job exists only when openfilz.ai.insights.active is on. */
  get insightsAvailable(): boolean {
    return this.settingsService.isAiInsightsActive;
  }

  /** Start a job on the whole library; the answer is the job's first snapshot (poll {@link status}). */
  start(kind: BackfillKind, force: boolean): Observable<BackfillStatus> {
    return this.http.post<BackfillStatus>(`${this.baseUrl}/ai/${kind}/backfill`, { force });
  }

  status(kind: BackfillKind, jobId: string): Observable<BackfillStatus> {
    return this.http.get<BackfillStatus>(`${this.baseUrl}/ai/${kind}/backfill/${jobId}`);
  }
}
