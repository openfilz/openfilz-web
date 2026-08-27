import { Injectable, inject } from '@angular/core';
import { SettingsService } from './settings.service';
import { RoleService } from './role.service';

/**
 * Single seam for "may this user initiate signature requests?".
 *
 * The e-Sign feature switch (`signatureActive`) controls whether the UI exists at all;
 * on top of it, a deployment may require the SIGN_REQUESTER role for *initiating*
 * requests (`openfilz.signature.require-requester-role` — surfaced as
 * `Settings.signatureRequesterRoleRequired`). Reads (Signatures page, "waiting for my
 * signature") are never gated by the role, so only the request/template affordances
 * consult this service. The backend enforces the same rule — this is UX, not security.
 */
@Injectable({ providedIn: 'root' })
export class SignatureAccessService {
  private settingsService = inject(SettingsService);
  private roleService = inject(RoleService);

  /** Feature on AND (role not required OR user holds SIGN_REQUESTER). */
  get canRequestSignature(): boolean {
    return this.settingsService.isSignatureActive
      && (!this.settingsService.isSignatureRequesterRoleRequired || this.roleService.hasRole('SIGN_REQUESTER'));
  }
}
