import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { WorkflowSpec } from '../../models/workflow.models';
import { DiagramEdge, DiagramLayout, DiagramNode, contrastColor, layoutSpec } from '../../utils/workflow-spec';

/**
 * The picture of a workflow: statuses left to right, transitions as labelled arrows. Pure SVG
 * drawn from `layoutSpec()`; the current status is highlighted, the transitions already taken
 * are bold, and clicking a status emits its key (the designer scrolls to its card).
 * Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-workflow-diagram',
  standalone: true,
  templateUrl: './workflow-diagram.component.html',
  styleUrls: ['./workflow-diagram.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowDiagramComponent implements OnChanges {
  @Input() spec: WorkflowSpec | null = null;
  @Input() currentStateKey: string | null = null;
  /** `${fromKey}:${transitionKey}` of the transitions already taken (drawn bold). */
  @Input() taken: string[] = [];
  /** Status key the designer currently edits (dashed outline). */
  @Input() selectedStateKey: string | null = null;
  @Input() compact = false;
  @Output() stateClick = new EventEmitter<string>();

  layout: DiagramLayout = { nodes: [], edges: [], width: 0, height: 0 };
  private takenSet = new Set<string>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['spec']) {
      this.layout = layoutSpec(this.spec ?? { states: [] });
    }
    if (changes['taken']) {
      this.takenSet = new Set(this.taken ?? []);
    }
  }

  fill(n: DiagramNode): string {
    return n.state.color || '#94a3b8';
  }

  text(n: DiagramNode): string {
    return contrastColor(n.state.color);
  }

  isTaken(e: DiagramEdge): boolean {
    return this.takenSet.has(`${e.from.state.key}:${e.transition.key}`);
  }

  trackNode(_: number, n: DiagramNode): string {
    return n.state.key;
  }

  trackEdge(_: number, e: DiagramEdge): string {
    return `${e.from.state.key}:${e.transition.key}`;
  }

  /** Keeps long labels inside the box. */
  short(label: string, max = 20): string {
    return label.length > max ? label.slice(0, max - 1) + '…' : label;
  }
}
