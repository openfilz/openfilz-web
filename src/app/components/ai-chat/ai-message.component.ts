import { Component, Input, inject, ElementRef, AfterViewInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { AiMessage } from '../../models/ai-chat.models';
import { AiMarkdownService } from '../../services/ai-markdown.service';
import { MatIconModule } from '@angular/material/icon';

/**
 * Regex to match document reference markers: [[doc:id:parentId:type:name]]
 * Captures: id, parentId, type, name
 */
const DOC_REF_REGEX = /\[\[doc:([a-f0-9-]+):([a-f0-9-]+|root):(FILE|FOLDER):([^\]]+)\]\]/g;

@Component({
  selector: 'app-ai-message',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="message" [class.user]="message.role === 'user'" [class.assistant]="message.role === 'assistant'" [class.error]="message.type === 'ERROR'">
      @if (message.role === 'assistant') {
        <div class="avatar assistant-avatar">
          <mat-icon>smart_toy</mat-icon>
        </div>
      }
      <div class="bubble" [class.user-bubble]="message.role === 'user'" [class.assistant-bubble]="message.role === 'assistant'" [class.error-bubble]="message.type === 'ERROR'">
        @if (message.type === 'ERROR') {
          <mat-icon class="error-icon">warning</mat-icon>
        }
        @if (message.role === 'user') {
          <span class="user-text">{{ message.content }}</span>
        } @else {
          <div class="markdown-content" #contentEl [innerHTML]="renderedContent"></div>
        }
      </div>
    </div>
  `,
  styles: [`
    .message {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      align-items: flex-start;
    }
    .message.user {
      flex-direction: row-reverse;
    }
    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .assistant-avatar {
      background: var(--primary, #6366f1);
      color: white;
    }
    .assistant-avatar mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .bubble {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 16px;
      line-height: 1.5;
      font-size: 14px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      user-select: text;
      -webkit-user-select: text;
    }
    .user-bubble {
      background: var(--primary, #6366f1);
      color: white;
      border-bottom-right-radius: 4px;
    }
    .assistant-bubble {
      background: var(--bg-tertiary, #f1f5f9);
      color: var(--text-primary, #1e293b);
      border-bottom-left-radius: 4px;
    }
    .error-bubble {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }
    .error-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      vertical-align: middle;
      margin-right: 4px;
      color: #dc2626;
    }
    .user-text {
      white-space: pre-wrap;
      user-select: text;
      -webkit-user-select: text;
    }
    .markdown-content {
      overflow-x: auto;
      user-select: text;
      -webkit-user-select: text;
      cursor: text;
    }
    :host ::ng-deep .markdown-content p {
      margin: 0 0 8px 0;
    }
    :host ::ng-deep .markdown-content p:last-child {
      margin-bottom: 0;
    }
    :host ::ng-deep .markdown-content pre {
      background: var(--bg-primary, #1e293b);
      color: #e2e8f0;
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 13px;
      margin: 8px 0;
    }
    :host ::ng-deep .markdown-content code:not(pre code) {
      background: var(--bg-secondary, #f8fafc);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
    :host ::ng-deep .markdown-content ul,
    :host ::ng-deep .markdown-content ol {
      margin: 4px 0;
      padding-left: 20px;
    }
    :host ::ng-deep .markdown-content a {
      color: var(--primary, #6366f1);
    }
    :host ::ng-deep .doc-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--primary, #6366f1);
      cursor: pointer;
      text-decoration: none;
      font-weight: 500;
      border-radius: 4px;
      padding: 1px 4px;
      margin: 0 1px;
      transition: background 0.15s;
    }
    :host ::ng-deep .doc-link:hover {
      background: rgba(99, 102, 241, 0.1);
      text-decoration: underline;
    }
    :host ::ng-deep .doc-link .doc-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      vertical-align: middle;
      font-family: 'Material Icons';
      font-style: normal;
    }

    :host-context([dir="rtl"]) .message.user {
      flex-direction: row-reverse;
    }
    :host-context([dir="rtl"]) .user-bubble {
      border-bottom-right-radius: 16px;
      border-bottom-left-radius: 4px;
    }
    :host-context([dir="rtl"]) .assistant-bubble {
      border-bottom-left-radius: 16px;
      border-bottom-right-radius: 4px;
    }
  `]
})
export class AiMessageComponent implements AfterViewInit {
  @Input() message!: AiMessage;

  private markdownService = inject(AiMarkdownService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private elRef = inject(ElementRef);

  get renderedContent(): SafeHtml {
    if (!this.message?.content) return '';
    // 1. Render markdown first (markers pass through as plain text)
    let html = this.markdownService.render(this.message.content);
    // 2. Then replace [[doc:...]] markers in the rendered HTML with clickable links
    html = html.replace(DOC_REF_REGEX, (_match, id, parentId, type, name) => {
      const icon = type === 'FOLDER' ? 'folder' : 'description';
      return `<a class="doc-link" data-doc-id="${id}" data-parent-id="${parentId}" data-type="${type}"><span class="doc-icon">${icon}</span>${name}</a>`;
    });
    // Bypass Angular sanitizer to preserve data-* attributes on doc-links
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  ngAfterViewInit(): void {
    // Use event delegation — one listener catches all doc-link clicks via bubbling
    (this.elRef.nativeElement as HTMLElement).addEventListener('click', (e: Event) => {
      const target = (e.target as HTMLElement).closest('.doc-link') as HTMLElement | null;
      if (!target) return;
      e.preventDefault();

      const docId = target.getAttribute('data-doc-id');
      const parentId = target.getAttribute('data-parent-id');
      const type = target.getAttribute('data-type');

      if (type === 'FOLDER') {
        this.router.navigate(['/my-folder'], { queryParams: { folderId: docId } });
      } else {
        // Same behavior as search suggestion click: navigate to parent folder and open file viewer
        this.router.navigate(['/my-folder'], {
          queryParams: { targetFileId: docId, openViewer: 'true' }
        });
      }
    });
  }
}
