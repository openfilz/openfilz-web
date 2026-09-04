import { Injectable, inject } from '@angular/core';
import { SettingsService } from './settings.service';
import { RoleService } from './role.service';

/**
 * Single seam for "may this user ask the assistant to reorganise a folder?".
 *
 * The AI chat has to exist (`Settings.aiActive`, i.e. `openfilz.ai.active` on the API) and,
 * since applying a proposal moves documents, the CONTRIBUTOR role is required on top — the
 * same shape as {@link PdfToolsAccessService}. The backend enforces the same rule; this is UX.
 */
@Injectable({ providedIn: 'root' })
export class AiOrganizeAccessService {
  private settingsService = inject(SettingsService);
  private roleService = inject(RoleService);

  /** Chat on AND user may move documents. */
  get enabled(): boolean {
    return this.settingsService.isAiActive && this.roleService.hasRole('CONTRIBUTOR');
  }
}
