import { Component, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { AiChatService } from '../../services/ai-chat.service';
import { AiMessage } from '../../models/ai-chat.models';
import { AiMessageComponent } from './ai-message.component';
import { AiTypingIndicatorComponent } from './ai-typing-indicator.component';

@Component({
  selector: 'app-ai-chat-view',
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    TranslatePipe,
    AiMessageComponent,
    AiTypingIndicatorComponent
  ],
  templateUrl: './ai-chat-view.component.html',
  styleUrls: ['./ai-chat-view.component.css']
})
export class AiChatViewComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('messageInput') messageInput!: ElementRef<HTMLTextAreaElement>;

  chatService = inject(AiChatService);

  messages: AiMessage[] = [];
  isStreaming = false;
  inputText = '';
  private shouldScrollToBottom = false;
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.subscriptions.push(
      this.chatService.currentMessages$.subscribe(msgs => {
        this.messages = msgs;
        this.shouldScrollToBottom = true;
      }),
      this.chatService.isStreaming$.subscribe(s => this.isStreaming = s)
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  async onSend(): Promise<void> {
    const text = this.inputText.trim();
    if (!text || this.isStreaming) return;
    this.inputText = '';
    this.resetTextareaHeight();
    await this.chatService.sendMessage(text);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  onInput(): void {
    // Auto-resize textarea
    const textarea = this.messageInput?.nativeElement;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }

  private resetTextareaHeight(): void {
    const textarea = this.messageInput?.nativeElement;
    if (textarea) {
      textarea.style.height = 'auto';
    }
  }

  private scrollToBottom(): void {
    const container = this.messagesContainer?.nativeElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}
