import { Injectable, inject } from '@angular/core';
import { SettingsService } from './settings.service';
import { RoleService } from './role.service';

/**
 * Single seam for "may this user see / use the workflows?". The feature switch
 * (`Settings.workflowsActive`, i.e. `openfilz.workflows.active` on the API) controls whether the
 * menu exists at all; starting a workflow needs CONTRIBUTOR; designing needs CONTRIBUTOR plus the
 * WORKFLOW_DESIGNER role when the API asks for it. Acting on a task only needs to be a candidate,
 * which the API decides per task. The backend enforces the same rules — this is UX, not security.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowAccessService {
  private settingsService = inject(SettingsService);
  private roleService = inject(RoleService);

  /** Feature on: the Workflows menu and "My tasks" exist. */
  get enabled(): boolean {
    return this.settingsService.isWorkflowsActive;
  }

  /** May start a workflow on a document. */
  get canStart(): boolean {
    return this.enabled && this.roleService.hasRole('CONTRIBUTOR');
  }

  /** May create / edit / delete definitions (the Designer tab). */
  get canDesign(): boolean {
    return this.canStart
      && (!this.settingsService.isWorkflowDesignerRoleRequired || this.roleService.hasRole('WORKFLOW_DESIGNER'));
  }
}
