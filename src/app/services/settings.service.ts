import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface Settings {
  emptyBinInterval: number | null;
  fileQuotaMB: number | null;
  userQuotaMB: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly baseUrl = environment.apiURL;
  private http = inject(HttpClient);

  private settingsSubject = new BehaviorSubject<Settings | null>(null);
  public settings$ = this.settingsSubject.asObservable();

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  loadSettings(): Observable<Settings> {
    return this.http.get<Settings>(`${this.baseUrl}/settings`, {
      headers: this.getHeaders()
    }).pipe(
      tap(settings => this.settingsSubject.next(settings)),
      catchError(error => {
        console.error('Failed to load settings', error);
        // Default to null (recycle bin disabled)
        this.settingsSubject.next({ emptyBinInterval: null, fileQuotaMB: null, userQuotaMB: null });
        return of({ emptyBinInterval: null, fileQuotaMB: null, userQuotaMB: null });
      })
    );
  }

  get settings(): Settings | null {
    return this.settingsSubject.value;
  }

  get emptyBinInterval(): number | null {
    return this.settingsSubject.value?.emptyBinInterval ?? null;
  }

  get isRecycleBinEnabled(): boolean {
    return this.emptyBinInterval !== null;
  }
}
