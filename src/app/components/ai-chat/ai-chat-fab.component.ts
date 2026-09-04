import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiChatPanelComponent } from './ai-chat-panel.component';
import { AiChatService } from '../../services/ai-chat.service';

@Component({
  selector: 'app-ai-chat-fab',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    AiChatPanelComponent
  ],
  templateUrl: './ai-chat-fab.component.html',
  styleUrls: ['./ai-chat-fab.component.css']
})
export class AiChatFabComponent implements OnInit, OnDestroy {
  private chatService = inject(AiChatService);
  private openRequestedSubscription?: Subscription;
  isOpen = false;

  ngOnInit(): void {
    // Actions elsewhere in the app (e.g. "Organise with AI" on a folder) open the panel
    // through the service — see AiChatService.openWithPrompt().
    this.openRequestedSubscription = this.chatService.openRequested$.subscribe(() => this.isOpen = true);
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  close(): void {
    this.isOpen = false;
  }

  ngOnDestroy(): void {
    this.openRequestedSubscription?.unsubscribe();
    this.chatService.destroy();
  }
}
