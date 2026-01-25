import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SettingsService } from '../services/settings.service';

export const recycleBinGuard: CanActivateFn = () => {
  const settingsService = inject(SettingsService);
  const router = inject(Router);

  if (settingsService.isRecycleBinEnabled) {
    return true;
  }

  // Redirect to dashboard if recycle bin is disabled
  router.navigate(['/dashboard']);
  return false;
};
