import { Injectable, inject } from '@angular/core';
import { SettingsService } from './settings.service';
import { RoleService } from './role.service';

/**
 * Single seam for "may this user ask the assistant to reorganise a folder?".
 *
 * The action opens the assistant with a prompt, so it needs the *chat* to exist
 * (`Settings.aiChatActive` — `openfilz.ai.chat.active` AND `openfilz.ai.active` on the API, since
 * a deployment may run the automatic AI features with no chat model) and, because applying a
 * proposal moves documents, the CONTRIBUTOR role on top — the same shape as
 * {@link PdfToolsAccessService}. The backend enforces the same rule; this is UX.
 */
@Injectable({ providedIn: 'root' })
export class AiOrganizeAccessService {
  private settingsService = inject(SettingsService);
  private roleService = inject(RoleService);

  /** Chat on AND user may move documents. */
  get enabled(): boolean {
    return this.settingsService.isAiChatActive && this.roleService.hasRole('CONTRIBUTOR');
  }
}
