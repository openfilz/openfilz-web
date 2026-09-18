import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { WorkflowTemplateId } from '../../utils/workflow-spec';
import { WorkflowTemplatePickerComponent } from '../../components/workflow-template-picker/workflow-template-picker.component';

/**
 * "New workflow" template picker of the designer: the template cards in a roomy dialog (a
 * full-width bottom sheet on a phone — see `WorkflowDesignerComponent.openTemplatePicker`).
 * Closes with the chosen template id. Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-workflow-template-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslatePipe, WorkflowTemplatePickerComponent],
  templateUrl: './workflow-template-dialog.component.html',
  styleUrls: ['./workflow-template-dialog.component.css']
})
export class WorkflowTemplateDialogComponent {
  private dialogRef = inject(MatDialogRef<WorkflowTemplateDialogComponent, WorkflowTemplateId | undefined>);

  pick(id: WorkflowTemplateId): void {
    this.dialogRef.close(id);
  }

  close(): void {
    this.dialogRef.close();
  }
}
