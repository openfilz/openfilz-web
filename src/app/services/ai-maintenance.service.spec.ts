import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AiMaintenanceService } from './ai-maintenance.service';
import { SettingsService } from './settings.service';
import { RoleService } from './role.service';
import { environment } from '../../environments/environment';
import { BackfillStatus } from '../models/ai-maintenance.models';

const API = environment.apiURL;

describe('AiMaintenanceService', () => {
  let service: AiMaintenanceService;
  let http: HttpTestingController;
  let settings: { isAiActive: boolean; isAiInsightsActive: boolean };
  let roles: { hasRole: jasmine.Spy };

  beforeEach(() => {
    settings = { isAiActive: true, isAiInsightsActive: true };
    roles = { hasRole: jasmine.createSpy('hasRole').and.returnValue(true) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), AiMaintenanceService,
        { provide: SettingsService, useValue: settings },
        { provide: RoleService, useValue: roles }
      ]
    });
    service = TestBed.inject(AiMaintenanceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('is enabled only when AI is on and the user may write documents', () => {
    expect(service.enabled).toBeTrue();
    expect(roles.hasRole).toHaveBeenCalledWith('CONTRIBUTOR');
    roles.hasRole.and.returnValue(false);
    expect(service.enabled).toBeFalse();
    roles.hasRole.and.returnValue(true);
    settings.isAiActive = false;
    expect(service.enabled).toBeFalse();
    settings.isAiInsightsActive = false;
    expect(service.insightsAvailable).toBeFalse();
  });

  it('starts an embedding backfill with POST /ai/embeddings/backfill and follows it', () => {
    let started: BackfillStatus | undefined;
    service.start('embeddings', true).subscribe(s => started = s);
    const post = http.expectOne(`${API}/ai/embeddings/backfill`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ force: true });
    post.flush({ jobId: 'j1', folderId: null, force: true, status: 'RUNNING', total: 0, done: 0, failed: 0, skipped: 0, startedAt: 'now', finishedAt: null });
    expect(started?.jobId).toBe('j1');

    let status: BackfillStatus | undefined;
    service.status('embeddings', 'j1').subscribe(s => status = s);
    const get = http.expectOne(`${API}/ai/embeddings/backfill/j1`);
    expect(get.request.method).toBe('GET');
    get.flush({ jobId: 'j1', folderId: null, force: true, status: 'DONE', total: 2, done: 2, failed: 0, skipped: 0, startedAt: 'now', finishedAt: 'later' });
    expect(status?.status).toBe('DONE');
    expect(status?.done).toBe(2);
  });

  it('addresses the insights job by its own path', () => {
    service.start('insights', false).subscribe();
    http.expectOne(`${API}/ai/insights/backfill`).flush({ jobId: 'j2', status: 'RUNNING', total: 0, done: 0, failed: 0, skipped: 0 });
    service.status('insights', 'j2').subscribe();
    http.expectOne(`${API}/ai/insights/backfill/j2`).flush({ jobId: 'j2', status: 'DONE', total: 0, done: 0, failed: 0, skipped: 0 });
  });
});
