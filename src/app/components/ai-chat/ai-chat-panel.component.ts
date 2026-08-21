import { Component, EventEmitter, Output, inject, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { AiChatService } from '../../services/ai-chat.service';
import { AiSettingsService } from '../../services/ai-settings.service';
import { SettingsService } from '../../services/settings.service';
import { AiChatPanelView } from '../../models/ai-chat.models';
import { AiUserSettings } from '../../models/ai-settings.models';
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
  private aiSettingsService = inject(AiSettingsService);
  private settingsService = inject(SettingsService);
  currentView: AiChatPanelView = 'conversations';
  private aiSettings: AiUserSettings | null = null;
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.subscriptions.push(
      this.chatService.panelView$.subscribe(v => this.currentView = v)
    );
    // Badge showing which LLM answers (server default, or the user's BYOK override).
    // Only fetched when BYOK is on — otherwise the default model isn't user-facing information.
    if (this.settingsService.isAiUserSettingsEnabled) {
      this.subscriptions.push(
        this.aiSettingsService.settings$.subscribe(s => this.aiSettings = s)
      );
      if (!this.aiSettingsService.settings) {
        this.subscriptions.push(this.aiSettingsService.loadSettings().subscribe({ error: () => {} }));
      }
    }
  }

  /** "ANTHROPIC · claude-opus-5" for a BYOK override, "ollama · qwen2.5" for the server default. */
  get modelBadge(): string {
    const s = this.aiSettings;
    if (!s) {
      return '';
    }
    if (s.provider) {
      return s.model ? `${s.provider} · ${s.model}` : s.provider;
    }
    return s.defaultModel ? `${s.defaultProvider} · ${s.defaultModel}` : s.defaultProvider;
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
