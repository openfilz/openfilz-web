import { Injectable, inject } from '@angular/core';
import { SettingsService } from './settings.service';
import { RoleService } from './role.service';

/**
 * Single seam for "may this user use the PDF tools (merge / split / rotate / organize pages)?".
 *
 * The feature switch (`Settings.pdfToolsActive`, i.e. `openfilz.pdf-tools.active` on the API)
 * controls whether the actions exist at all; every PDF tool writes documents, so the
 * CONTRIBUTOR role is required on top. The backend enforces the same rule — this is UX, not
 * security.
 */
@Injectable({ providedIn: 'root' })
export class PdfToolsAccessService {
  private settingsService = inject(SettingsService);
  private roleService = inject(RoleService);

  /** Feature on AND user may write documents. */
  get enabled(): boolean {
    return this.settingsService.isPdfToolsActive && this.roleService.hasRole('CONTRIBUTOR');
  }
}
