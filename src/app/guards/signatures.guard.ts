import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SettingsService } from '../services/settings.service';

/**
 * Gate for the /signatures page: only reachable when the API reports
 * `signatureActive` (openfilz.signature.active). Mirrors recycleBinGuard.
 */
export const signaturesGuard: CanActivateFn = () => {
  const settingsService = inject(SettingsService);
  const router = inject(Router);

  if (settingsService.isSignatureActive) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
