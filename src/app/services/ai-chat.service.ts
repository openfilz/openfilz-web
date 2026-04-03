import { Injectable, inject, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom, isObservable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { environment } from '../../environments/environment';
import {
  AiConversation,
  AiMessage,
  AiChatStreamEvent,
  AiChatPanelView
} from '../models/ai-chat.models';

@Injectable({ providedIn: 'root' })
export class AiChatService {
  private http = inject(HttpClient);
  private oidcSecurityService = inject(OidcSecurityService);
  private ngZone = inject(NgZone);

  private readonly baseUrl = environment.apiURL;

  // State
  conversations$ = new BehaviorSubject<AiConversation[]>([]);
  currentMessages$ = new BehaviorSubject<AiMessage[]>([]);
  currentConversationId$ = new BehaviorSubject<string | null>(null);
  isStreaming$ = new BehaviorSubject<boolean>(false);
  panelView$ = new BehaviorSubject<AiChatPanelView>('conversations');
  conversationsLoading$ = new BehaviorSubject<boolean>(false);

  private abortController: AbortController | null = null;

  get isEnabled(): boolean {
    return environment.ai.enabled;
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

  destroy(): void {
    this.cancelStreaming();
  }
}
