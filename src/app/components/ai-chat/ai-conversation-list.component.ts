import { Component, EventEmitter, Output, inject, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { AiChatService } from '../../services/ai-chat.service';
import { AiConversation } from '../../models/ai-chat.models';

@Component({
  selector: 'app-ai-conversation-list',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    TranslatePipe
  ],
  templateUrl: './ai-conversation-list.component.html',
  styleUrls: ['./ai-conversation-list.component.css']
})
export class AiConversationListComponent implements OnInit, OnDestroy {
  @Output() conversationSelected = new EventEmitter<string>();
  @Output() newConversation = new EventEmitter<void>();

  chatService = inject(AiChatService);
  conversations: AiConversation[] = [];
  loading = false;
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.subscriptions.push(
      this.chatService.conversations$.subscribe(c => this.conversations = c),
      this.chatService.conversationsLoading$.subscribe(l => this.loading = l)
    );
    this.chatService.loadConversations().subscribe();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  onSelect(id: string): void {
    this.conversationSelected.emit(id);
  }

  onNew(): void {
    this.newConversation.emit();
  }

  onDelete(event: Event, id: string): void {
    event.stopPropagation();
    this.chatService.deleteConversation(id).subscribe();
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}
