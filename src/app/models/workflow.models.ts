/**
 * API contract of `/api/v1/workflows/**` (openfilz-core `docs/workflows.md`).
 * Dedicated file so the enterprise fork takes it as-is.
 */

export type WorkflowStateKind = 'START' | 'STEP' | 'END';
export type WorkflowAssigneeType = 'INITIATOR' | 'USERS' | 'ROLE' | 'CHOSEN_AT_START';
export type WorkflowActionType = 'MOVE_TO_FOLDER' | 'SET_METADATA' | 'NOTIFY';
export type WorkflowTransitionStyle = 'PRIMARY' | 'SUCCESS' | 'DANGER' | 'NEUTRAL';
export type WorkflowInstanceStatus = 'RUNNING' | 'COMPLETED' | 'CANCELLED';
export type WorkflowTaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type WorkflowEventType = 'STARTED' | 'TRANSITIONED' | 'ACTION_APPLIED' | 'ACTION_FAILED' | 'REASSIGNED'
  | 'REMINDED' | 'COMPLETED' | 'CANCELLED';

export interface WorkflowAssignment {
  type: WorkflowAssigneeType;
  emails?: string[];
  role?: string;
  /** CHOSEN_AT_START: the question shown to the person starting the workflow. */
  label?: string;
}

export interface WorkflowTransition {
  key: string;
  label: string;
  to: string;
  style?: WorkflowTransitionStyle;
  requireComment?: boolean;
}

export interface WorkflowAction {
  type: WorkflowActionType;
  folderId?: string | null;
  entries?: Record<string, string>;
  emails?: string[];
}

export interface WorkflowState {
  key: string;
  label: string;
  kind: WorkflowStateKind;
  color?: string | null;
  assignees?: WorkflowAssignment | null;
  dueInDays?: number | null;
  transitions: WorkflowTransition[];
  onEnter?: WorkflowAction[];
}

export interface WorkflowSpec {
  states: WorkflowState[];
}

export interface WorkflowProblem {
  path: string;
  code: string;
  /** English fallback, already interpolated — only shown for codes the UI does not know. */
  message: string;
  /** Dynamic bits of the message (a key, a label, a limit…) the UI re-interpolates in its own language. */
  args?: string[];
}

export interface WorkflowValidationResult {
  valid: boolean;
  problems: WorkflowProblem[];
}

export interface SaveWorkflowDefinitionRequest {
  name: string;
  description?: string | null;
  active?: boolean;
  spec: WorkflowSpec;
  triggerFolderIds?: string[];
}

export interface WorkflowDefinitionDTO {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  spec: WorkflowSpec;
  triggerFolderIds: string[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  runningCount: number;
}

export interface StartWorkflowRequest {
  definitionId: string;
  documentId: string;
  assignments?: Record<string, string[]>;
  transitionKey?: string | null;
  comment?: string | null;
}

export interface CompleteTaskRequest {
  transitionKey: string;
  comment?: string | null;
}

export interface ReassignTaskRequest {
  emails: string[];
  comment?: string | null;
}

export interface WorkflowTaskDTO {
  id: string;
  instanceId: string;
  definitionId: string;
  definitionName: string;
  documentId: string;
  documentName: string;
  stateKey: string;
  stateLabel: string;
  stateColor: string | null;
  status: WorkflowTaskStatus;
  candidates: string[];
  candidateRole: string | null;
  startedBy: string;
  createdAt: string;
  dueAt: string | null;
  overdue: boolean;
  completedAt: string | null;
  completedBy: string | null;
  transitionKey: string | null;
  comment: string | null;
  transitions: WorkflowTransition[];
  previousComment: string | null;
  previousActor: string | null;
  mine: boolean;
}

export interface WorkflowInstanceDTO {
  id: string;
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  documentId: string;
  documentName: string;
  status: WorkflowInstanceStatus;
  currentStateKey: string;
  currentStateLabel: string;
  currentStateColor: string | null;
  startedBy: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  currentTask: WorkflowTaskDTO | null;
}

export interface WorkflowEventDTO {
  id: string;
  type: WorkflowEventType;
  fromState: string | null;
  toState: string | null;
  transitionKey: string | null;
  actor: string | null;
  comment: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkflowInstanceDetailDTO {
  instance: WorkflowInstanceDTO;
  spec: WorkflowSpec;
  assignments: Record<string, string[]>;
  history: WorkflowEventDTO[];
  canManage: boolean;
}

export interface WorkflowInstancePage {
  items: WorkflowInstanceDTO[];
  total: number;
  page: number;
  size: number;
}

export interface WorkflowSummaryDTO {
  running: number;
  completed: number;
  cancelled: number;
  overdue: number;
  byDefinition: { definitionId: string; definitionName: string; running: number; completed: number; cancelled: number }[];
}

export interface MyTasksCountDTO {
  count: number;
  overdue: number;
}

/** Palette offered by the designer for statuses. */
export const WORKFLOW_COLORS = ['#94a3b8', '#3b82f6', '#8b5cf6', '#f59e0b', '#f97316', '#10b981', '#ef4444', '#14b8a6', '#ec4899'];

export const TRANSITION_STYLES: WorkflowTransitionStyle[] = ['PRIMARY', 'SUCCESS', 'DANGER', 'NEUTRAL'];
