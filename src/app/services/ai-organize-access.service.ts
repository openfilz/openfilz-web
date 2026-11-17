import { Injectable, inject } from '@angular/core';
import { SettingsService } from './settings.service';
import { RoleService } from './role.service';

/**
 * Single seam for "may this user ask the assistant to reorganise a folder?".
 *
 * The action opens the assistant with a prompt, so it needs the chat to be offered
 * (`SettingsService.isAiChatOffered`: AI on and the assistant not switched off; with no model yet,
 * `FileOperationsComponent` shows the "No AI model yet" panel instead) and, because applying a
 * proposal moves documents, the CONTRIBUTOR role on top — the same shape as
 * {@link PdfToolsAccessService}. The backend enforces the same rule; this is UX.
 */
@Injectable({ providedIn: 'root' })
export class AiOrganizeAccessService {
  private settingsService = inject(SettingsService);
  private roleService = inject(RoleService);

  /** Chat offered (even with no model yet) AND user may move documents. */
  get enabled(): boolean {
    return this.settingsService.isAiChatOffered && this.roleService.hasRole('CONTRIBUTOR');
  }
}
