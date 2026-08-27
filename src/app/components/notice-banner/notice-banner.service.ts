import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { SettingsService } from '../../services/settings.service';
import { IS_ENTERPRISE } from '../../edition';

/**
 * Visibility of the demo notice banner (backend demoMode flag). On the CE demo the banner
 * is a shared-visibility privacy warning and cannot be dismissed (the audience is anonymous
 * and ever-changing); on the EE demo it is a softer note with a trial CTA, dismissible for
 * the session. The service exists so the app shell can shift the layout with the same signal.
 */
@Injectable({ providedIn: 'root' })
export class NoticeBannerService {

  private static readonly DISMISS_KEY = 'openfilz.demoBanner.dismissed';

  private settingsService = inject(SettingsService);

  private dismissedSubject = new BehaviorSubject<boolean>(this.readDismissed());

  readonly demoBannerVisible$: Observable<boolean> = combineLatest([
    this.settingsService.settings$,
    this.dismissedSubject
  ]).pipe(
    map(([settings, dismissed]) => settings?.demoMode === true && !(IS_ENTERPRISE && dismissed))
  );

  get dismissible(): boolean {
    return IS_ENTERPRISE;
  }

  dismiss(): void {
    try {
      sessionStorage.setItem(NoticeBannerService.DISMISS_KEY, '1');
    } catch { /* private mode — banner just reappears next session */ }
    this.dismissedSubject.next(true);
  }

  private readDismissed(): boolean {
    try {
      return sessionStorage.getItem(NoticeBannerService.DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }
}
