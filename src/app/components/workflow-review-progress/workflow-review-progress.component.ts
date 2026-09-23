import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LocalDatePipe } from '../../i18n/local-date.pipe';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { WorkflowReviewProgress, WorkflowReviewRule, WorkflowReviewVote, WorkflowTransition, WorkflowTransitionStyle } from '../../models/workflow.models';

/** Icon of each review rule — shared with the editor's rule tiles. */
export const REVIEW_RULE_ICONS: Record<WorkflowReviewRule, string> = {
  ALL: 'groups',
  FIRST_REJECTION: 'front_hand',
  QUORUM: 'how_to_vote'
};

/** One segment of the progress bar: a vote cast (coloured by its transition's style) or a reviewer still expected. */
interface Segment {
  style: WorkflowTransitionStyle | 'PENDING';
  title: string;
}

/**
 * Progress of a parallel review round: the rule in words, "2 of 3 reviewed" (approvals vs quorum
 * for QUORUM), a segmented bar, every vote with its reviewer's comment — reviewers see each
 * other's comments, that is the point — and who is still expected. Used by "My tasks", the
 * monitor drawer and the details panel. Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-workflow-review-progress',
  standalone: true,
  imports: [LocalDatePipe, MatIconModule, MatTooltipModule, TranslatePipe],
  templateUrl: './workflow-review-progress.component.html',
  styleUrls: ['./workflow-review-progress.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowReviewProgressComponent {
  @Input({ required: true }) review!: WorkflowReviewProgress;
  /** The review step's transitions, to show each vote by its button label and colour. */
  @Input() transitions: WorkflowTransition[] = [];
  /** Tighter layout for the details panel: comments clamped, no "no review yet" line. */
  @Input() compact = false;

  transitionOf(key: string): WorkflowTransition | undefined {
    return this.transitions.find(t => t.key === key);
  }

  labelOf(key: string): string {
    return this.transitionOf(key)?.label ?? key;
  }

  styleOf(key: string): string {
    return 'style-' + (this.transitionOf(key)?.style ?? 'PRIMARY').toLowerCase();
  }

  isApproval(v: WorkflowReviewVote): boolean {
    return v.transitionKey === this.review.approveTransition;
  }

  get segments(): Segment[] {
    const r = this.review;
    const cast: Segment[] = r.votes.map(v => ({
      style: this.transitionOf(v.transitionKey)?.style ?? 'PRIMARY',
      title: `${v.reviewer}: ${this.labelOf(v.transitionKey)}`
    }));
    const expected = Math.max(r.total - r.votes.length, r.pending.length, 0);
    const waiting: Segment[] = Array.from({ length: expected }, (_, i) => ({ style: 'PENDING' as const, title: r.pending[i] ?? '' }));
    return [...cast, ...waiting];
  }

  get quorum(): number {
    return this.review.quorum ?? 1;
  }

  get ruleIcon(): string {
    return REVIEW_RULE_ICONS[this.review.rule] ?? 'groups';
  }

  trackVote(i: number, v: WorkflowReviewVote): string {
    return `${v.reviewer}:${v.at}:${i}`;
  }
}
