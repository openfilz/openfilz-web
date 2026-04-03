import { Component, EventEmitter, Output, inject, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { AiChatService } from '../../services/ai-chat.service';
import { AiChatPanelView } from '../../models/ai-chat.models';
import { AiConversationListComponent } from './ai-conversation-list.component';
import { AiChatViewComponent } from './ai-chat-view.component';

@Component({
  selector: 'app-ai-chat-panel',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    TranslatePipe,
    AiConversationListComponent,
    AiChatViewComponent
  ],
  templateUrl: './ai-chat-panel.component.html',
  styleUrls: ['./ai-chat-panel.component.css'],
  animations: [
    trigger('slideUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateY(20px)', opacity: 0 }))
      ])
    ])
  ]
})
export class AiChatPanelComponent implements OnInit, OnDestroy {
  @Output() closePanel = new EventEmitter<void>();

  chatService = inject(AiChatService);
  currentView: AiChatPanelView = 'conversations';
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.subscriptions.push(
      this.chatService.panelView$.subscribe(v => this.currentView = v)
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.chatService.cancelStreaming();
  }

  onClose(): void {
    this.closePanel.emit();
  }

  onBack(): void {
    this.chatService.goBackToList();
  }

  onNewConversation(): void {
    this.chatService.startNewConversation();
  }

  onConversationSelected(id: string): void {
    this.chatService.openConversation(id);
  }
}
