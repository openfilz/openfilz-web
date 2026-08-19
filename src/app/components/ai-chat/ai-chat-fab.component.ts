import { Component, OnDestroy, inject } from '@angular/core';
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
export class AiChatFabComponent implements OnDestroy {
  private chatService = inject(AiChatService);
  isOpen = false;

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  close(): void {
    this.isOpen = false;
  }

  ngOnDestroy(): void {
    this.chatService.destroy();
  }
}
