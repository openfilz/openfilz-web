export interface AiConversation {
  id: string;
  title: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  conversationId: string;
  content: string;
  type: 'MESSAGE' | 'DONE' | 'ERROR';
  role: 'user' | 'assistant';
}

export interface AiChatStreamEvent {
  conversationId: string;
  content: string;
  type: 'MESSAGE' | 'DONE' | 'ERROR';
  /** On DONE events: folders whose content was modified by tool calls ('root' for root level). */
  modifiedFolderIds?: string[];
}

export type AiChatPanelView = 'conversations' | 'chat';

/** One move of a reorganisation plan proposed by the assistant. */
export interface ReorganizationPlanItem {
  /** Also the key used to select the item on apply; null when the document could not be resolved. */
  documentId: string | null;
  name: string;
  type: 'FILE' | 'FOLDER' | null;
  /** Absolute path of the current parent folder ('/' = root level). */
  currentPath: string | null;
  /** Absolute path of the target folder. */
  targetPath: string | null;
  /** false = the target folder will be created. */
  targetExists: boolean;
  applicable: boolean;
  issue?: string;
}

export interface ReorganizationItemResult {
  documentId: string | null;
  outcome: 'MOVED' | 'SKIPPED' | 'FAILED';
  detail?: string;
}

export type ReorganizationPlanStatus = 'PROPOSED' | 'APPLIED' | 'PARTIALLY_APPLIED' | 'FAILED' | 'DISCARDED';

/** A validated reorganisation proposal, rendered as a card in the chat (GET /ai/reorganization/{id}). */
export interface ReorganizationPlan {
  id: string;
  status: ReorganizationPlanStatus;
  rootFolderId: string | null;
  rootFolderPath: string;
  rationale?: string;
  items: ReorganizationPlanItem[];
  foldersToCreate: string[];
  applicable: number;
  blocked: number;
  createdAt?: string;
  appliedAt?: string;
  results?: ReorganizationItemResult[];
}

export interface ReorganizationApplyResult {
  planId: string;
  status: ReorganizationPlanStatus;
  moved: number;
  failed: number;
  skipped: number;
  createdFolders: string[];
  /** Folders whose content changed ('root' for the root level) — the file explorer refreshes them. */
  modifiedFolderIds: string[];
  plan: ReorganizationPlan;
}
