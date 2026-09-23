import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { WorkflowStateKind } from '../../models/workflow.models';
import { WorkflowTemplateId, layoutSpec, templateSpec } from '../../utils/workflow-spec';

/** A starter template of the designer: its icon and the tint of its card. */
export interface WorkflowTemplateInfo {
  id: WorkflowTemplateId;
  icon: string;
  /** Card tint; empty = the theme primary (the "Blank" card). */
  tone: string;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplateInfo[] = [
  { id: 'approval', icon: 'fact_check', tone: '#f59e0b' },
  { id: 'parallel-review', icon: 'groups', tone: '#8b5cf6' },
  { id: 'review-archive', icon: 'inventory_2', tone: '#3b82f6' },
  { id: 'two-step', icon: 'looks_two', tone: '#f97316' },
  { id: 'blank', icon: 'add', tone: '' }
];

/** One status of the mini flow preview; `label` is a `workflow.designer.labels.*` key. */
interface PreviewChip {
  key: string;
  label: string;
  color: string;
  kind: WorkflowStateKind;
  review: boolean;
}

interface TemplateCard extends WorkflowTemplateInfo {
  /** Statuses by diagram column (left to right), each column top to bottom. */
  columns: PreviewChip[][];
  /** Number of statuses. */
  statuses: number;
  /** `workflow.designer.labels.*` keys of the people the starter names ("chosen at start"). */
  toName: string[];
}

/**
 * The "New workflow" template cards: coloured icon tile, name, what the template is for, its facts
 * (number of statuses, who the starter names) and a mini preview of the flow (status chips column
 * by column, a parallel review drawn as parallel lanes), plus a "Blank" strip spanning the grid. Shared by the designer's empty state and the template dialog so both look
 * alike. Arrow keys move between cards. Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-workflow-template-picker',
  standalone: true,
  imports: [MatIconModule, TranslatePipe],
  templateUrl: './workflow-template-picker.component.html',
  styleUrls: ['./workflow-template-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowTemplatePickerComponent {
  /** Narrower cards (inside the dialog). */
  @Input() dense = false;
  @Output() picked = new EventEmitter<WorkflowTemplateId>();

  private host = inject(ElementRef<HTMLElement>);

  // Labels stay i18n keys (identity `t`): the preview translates them for its tooltips.
  readonly cards: TemplateCard[] = WORKFLOW_TEMPLATES.map(t => {
    if (t.id === 'blank') return { ...t, columns: [], statuses: 0, toName: [] };
    const spec = templateSpec(t.id, key => key);
    return {
      ...t,
      columns: previewColumns(t.id),
      statuses: spec.states.length,
      toName: spec.states.filter(s => s.assignees?.type === 'CHOSEN_AT_START' && s.assignees.label).map(s => s.assignees!.label!)
    };
  });

  /** Grid navigation: arrows move the focus to the previous / next card (left/right follow the reading direction). */
  onKey(event: KeyboardEvent): void {
    const buttons = Array.from((this.host.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.tpl'));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const rtl = getComputedStyle(this.host.nativeElement).direction === 'rtl';
    let j = -1;
    switch (event.key) {
      case 'ArrowRight': j = rtl ? i - 1 : i + 1; break;
      case 'ArrowLeft': j = rtl ? i + 1 : i - 1; break;
      case 'ArrowDown': j = i + this.perRow(buttons); break;
      case 'ArrowUp': j = i - this.perRow(buttons); break;
      case 'Home': j = 0; break;
      case 'End': j = buttons.length - 1; break;
      default: return;
    }
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, j))]?.focus();
  }

  /** Cards on the first row of the grid (same offsetTop as the first card). */
  private perRow(buttons: HTMLButtonElement[]): number {
    const top = buttons[0]?.offsetTop;
    const n = buttons.filter(b => b.offsetTop === top).length;
    return Math.max(1, n);
  }
}

function previewColumns(id: WorkflowTemplateId): PreviewChip[][] {
  const layout = layoutSpec(templateSpec(id, key => key));
  const cols: PreviewChip[][] = [];
  [...layout.nodes].sort((a, b) => a.col - b.col || a.row - b.row).forEach(n => {
    (cols[n.col] ??= []).push({
      key: n.state.key, label: n.state.label, color: n.state.color || '#94a3b8', kind: n.state.kind,
      review: n.state.kind === 'STEP' && !!n.state.review
    });
  });
  return cols.filter(c => c?.length);
}
