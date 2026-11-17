import { Injectable, inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { SettingsService, AiNoModelError } from './settings.service';

/** At most one settings read per this many milliseconds while the panel asks again. */
export const AI_NO_MODEL_RECHECK_INTERVAL_MS = 5000;

/**
 * "No AI model yet" state of the chat assistant and of "Organise with AI" (plan §6.5).
 *
 * Two sources: the settings (`aiModelSource = NONE`, computed by the API for the caller) and a 409
 * `AI_NO_MODEL` from the chat endpoint, which covers a model removed while the page was open. The 409
 * is forgotten on the next settings refresh (saving a key in Settings > AI reloads them), so the
 * settings decide again. While the panel shows, {@link recheck} reads them again, so a model set
 * meanwhile takes the panel away without a reload.
 */
@Injectable({ providedIn: 'root' })
export class AiNoModelService {
  private settingsService = inject(SettingsService);

  /** The last 409 AI_NO_MODEL, until the settings are read again. */
  private serverRefusal: AiNoModelError | null = null;

  private rechecking = false;
  private lastRecheck = 0;

  constructor() {
    this.settingsService.settings$.subscribe(() => this.serverRefusal = null);
  }

  /** Whether the chat and "Organise with AI" show the "No AI model yet" panel. */
  get noModel(): boolean {
    return this.serverRefusal !== null || this.settingsService.isAiModelMissing;
  }

  /** Whether the user may use their own model with their own key (the 409 says so when it came last). */
  get userKeysAllowed(): boolean {
    return this.serverRefusal?.userKeysAllowed ?? this.settingsService.areAiUserKeysAllowed;
  }

  /** The chat answered 409 AI_NO_MODEL. */
  reportServerRefusal(error: AiNoModelError): void {
    this.serverRefusal = error;
  }

  /**
   * Asks the API again whether a model answers this user now. The panel takes the place of the input, so
   * nothing else would ever notice a model set meanwhile (by an administrator, or the user's own key saved
   * in another tab): the panel would stay until the page is reloaded. Called when the panel shows and when
   * the user comes back to the tab; one read at a time, at most one every few seconds, none without the panel.
   */
  recheck(): void {
    const now = Date.now();
    if (!this.noModel || this.rechecking || now - this.lastRecheck < AI_NO_MODEL_RECHECK_INTERVAL_MS) {
      return;
    }
    this.rechecking = true;
    this.lastRecheck = now;
    this.settingsService.refreshSettings().pipe(finalize(() => this.rechecking = false)).subscribe();
  }
}
