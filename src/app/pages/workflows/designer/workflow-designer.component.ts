import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WorkflowService } from '../../../services/workflow.service';
import { WorkflowDefinitionDTO } from '../../../models/workflow.models';
import { WorkflowDiagramComponent } from '../../../components/workflow-diagram/workflow-diagram.component';
import { ConfirmDialogComponent } from '../../../dialogs/confirm-dialog/confirm-dialog.component';
import { WorkflowTemplateId } from '../../../utils/workflow-spec';

/** "Designer": the definition cards (with their diagram) and the "New workflow" template picker. */
@Component({
  selector: 'app-workflow-designer',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatMenuModule, MatProgressSpinnerModule, MatTooltipModule, TranslatePipe, WorkflowDiagramComponent],
  templateUrl: './workflow-designer.component.html',
  styleUrls: ['./workflow-designer.component.css']
})
export class WorkflowDesignerComponent implements OnInit {
  private workflows = inject(WorkflowService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  loading = true;
  definitions: WorkflowDefinitionDTO[] = [];
  busy = new Set<string>();
  readonly templates: { id: WorkflowTemplateId; icon: string }[] = [
    { id: 'approval', icon: 'fact_check' },
    { id: 'review-archive', icon: 'inventory_2' },
    { id: 'two-step', icon: 'looks_two' },
    { id: 'blank', icon: 'add' }
  ];

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.workflows.listDefinitions().subscribe({
      next: defs => { this.definitions = defs; this.loading = false; },
      error: err => { this.loading = false; this.toastError(err, 'workflow.errors.generic'); }
    });
  }

  create(template: WorkflowTemplateId): void {
    this.router.navigate(['/workflows/definitions/new'], { queryParams: { template } });
  }

  edit(def: WorkflowDefinitionDTO): void {
    this.router.navigate(['/workflows/definitions', def.id]);
  }

  toggleActive(def: WorkflowDefinitionDTO): void {
    this.busy.add(def.id);
    this.workflows.updateDefinition(def.id, {
      name: def.name, description: def.description, active: !def.active, spec: def.spec, triggerFolderIds: def.triggerFolderIds
    }).subscribe({
      next: updated => { this.busy.delete(def.id); Object.assign(def, updated); },
      error: err => { this.busy.delete(def.id); this.toastError(err, 'workflow.editor.saveError'); }
    });
  }

  remove(def: WorkflowDefinitionDTO): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '440px',
      data: {
        title: this.translate.instant('workflow.designer.delete'),
        message: this.translate.instant('workflow.designer.deleteConfirm', { name: def.name }),
        type: 'danger', icon: 'delete',
        confirmText: this.translate.instant('common.delete'), cancelText: this.translate.instant('common.cancel')
      }
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.busy.add(def.id);
      this.workflows.deleteDefinition(def.id).subscribe({
        next: () => {
          this.busy.delete(def.id);
          this.definitions = this.definitions.filter(d => d.id !== def.id);
          this.snackBar.open(this.translate.instant('workflow.designer.deleted'), this.translate.instant('common.close'), { duration: 4000 });
        },
        error: err => { this.busy.delete(def.id); this.toastError(err, 'workflow.designer.deleteError'); }
      });
    });
  }

  trackDef(_: number, d: WorkflowDefinitionDTO): string {
    return d.id;
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = WorkflowService.serverMessage(err);
    const msg = this.translate.instant(WorkflowService.errorKey(err, fallback));
    this.snackBar.open(detail ? `${msg} — ${detail}` : msg, this.translate.instant('common.close'), { duration: 6000 });
  }
}
