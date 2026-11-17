import { Injectable, inject } from '@angular/core';
import { SettingsService, AiNoModelError } from './settings.service';

/**
 * "No AI model yet" state of the chat assistant and of "Organise with AI" (plan §6.5).
 *
 * Two sources: the settings (`aiModelSource = NONE`, computed by the API for the caller) and a 409
 * `AI_NO_MODEL` from the chat endpoint, which covers a model removed while the page was open. The 409
 * is forgotten on the next settings refresh (saving a key in Settings > AI reloads them), so the
 * settings decide again.
 */
@Injectable({ providedIn: 'root' })
export class AiNoModelService {
  private settingsService = inject(SettingsService);

  /** The last 409 AI_NO_MODEL, until the settings are read again. */
  private serverRefusal: AiNoModelError | null = null;

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
}
