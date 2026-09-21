import { Injectable, inject } from '@angular/core';
import { RoleService } from './role.service';
import { isZipItem } from '../models/file-actions';

/**
 * Single seam for "may this user unzip this item?". Extraction writes documents, so the
 * CONTRIBUTOR role is required. The backend enforces the same rule — this is UX, not security.
 */
@Injectable({ providedIn: 'root' })
export class UnzipAccessService {
  private roleService = inject(RoleService);

  /** User may write documents. */
  get enabled(): boolean {
    return this.roleService.hasRole('CONTRIBUTOR');
  }

  /** User may write AND the item is a ZIP archive. */
  canUnzip(item: { name?: string; contentType?: string; type?: string } | undefined): boolean {
    return this.enabled && !!item && isZipItem(item);
  }
}
