import { WorkflowSpec, WorkflowState } from '../models/workflow.models';
import { WorkflowTemplateId, defaultApproveTransition, minReviewers, templateSpec, validateSpec } from './workflow-spec';

/**
 * The starter templates are mirrored by the API's `WorkflowTemplatesIT` (openfilz-core): same keys,
 * kinds, assignee types, transitions, due delays and review blocks. Any drift here must go there too.
 * Only jasmine/vitest-common matchers (describe / it / expect / toEqual / toBe).
 */

const ALL_TEMPLATES: WorkflowTemplateId[] = ['blank', 'approval', 'review-archive', 'two-step', 'parallel-review'];

/** Structure of a spec without its (translated) labels and colours. */
function shape(spec: WorkflowSpec) {
  return spec.states.map(s => ({
    key: s.key,
    kind: s.kind,
    assignees: s.assignees?.type ?? null,
    dueInDays: s.dueInDays ?? null,
    transitions: s.transitions.map(t => `${t.key}->${t.to}${t.requireComment ? ' (comment)' : ''}`),
    review: s.review ?? null
  }));
}

const EXPECTED: Record<WorkflowTemplateId, ReturnType<typeof shape>> = {
  blank: [
    { key: 'draft', kind: 'START', assignees: 'INITIATOR', dueInDays: null, transitions: ['done->done'], review: null },
    { key: 'done', kind: 'END', assignees: null, dueInDays: null, transitions: [], review: null }
  ],
  approval: [
    { key: 'draft', kind: 'START', assignees: 'INITIATOR', dueInDays: null, transitions: ['submit->pending_approval'], review: null },
    { key: 'pending_approval', kind: 'STEP', assignees: 'CHOSEN_AT_START', dueInDays: 3,
      transitions: ['approve->approved', 'reject->rejected (comment)'], review: null },
    { key: 'approved', kind: 'END', assignees: null, dueInDays: null, transitions: [], review: null },
    { key: 'rejected', kind: 'END', assignees: null, dueInDays: null, transitions: [], review: null }
  ],
  'review-archive': [
    { key: 'draft', kind: 'START', assignees: 'INITIATOR', dueInDays: null, transitions: ['submit->in_review'], review: null },
    { key: 'in_review', kind: 'STEP', assignees: 'CHOSEN_AT_START', dueInDays: 5,
      transitions: ['approve->approved', 'changes->draft (comment)', 'reject->rejected (comment)'], review: null },
    { key: 'approved', kind: 'STEP', assignees: 'INITIATOR', dueInDays: null, transitions: ['archive->archived'], review: null },
    { key: 'archived', kind: 'END', assignees: null, dueInDays: null, transitions: [], review: null },
    { key: 'rejected', kind: 'END', assignees: null, dueInDays: null, transitions: [], review: null }
  ],
  'two-step': [
    { key: 'draft', kind: 'START', assignees: 'INITIATOR', dueInDays: null, transitions: ['submit->first_approval'], review: null },
    { key: 'first_approval', kind: 'STEP', assignees: 'CHOSEN_AT_START', dueInDays: 3,
      transitions: ['approve->second_approval', 'reject->rejected (comment)'], review: null },
    { key: 'second_approval', kind: 'STEP', assignees: 'CHOSEN_AT_START', dueInDays: 3,
      transitions: ['approve->approved', 'reject->rejected (comment)'], review: null },
    { key: 'approved', kind: 'END', assignees: null, dueInDays: null, transitions: [], review: null },
    { key: 'rejected', kind: 'END', assignees: null, dueInDays: null, transitions: [], review: null }
  ],
  'parallel-review': [
    { key: 'draft', kind: 'START', assignees: 'INITIATOR', dueInDays: null, transitions: ['submit->in_review'], review: null },
    { key: 'in_review', kind: 'STEP', assignees: 'CHOSEN_AT_START', dueInDays: 5,
      transitions: ['approve->approved', 'changes->draft (comment)'], review: { rule: 'ALL', approveTransition: 'approve' } },
    { key: 'approved', kind: 'END', assignees: null, dueInDays: null, transitions: [], review: null }
  ]
};

describe('workflow templates', () => {
  ALL_TEMPLATES.forEach(id => {
    it(`${id} is valid`, () => {
      expect(validateSpec(templateSpec(id, k => k))).toEqual([]);
    });

    it(`${id} keeps the structure the API test pins`, () => {
      expect(shape(templateSpec(id, k => k))).toEqual(EXPECTED[id]);
    });
  });

  it('parallel-review styles its votes (approve positive, changes neutral)', () => {
    const review = templateSpec('parallel-review', k => k).states.find(s => s.key === 'in_review')!;
    expect(review.transitions.map(t => t.style)).toEqual(['SUCCESS', 'NEUTRAL']);
  });
});

describe('validateSpec — parallel review', () => {
  /** draft → review step (approve / changes) → done, with the review step patched by `patch`. */
  function specWith(patch: Partial<WorkflowState>, kindOfReviewHolder: 'STEP' | 'START' | 'END' = 'STEP'): WorkflowSpec {
    const step: WorkflowState = {
      key: 'review', label: 'Review', kind: 'STEP',
      assignees: { type: 'USERS', emails: ['a@x.io', 'b@x.io', 'c@x.io'] },
      transitions: [
        { key: 'approve', label: 'Approve', to: 'done', style: 'SUCCESS' },
        { key: 'changes', label: 'Changes', to: 'draft', style: 'NEUTRAL', requireComment: true }
      ],
      review: { rule: 'ALL', approveTransition: 'approve' },
      ...patch
    };
    const draft: WorkflowState = { key: 'draft', label: 'Draft', kind: 'START', assignees: { type: 'INITIATOR' },
      transitions: [{ key: 'submit', label: 'Submit', to: 'review' }] };
    const done: WorkflowState = { key: 'done', label: 'Done', kind: 'END', transitions: [] };
    if (kindOfReviewHolder === 'START') draft.review = { rule: 'ALL', approveTransition: 'submit' };
    if (kindOfReviewHolder === 'END') done.review = { rule: 'ALL', approveTransition: 'x' };
    return { states: [draft, step, done] };
  }

  const codes = (spec: WorkflowSpec) => validateSpec(spec).map(p => `${p.code}@${p.path}${p.args?.length ? ':' + p.args.join(',') : ''}`);

  it('accepts a well-formed review with USERS and CHOSEN_AT_START', () => {
    expect(codes(specWith({}))).toEqual([]);
    expect(codes(specWith({ assignees: { type: 'CHOSEN_AT_START', label: 'Reviewers' }, review: { rule: 'QUORUM', quorum: 5, approveTransition: 'approve' } }))).toEqual([]);
    expect(codes(specWith({ review: { rule: 'FIRST_REJECTION', approveTransition: 'approve' } }))).toEqual([]);
  });

  it('REVIEW_NOT_ON_STEP on a START or END status', () => {
    expect(codes(specWith({}, 'START'))).toEqual(['REVIEW_NOT_ON_STEP@states[0].review']);
    expect(codes(specWith({}, 'END'))).toEqual(['REVIEW_NOT_ON_STEP@states[2].review']);
  });

  it('REVIEW_NEEDS_PEOPLE for ROLE and INITIATOR', () => {
    expect(codes(specWith({ assignees: { type: 'ROLE', role: 'CONTRIBUTOR' } }))).toEqual(['REVIEW_NEEDS_PEOPLE@states[1].review']);
    expect(codes(specWith({ assignees: { type: 'INITIATOR' } }))).toEqual(['REVIEW_NEEDS_PEOPLE@states[1].review']);
  });

  it('BAD_REVIEW_RULE when the rule is missing or unknown', () => {
    expect(codes(specWith({ review: { approveTransition: 'approve' } as never }))).toEqual(['BAD_REVIEW_RULE@states[1].review.rule']);
    expect(codes(specWith({ review: { rule: 'MAJORITY' as never, approveTransition: 'approve' } }))).toEqual(['BAD_REVIEW_RULE@states[1].review.rule']);
  });

  it('REVIEW_NO_APPROVE when approveTransition is missing or not a transition of the status', () => {
    expect(codes(specWith({ review: { rule: 'ALL', approveTransition: '' } }))).toEqual(['REVIEW_NO_APPROVE@states[1].review.approveTransition']);
    expect(codes(specWith({ review: { rule: 'ALL', approveTransition: 'submit' } }))).toEqual(['REVIEW_NO_APPROVE@states[1].review.approveTransition']);
  });

  it('BAD_QUORUM outside 1..20', () => {
    [null, 0, 21, 1.5].forEach(quorum =>
      expect(codes(specWith({ review: { rule: 'QUORUM', quorum, approveTransition: 'approve' } }))).toEqual(['BAD_QUORUM@states[1].review.quorum:20']));
  });

  it('QUORUM_TOO_HIGH when USERS names fewer people than the quorum', () => {
    expect(codes(specWith({ review: { rule: 'QUORUM', quorum: 4, approveTransition: 'approve' } }))).toEqual(['QUORUM_TOO_HIGH@states[1].review.quorum:3']);
    expect(codes(specWith({ review: { rule: 'QUORUM', quorum: 3, approveTransition: 'approve' } }))).toEqual([]);
  });

  it('the quorum is ignored by the other rules', () => {
    expect(codes(specWith({ review: { rule: 'ALL', quorum: 99, approveTransition: 'approve' } }))).toEqual([]);
  });
});

describe('review helpers', () => {
  it('minReviewers is the quorum of a QUORUM review, else 1', () => {
    expect(minReviewers({ rule: 'QUORUM', quorum: 3, approveTransition: 'a' })).toBe(3);
    expect(minReviewers({ rule: 'ALL', quorum: 3, approveTransition: 'a' })).toBe(1);
    expect(minReviewers(null)).toBe(1);
  });

  it('defaultApproveTransition prefers the first SUCCESS transition', () => {
    expect(defaultApproveTransition([{ key: 'a', label: 'A', to: 'x' }, { key: 'b', label: 'B', to: 'x', style: 'SUCCESS' }])).toBe('b');
    expect(defaultApproveTransition([{ key: 'a', label: 'A', to: 'x' }])).toBe('a');
    expect(defaultApproveTransition([])).toBe('');
  });
});
