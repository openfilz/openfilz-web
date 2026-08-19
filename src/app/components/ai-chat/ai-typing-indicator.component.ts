import { Component } from '@angular/core';

@Component({
  selector: 'app-ai-typing-indicator',
  standalone: true,
  template: `
    <div class="typing-indicator">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  `,
  styles: [`
    .typing-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 16px;
      background: var(--bg-tertiary, #f1f5f9);
      border-radius: 16px;
      margin: 4px 0;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-tertiary, #94a3b8);
      animation: bounce 1.4s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-6px); opacity: 1; }
    }
  `]
})
export class AiTypingIndicatorComponent {}
