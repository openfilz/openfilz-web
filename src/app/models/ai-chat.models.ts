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
}

export type AiChatPanelView = 'conversations' | 'chat';
