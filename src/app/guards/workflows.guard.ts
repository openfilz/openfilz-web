import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SettingsService } from '../services/settings.service';

/**
 * Gate for the /workflows pages: only reachable when the API reports
 * `workflowsActive` (openfilz.workflows.active). Mirrors signaturesGuard.
 */
export const workflowsGuard: CanActivateFn = () => {
  const settingsService = inject(SettingsService);
  const router = inject(Router);

  if (settingsService.isWorkflowsActive) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
