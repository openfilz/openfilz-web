import { Injectable, inject, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, firstValueFrom, isObservable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { environment } from '../../environments/environment';
import { SettingsService, aiNoModelOf, isAiKeyUnreadable } from './settings.service';
import { AiNoModelService } from './ai-no-model.service';
import {
  AiConversation,
  AiMessage,
  AiChatStreamEvent,
  AiChatPanelView,
  ReorganizationApplyResult,
  ReorganizationPlan
} from '../models/ai-chat.models';

@Injectable({ providedIn: 'root' })
export class AiChatService {
  private http = inject(HttpClient);
  private oidcSecurityService = inject(OidcSecurityService);
  private ngZone = inject(NgZone);
  private settingsService = inject(SettingsService);
  private aiNoModel = inject(AiNoModelService);

  private readonly baseUrl = environment.apiURL;

  // State
  conversations$ = new BehaviorSubject<AiConversation[]>([]);
  currentMessages$ = new BehaviorSubject<AiMessage[]>([]);
  currentConversationId$ = new BehaviorSubject<string | null>(null);
  isStreaming$ = new BehaviorSubject<boolean>(false);
  panelView$ = new BehaviorSubject<AiChatPanelView>('conversations');
  conversationsLoading$ = new BehaviorSubject<boolean>(false);
  /** Emits after a chat turn whose tool calls modified folder contents (folder ids, 'root' for root level). */
  folderContentChanged$ = new Subject<string[]>();
  /** Asks the chat FAB to show the panel (see {@link openWithPrompt}). */
  openRequested$ = new Subject<void>();
  /** Asks the chat FAB to hide the panel (the "No AI model yet" panel sent the user to Settings). */
  closeRequested$ = new Subject<void>();

  private abortController: AbortController | null = null;

  /**
   * The chat is offered: AI on and the assistant not switched off (a missing model keeps it offered,
   * the panel then shows "No AI model yet" in place of the input — see {@link AiNoModelService}).
   */
  get isEnabled(): boolean {
    return this.settingsService.isAiChatOffered;
  }

  loadConversations(): Observable<AiConversation[]> {
    this.conversationsLoading$.next(true);
    return this.http.get<AiConversation[]>(`${this.baseUrl}/ai/conversations`).pipe(
      tap(conversations => {
        this.conversations$.next(conversations);
        this.conversationsLoading$.next(false);
      })
    );
  }

  loadConversationMessages(conversationId: string): Observable<AiMessage[]> {
    return this.http.get<AiMessage[]>(`${this.baseUrl}/ai/conversations/${conversationId}`).pipe(
      tap(messages => {
        // Backend returns messages without role distinction via this endpoint;
        // they alternate user/assistant. We need to infer role from content or accept
        // the response as-is. The backend returns AiChatResponse with content+type.
        // For history, we map them with alternating roles based on position.
        const mapped = messages.map((msg, i) => ({
          ...msg,
          role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant'
        }));
        this.currentMessages$.next(mapped);
        this.currentConversationId$.next(conversationId);
      })
    );
  }

  deleteConversation(conversationId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/ai/conversations/${conversationId}`).pipe(
      tap(() => {
        const updated = this.conversations$.value.filter(c => c.id !== conversationId);
        this.conversations$.next(updated);
        if (this.currentConversationId$.value === conversationId) {
          this.currentConversationId$.next(null);
          this.currentMessages$.next([]);
          this.panelView$.next('conversations');
        }
      })
    );
  }

  startNewConversation(): void {
    this.currentConversationId$.next(null);
    this.currentMessages$.next([]);
    this.panelView$.next('chat');
  }

  openConversation(conversationId: string): void {
    this.loadConversationMessages(conversationId).subscribe(() => {
      this.panelView$.next('chat');
    });
  }

  goBackToList(): void {
    this.panelView$.next('conversations');
    this.loadConversations().subscribe();
  }

  /**
   * Open the chat panel on a fresh conversation and send `prompt` right away — the entry
   * point of actions such as "Organise with AI" on a folder. The FAB listens to
   * {@link openRequested$} and shows the panel; the chat view renders the streamed answer
   * from {@link currentMessages$} whether or not it existed when the request was sent.
   */
  openWithPrompt(prompt: string): void {
    if (!this.isEnabled || !prompt.trim()) {
      return;
    }
    this.cancelStreaming();
    this.startNewConversation();
    this.openRequested$.next();
    if (this.aiNoModel.noModel) {
      // Nothing can answer: the panel shows "No AI model yet" instead of sending the prompt
      return;
    }
    void this.sendMessage(prompt.trim());
  }

  cancelStreaming(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isStreaming$.next(false);
  }

  async sendMessage(message: string): Promise<void> {
    const conversationId = this.currentConversationId$.value;

    // Add user message immediately
    const userMsg: AiMessage = {
      conversationId: conversationId || '',
      content: message,
      type: 'MESSAGE',
      role: 'user'
    };
    this.currentMessages$.next([...this.currentMessages$.value, userMsg]);

    // Add empty assistant message placeholder
    const assistantMsg: AiMessage = {
      conversationId: conversationId || '',
      content: '',
      type: 'MESSAGE',
      role: 'assistant'
    };
    this.currentMessages$.next([...this.currentMessages$.value, assistantMsg]);
    this.isStreaming$.next(true);

    try {
      const tokenResult = this.oidcSecurityService.getAccessToken();
      const token = await firstValueFrom(isObservable(tokenResult) ? tokenResult : of(tokenResult));
      this.abortController = new AbortController();

      const body = JSON.stringify({
        message,
        conversationId: conversationId || undefined
      });

      const response = await fetch(`${this.baseUrl}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body,
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const conflict = response.status === 409 ? await response.json().catch(() => null) : null;
        if (isAiKeyUnreadable(response.status, conflict)) {
          // The user's saved key can no longer be read: drop the unanswered turn, the chat asks them to save it again
          this.ngZone.run(() => {
            this.currentMessages$.next(this.currentMessages$.value.filter(m => m !== userMsg && m !== assistantMsg));
            this.aiNoModel.reportKeyUnreadable();
          });
          return;
        }
        const refusal = response.status === 409 ? aiNoModelOf(409, conflict) : null;
        if (refusal) {
          // No chat model resolves for this user: drop the unanswered turn, the panel takes the input's place
          this.ngZone.run(() => {
            this.currentMessages$.next(this.currentMessages$.value.filter(m => m !== userMsg && m !== assistantMsg));
            this.aiNoModel.reportServerRefusal(refusal);
          });
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event: AiChatStreamEvent = JSON.parse(jsonStr);
            this.ngZone.run(() => this.handleStreamEvent(event));
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.ngZone.run(() => {
        const msgs = [...this.currentMessages$.value];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'assistant') {
          last.type = 'ERROR';
          last.content = last.content || err.message || 'An error occurred';
          this.currentMessages$.next(msgs);
        }
      });
    } finally {
      this.ngZone.run(() => {
        this.isStreaming$.next(false);
        this.abortController = null;
      });
    }
  }

  private handleStreamEvent(event: AiChatStreamEvent): void {
    if (event.type === 'MESSAGE') {
      const msgs = [...this.currentMessages$.value];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        last.content += event.content || '';
        if (!last.conversationId && event.conversationId) {
          last.conversationId = event.conversationId;
          this.currentConversationId$.next(event.conversationId);
        }
      }
      this.currentMessages$.next(msgs);
    } else if (event.type === 'DONE') {
      if (event.conversationId) {
        this.currentConversationId$.next(event.conversationId);
      }
      if (event.modifiedFolderIds?.length) {
        this.folderContentChanged$.next(event.modifiedFolderIds);
      }
      this.isStreaming$.next(false);
    } else if (event.type === 'ERROR') {
      const msgs = [...this.currentMessages$.value];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        last.type = 'ERROR';
        last.content = event.content || 'An error occurred';
      }
      this.currentMessages$.next(msgs);
      this.isStreaming$.next(false);
    }
  }

  // ── Reorganisation proposals (the [[reorg-plan:id]] cards) ──────────────

  getReorganizationPlan(planId: string): Observable<ReorganizationPlan> {
    return this.http.get<ReorganizationPlan>(`${this.baseUrl}/ai/reorganization/${planId}`);
  }

  /** Apply the selected items (all applicable ones when empty); the file explorer refreshes the touched folders. */
  applyReorganizationPlan(planId: string, itemIds: string[]): Observable<ReorganizationApplyResult> {
    return this.http.post<ReorganizationApplyResult>(`${this.baseUrl}/ai/reorganization/${planId}/apply`, { itemIds }).pipe(
      tap(result => {
        if (result.modifiedFolderIds?.length) {
          this.folderContentChanged$.next(result.modifiedFolderIds);
        }
      })
    );
  }

  discardReorganizationPlan(planId: string): Observable<ReorganizationPlan> {
    return this.http.post<ReorganizationPlan>(`${this.baseUrl}/ai/reorganization/${planId}/discard`, {});
  }

  destroy(): void {
    this.cancelStreaming();
  }
}
