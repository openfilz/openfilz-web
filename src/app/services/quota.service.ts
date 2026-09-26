import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MyStorageQuota } from '../models/quota.models';

/**
 * The caller's storage quota (GET /quotas/me): what they use against their effective limit — their
 * own, their team's or the default — and the largest file they may upload. null limits = unlimited.
 */
@Injectable({ providedIn: 'root' })
export class QuotaService {
  private http = inject(HttpClient);

  myQuota(): Observable<MyStorageQuota> {
    return this.http.get<MyStorageQuota>(`${environment.apiURL}/quotas/me`);
  }
}
