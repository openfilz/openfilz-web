import {
  WorkflowAction,
  WorkflowProblem,
  WorkflowSpec,
  WorkflowState,
  WorkflowTransition
} from '../models/workflow.models';

/**
 * Client-side mirror of the API's `WorkflowSpecValidator` (same codes, same paths) so the
 * designer can flag problems before saving, plus the starter templates and the layout used by
 * the diagram. Pure functions, no Angular — the enterprise fork takes the file as-is.
 */

export const KEY_PATTERN = /^[a-z0-9_]{1,40}$/;
export const MAX_DUE_DAYS = 365;
export const MAX_METADATA_ENTRIES = 20;
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Turns a label into a status / transition key ("Pending approval" → "pending_approval"). */
export function slugify(label: string): string {
  const base = (label ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'state';
}

/** A key not yet used in `taken`, derived from the label. */
export function uniqueKey(label: string, taken: string[]): string {
  const base = slugify(label);
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const k = `${base.slice(0, 36)}_${i}`;
    if (!taken.includes(k)) return k;
  }
  return `${base.slice(0, 30)}_${Date.now() % 100000}`;
}

export function validEmail(s: string): boolean {
  return EMAIL_PATTERN.test((s ?? '').trim());
}

export function validateSpec(spec: WorkflowSpec, triggerFolderIds: string[] = [], maxStates = 30): WorkflowProblem[] {
  const problems: WorkflowProblem[] = [];
  const states = spec?.states ?? [];
  if (states.length === 0) {
    problems.push({ path: 'states', code: 'EMPTY', message: 'A workflow needs at least one status' });
    return problems;
  }
  if (states.length > maxStates) {
    problems.push({ path: 'states', code: 'TOO_MANY', message: `At most ${maxStates} statuses`, args: [String(maxStates)] });
  }
  const byKey = new Map<string, WorkflowState>();
  let starts = 0, ends = 0, chosenAtStart = false;
  states.forEach((s, i) => {
    const p = `states[${i}]`;
    if (!s.key || !KEY_PATTERN.test(s.key)) {
      problems.push({ path: `${p}.key`, code: 'BAD_KEY', message: 'Status key must be lowercase letters, digits or _' });
    } else if (byKey.has(s.key)) {
      problems.push({ path: `${p}.key`, code: 'DUPLICATE_KEY', message: `Duplicate status key '${s.key}'`, args: [s.key] });
    } else {
      byKey.set(s.key, s);
    }
    if (!s.label?.trim() || s.label.length > 100) {
      problems.push({ path: `${p}.label`, code: 'BAD_LABEL', message: 'Status label is required' });
    }
    if (s.kind !== 'START' && s.kind !== 'STEP' && s.kind !== 'END') {
      problems.push({ path: `${p}.kind`, code: 'BAD_KIND', message: 'Status kind must be START, STEP or END' });
      return;
    }
    if (s.kind === 'START') starts++;
    if (s.kind === 'END') ends++;
    const transitions = s.transitions ?? [];
    if (s.kind === 'END') {
      if (transitions.length) problems.push({ path: `${p}.transitions`, code: 'END_HAS_TRANSITIONS', message: 'A final status has no transitions' });
      if (s.assignees) problems.push({ path: `${p}.assignees`, code: 'END_HAS_ASSIGNEES', message: 'A final status has no assignees' });
      if (s.dueInDays) problems.push({ path: `${p}.dueInDays`, code: 'END_HAS_DUE', message: 'A final status has no due delay' });
    } else {
      if (!transitions.length) {
        problems.push({ path: `${p}.transitions`, code: 'NO_TRANSITION', message: `Status '${s.label}' needs at least one transition`, args: [s.label] });
      }
      const a = s.assignees ?? { type: 'INITIATOR' as const };
      switch (a.type) {
        case 'USERS': {
          const emails = (a.emails ?? []).map(e => e.trim().toLowerCase()).filter(e => e);
          if (!emails.length) problems.push({ path: `${p}.assignees.emails`, code: 'NO_EMAIL', message: 'Name at least one e-mail address' });
          emails.filter(e => !validEmail(e)).forEach(e =>
            problems.push({ path: `${p}.assignees.emails`, code: 'BAD_EMAIL', message: `Invalid e-mail address '${e}'`, args: [e] }));
          break;
        }
        case 'ROLE':
          if (!a.role || !/^[A-Za-z0-9_\-]{1,64}$/.test(a.role)) {
            problems.push({ path: `${p}.assignees.role`, code: 'BAD_ROLE', message: 'Role name is required' });
          }
          break;
        case 'CHOSEN_AT_START':
          chosenAtStart = true;
          break;
        case 'INITIATOR':
          break;
        default:
          problems.push({ path: `${p}.assignees.type`, code: 'BAD_ASSIGNEE_TYPE', message: 'Assignee type is required' });
      }
      if (s.dueInDays != null && (s.dueInDays < 1 || s.dueInDays > MAX_DUE_DAYS)) {
        problems.push({ path: `${p}.dueInDays`, code: 'BAD_DUE', message: `Due delay must be between 1 and ${MAX_DUE_DAYS} days`, args: [String(MAX_DUE_DAYS)] });
      }
    }
    const tKeys = new Set<string>();
    transitions.forEach((t, j) => {
      const tp = `${p}.transitions[${j}]`;
      if (!t.key || !KEY_PATTERN.test(t.key)) {
        problems.push({ path: `${tp}.key`, code: 'BAD_KEY', message: 'Transition key must be lowercase letters, digits or _' });
      } else if (tKeys.has(t.key)) {
        problems.push({ path: `${tp}.key`, code: 'DUPLICATE_KEY', message: `Duplicate transition key '${t.key}'`, args: [t.key] });
      } else {
        tKeys.add(t.key);
      }
      if (!t.label?.trim() || t.label.length > 60) {
        problems.push({ path: `${tp}.label`, code: 'BAD_LABEL', message: 'Transition label is required' });
      }
      if (!t.to) {
        problems.push({ path: `${tp}.to`, code: 'NO_TARGET', message: 'Transition needs a target status' });
      }
    });
    (s.onEnter ?? []).forEach((a, j) => validateAction(a, `${p}.onEnter[${j}]`, problems));
  });
  if (starts !== 1) problems.push({ path: 'states', code: 'ONE_START', message: 'Exactly one status must be the START' });
  if (ends === 0) problems.push({ path: 'states', code: 'NO_END', message: 'At least one status must be an END' });
  states.forEach((s, i) => (s.transitions ?? []).forEach((t, j) => {
    if (t.to && !byKey.has(t.to)) {
      problems.push({ path: `states[${i}].transitions[${j}].to`, code: 'UNKNOWN_TARGET', message: `Unknown target status '${t.to}'`, args: [t.to] });
    }
  }));
  if (triggerFolderIds.length && chosenAtStart) {
    problems.push({ path: 'triggerFolderIds', code: 'TRIGGER_NEEDS_FIXED_ASSIGNEES',
      message: 'A workflow started automatically from a folder cannot ask the starter to choose assignees' });
  }
  if (!problems.length) reachability(states, byKey, problems);
  return problems;
}

function validateAction(a: WorkflowAction, p: string, problems: WorkflowProblem[]): void {
  switch (a?.type) {
    case 'MOVE_TO_FOLDER':
      if (!a.folderId) problems.push({ path: `${p}.folderId`, code: 'NO_FOLDER', message: 'Choose the destination folder' });
      break;
    case 'SET_METADATA': {
      const keys = Object.keys(a.entries ?? {});
      if (!keys.length) problems.push({ path: `${p}.entries`, code: 'NO_ENTRIES', message: 'Name at least one metadata key' });
      if (keys.length > MAX_METADATA_ENTRIES) {
        problems.push({ path: `${p}.entries`, code: 'TOO_MANY_ENTRIES', message: `At most ${MAX_METADATA_ENTRIES} metadata keys`, args: [String(MAX_METADATA_ENTRIES)] });
      }
      if (keys.some(k => !k.trim() || k.startsWith('_') || k.length > 100)) {
        problems.push({ path: `${p}.entries`, code: 'BAD_KEY', message: 'Metadata keys must not be empty or start with _' });
      }
      break;
    }
    case 'NOTIFY': {
      const emails = (a.emails ?? []).map(e => e.trim()).filter(e => e);
      if (!emails.length) problems.push({ path: `${p}.emails`, code: 'NO_EMAIL', message: 'Name at least one e-mail address' });
      emails.filter(e => !validEmail(e)).forEach(e =>
        problems.push({ path: `${p}.emails`, code: 'BAD_EMAIL', message: `Invalid e-mail address '${e}'`, args: [e] }));
      break;
    }
    default:
      problems.push({ path: `${p}.type`, code: 'BAD_ACTION_TYPE', message: 'Action type is required' });
  }
}

function reachability(states: WorkflowState[], byKey: Map<string, WorkflowState>, problems: WorkflowProblem[]): void {
  const start = states.find(s => s.kind === 'START')!;
  const seen = new Set<string>();
  const queue = [start.key];
  while (queue.length) {
    const k = queue.shift()!;
    if (seen.has(k)) continue;
    seen.add(k);
    (byKey.get(k)?.transitions ?? []).forEach(t => queue.push(t.to));
  }
  states.forEach((s, i) => {
    if (!seen.has(s.key)) problems.push({ path: `states[${i}]`, code: 'UNREACHABLE', message: `Status '${s.label}' can never be reached`, args: [s.label] });
  });
  const reverse = new Map<string, Set<string>>();
  states.forEach(s => (s.transitions ?? []).forEach(t => {
    if (!reverse.has(t.to)) reverse.set(t.to, new Set());
    reverse.get(t.to)!.add(s.key);
  }));
  const canFinish = new Set<string>();
  const q2 = states.filter(s => s.kind === 'END').map(s => s.key);
  while (q2.length) {
    const k = q2.shift()!;
    if (canFinish.has(k)) continue;
    canFinish.add(k);
    reverse.get(k)?.forEach(p => q2.push(p));
  }
  states.forEach((s, i) => {
    if (s.kind !== 'END' && seen.has(s.key) && !canFinish.has(s.key)) {
      problems.push({ path: `states[${i}]`, code: 'DEAD_END', message: `Status '${s.label}' can never reach a final status`, args: [s.label] });
    }
  });
}

/**
 * i18n key of a problem, under `workflow.problem.*`. The `code` alone is ambiguous — the same rule
 * fires on a status, on a transition and on a metadata key — so the path tells the three apart.
 * Server-side problems carry the same codes and paths (the validators mirror each other), so both
 * sources go through here.
 */
export function problemMessageKey(p: WorkflowProblem): string {
  const onTransition = p.path.includes('.transitions[');
  const onAction = p.path.includes('.onEnter[');
  const scope = onAction ? 'action' : onTransition ? 'transition' : 'state';
  switch (p.code) {
    case 'BAD_KEY':
    case 'DUPLICATE_KEY':
    case 'BAD_LABEL':
    case 'NULL':
      return `workflow.problem.${p.code}.${scope}`;
    default:
      return `workflow.problem.${p.code}`;
  }
}

/**
 * Localised text of a problem. `t` is `TranslateService.instant`, which returns the key itself when
 * it is missing — that is the signal to fall back on the API's English `message`, so a code shipped
 * by a newer backend still reads as a sentence.
 */
export function problemMessage(p: WorkflowProblem, t: (key: string, params?: object) => string): string {
  const key = problemMessageKey(p);
  const text = t(key, { value: p.args?.[0] ?? '' });
  return !text || text === key ? p.message : text;
}

/** Problems keyed by the state index they point at (-1 = whole workflow). */
export function problemsByState(problems: WorkflowProblem[]): Map<number, WorkflowProblem[]> {
  const map = new Map<number, WorkflowProblem[]>();
  problems.forEach(p => {
    const m = /^states\[(\d+)\]/.exec(p.path);
    const idx = m ? Number(m[1]) : -1;
    if (!map.has(idx)) map.set(idx, []);
    map.get(idx)!.push(p);
  });
  return map;
}

// ── templates ────────────────────────────────────────────────────────────

export type WorkflowTemplateId = 'blank' | 'approval' | 'review-archive' | 'two-step';

/** Starter definitions of the designer. Labels are English defaults the user renames freely. */
export function templateSpec(id: WorkflowTemplateId, t: (key: string) => string): WorkflowSpec {
  const s = (key: string, label: string, kind: WorkflowState['kind'], color: string, extra: Partial<WorkflowState> = {}): WorkflowState =>
    ({ key, label, kind, color, transitions: [], onEnter: [], assignees: kind === 'END' ? null : (extra.assignees ?? { type: 'INITIATOR' }), ...extra });
  const tr = (key: string, label: string, to: string, style: WorkflowTransition['style'], requireComment = false): WorkflowTransition =>
    ({ key, label, to, style, requireComment });
  switch (id) {
    case 'approval':
      return { states: [
        s('draft', t('draft'), 'START', '#94a3b8', { transitions: [tr('submit', t('submit'), 'pending_approval', 'PRIMARY')] }),
        s('pending_approval', t('pendingApproval'), 'STEP', '#f59e0b', {
          assignees: { type: 'CHOSEN_AT_START', label: t('approver') }, dueInDays: 3,
          transitions: [tr('approve', t('approve'), 'approved', 'SUCCESS'), tr('reject', t('reject'), 'rejected', 'DANGER', true)] }),
        s('approved', t('approved'), 'END', '#10b981'),
        s('rejected', t('rejected'), 'END', '#ef4444')
      ] };
    case 'review-archive':
      return { states: [
        s('draft', t('draft'), 'START', '#94a3b8', { transitions: [tr('submit', t('submitForReview'), 'in_review', 'PRIMARY')] }),
        s('in_review', t('inReview'), 'STEP', '#3b82f6', {
          assignees: { type: 'CHOSEN_AT_START', label: t('reviewer') }, dueInDays: 5,
          transitions: [tr('approve', t('approve'), 'approved', 'SUCCESS'), tr('changes', t('requestChanges'), 'draft', 'NEUTRAL', true), tr('reject', t('reject'), 'rejected', 'DANGER', true)] }),
        s('approved', t('approved'), 'STEP', '#10b981', {
          assignees: { type: 'INITIATOR' },
          transitions: [tr('archive', t('archive'), 'archived', 'PRIMARY')] }),
        s('archived', t('archived'), 'END', '#64748b'),
        s('rejected', t('rejected'), 'END', '#ef4444')
      ] };
    case 'two-step':
      return { states: [
        s('draft', t('draft'), 'START', '#94a3b8', { transitions: [tr('submit', t('submit'), 'first_approval', 'PRIMARY')] }),
        s('first_approval', t('firstApproval'), 'STEP', '#f59e0b', {
          assignees: { type: 'CHOSEN_AT_START', label: t('firstApprover') }, dueInDays: 3,
          transitions: [tr('approve', t('approve'), 'second_approval', 'SUCCESS'), tr('reject', t('reject'), 'rejected', 'DANGER', true)] }),
        s('second_approval', t('secondApproval'), 'STEP', '#f97316', {
          assignees: { type: 'CHOSEN_AT_START', label: t('secondApprover') }, dueInDays: 3,
          transitions: [tr('approve', t('approve'), 'approved', 'SUCCESS'), tr('reject', t('reject'), 'rejected', 'DANGER', true)] }),
        s('approved', t('approved'), 'END', '#10b981'),
        s('rejected', t('rejected'), 'END', '#ef4444')
      ] };
    default:
      return { states: [
        s('draft', t('draft'), 'START', '#94a3b8', { transitions: [tr('done', t('done'), 'done', 'SUCCESS')] }),
        s('done', t('done'), 'END', '#10b981')
      ] };
  }
}

// ── diagram layout ───────────────────────────────────────────────────────

export interface DiagramNode { state: WorkflowState; col: number; row: number; x: number; y: number; w: number; h: number; }
export interface DiagramEdge { from: DiagramNode; to: DiagramNode; transition: WorkflowTransition; path: string; lx: number; ly: number; }
export interface DiagramLayout { nodes: DiagramNode[]; edges: DiagramEdge[]; width: number; height: number; }

export const NODE_W = 150;
export const NODE_H = 44;
const COL_GAP = 70;
const ROW_GAP = 26;
const PAD = 16;

/**
 * Layered left-to-right layout: BFS depth from START gives the column, order of first
 * discovery the row; END states are pushed to the last column. Edges are cubic curves
 * with the transition label at their middle; back edges bow underneath.
 */
export function layoutSpec(spec: WorkflowSpec): DiagramLayout {
  const states = spec?.states ?? [];
  if (!states.length) return { nodes: [], edges: [], width: 0, height: 0 };
  const byKey = new Map(states.map(s => [s.key, s]));
  const depth = new Map<string, number>();
  const order: string[] = [];
  const start = states.find(s => s.kind === 'START') ?? states[0];
  const queue: string[] = [start.key];
  depth.set(start.key, 0);
  while (queue.length) {
    const k = queue.shift()!;
    order.push(k);
    const d = depth.get(k)!;
    (byKey.get(k)?.transitions ?? []).forEach(t => {
      if (byKey.has(t.to) && !depth.has(t.to)) {
        depth.set(t.to, d + 1);
        queue.push(t.to);
      }
    });
  }
  states.forEach(s => { if (!depth.has(s.key)) { depth.set(s.key, 0); order.push(s.key); } });
  const maxDepth = Math.max(...[...depth.values()]);
  const lastCol = Math.max(maxDepth, 1);
  states.forEach(s => { if (s.kind === 'END') depth.set(s.key, lastCol); });
  const rowsPerCol = new Map<number, number>();
  const nodes: DiagramNode[] = [];
  order.forEach(k => {
    const s = byKey.get(k)!;
    const col = depth.get(k)!;
    const row = rowsPerCol.get(col) ?? 0;
    rowsPerCol.set(col, row + 1);
    nodes.push({ state: s, col, row, x: PAD + col * (NODE_W + COL_GAP), y: 0, w: NODE_W, h: NODE_H });
  });
  const maxRows = Math.max(...[...rowsPerCol.values()]);
  const height = PAD * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
  nodes.forEach(n => {
    const rows = rowsPerCol.get(n.col)!;
    const colHeight = rows * NODE_H + (rows - 1) * ROW_GAP;
    n.y = PAD + (height - PAD * 2 - colHeight) / 2 + n.row * (NODE_H + ROW_GAP);
  });
  const width = PAD * 2 + (lastCol + 1) * NODE_W + lastCol * COL_GAP;
  const nodeOf = new Map(nodes.map(n => [n.state.key, n]));
  const edges: DiagramEdge[] = [];
  nodes.forEach(from => from.state.transitions?.forEach(t => {
    const to = nodeOf.get(t.to);
    if (!to) return;
    let path: string, lx: number, ly: number;
    if (to === from) {
      const cx = from.x + from.w / 2;
      path = `M ${cx - 20} ${from.y} C ${cx - 40} ${from.y - 40}, ${cx + 40} ${from.y - 40}, ${cx + 20} ${from.y}`;
      lx = cx; ly = from.y - 34;
    } else if (to.col > from.col) {
      const x1 = from.x + from.w, y1 = from.y + from.h / 2, x2 = to.x, y2 = to.y + to.h / 2;
      const dx = (x2 - x1) / 2;
      path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      lx = (x1 + x2) / 2; ly = (y1 + y2) / 2 - 8;
    } else {
      // back edge (same column or earlier): bow under both nodes
      const x1 = from.x + from.w / 2, y1 = from.y + from.h, x2 = to.x + to.w / 2, y2 = to.y + to.h;
      const bow = Math.max(from.y, to.y) + NODE_H + 34 + Math.abs(from.col - to.col) * 6;
      path = `M ${x1} ${y1} C ${x1} ${bow}, ${x2} ${bow}, ${x2} ${y2}`;
      lx = (x1 + x2) / 2; ly = bow - 4;
    }
    edges.push({ from, to, transition: t, path, lx, ly });
  }));
  const extra = edges.some(e => e.to.col <= e.from.col && e.to !== e.from) ? 50 : 0;
  const top = edges.some(e => e.to === e.from) ? 40 : 0;
  return { nodes: nodes.map(n => ({ ...n, y: n.y + top })), edges: edges.map(e => shift(e, top)), width, height: height + extra + top };
}

function shift(e: DiagramEdge, dy: number): DiagramEdge {
  if (!dy) return e;
  const path = e.path.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${x} ${Number(y) + dy}`);
  return { ...e, path, ly: e.ly + dy, from: { ...e.from, y: e.from.y + dy }, to: { ...e.to, y: e.to.y + dy } };
}

/** Readable text colour (black / white) on a status colour. */
export function contrastColor(hex: string | null | undefined): string {
  const h = (hex ?? '#94a3b8').replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff';
}
