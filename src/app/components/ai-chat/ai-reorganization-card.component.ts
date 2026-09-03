import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { AiChatService } from '../../services/ai-chat.service';
import {
  ReorganizationItemResult,
  ReorganizationPlan,
  ReorganizationPlanItem
} from '../../models/ai-chat.models';

/** Items of a plan that share a target folder. */
interface TargetGroup {
  targetPath: string;
  targetExists: boolean;
  items: ReorganizationPlanItem[];
}

/**
 * Interactive proposal card for a reorganisation plan the assistant proposed
 * ([[reorg-plan:id]] marker in the message). The user reviews the moves, ticks the ones
 * to keep, and applies or discards the plan. The plan is fetched from the backend so the
 * card is faithful after a reload, and it refreshes whenever a chat turn changes folders
 * (the assistant may have applied the plan itself on the user's say-so).
 */
@Component({
  selector: 'app-ai-reorganization-card',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatCheckboxModule, MatTooltipModule, TranslatePipe],
  template: `
    <div class="plan-card" [class.done]="plan && plan.status !== 'PROPOSED'">
      @if (loading && !plan) {
        <div class="plan-loading">
          <mat-icon>hourglass_top</mat-icon>
          <span>{{ 'aiChat.reorg.loading' | translate }}</span>
        </div>
      } @else if (error) {
        <div class="plan-error">
          <mat-icon>warning</mat-icon>
          <span>{{ 'aiChat.reorg.loadError' | translate }}</span>
        </div>
      } @else if (plan) {
        <div class="plan-header">
          <mat-icon class="plan-icon">drive_file_move</mat-icon>
          <div class="plan-title-block">
            <div class="plan-title">{{ 'aiChat.reorg.title' | translate }}</div>
            <div class="plan-subtitle">
              <span class="plan-root" [matTooltip]="plan.rootFolderPath">{{ plan.rootFolderPath }}</span>
              <span class="dot">·</span>
              <span>{{ 'aiChat.reorg.summary' | translate: { applicable: plan.applicable, blocked: plan.blocked } }}</span>
            </div>
          </div>
          <span class="status-chip" [attr.data-status]="plan.status">{{ 'aiChat.reorg.status.' + plan.status | translate }}</span>
        </div>

        @if (plan.rationale) {
          <p class="plan-rationale">{{ plan.rationale }}</p>
        }

        @if (plan.foldersToCreate.length && plan.status === 'PROPOSED') {
          <div class="new-folders">
            <span class="new-folders-label">{{ 'aiChat.reorg.foldersToCreate' | translate }}</span>
            @for (path of plan.foldersToCreate; track path) {
              <span class="folder-chip"><mat-icon>create_new_folder</mat-icon>{{ relative(path) }}</span>
            }
          </div>
        }

        @if (plan.status === 'PROPOSED') {
          <div class="selection-bar">
            <button mat-button class="small-btn" type="button" (click)="selectAll()" [disabled]="applying">
              {{ 'aiChat.reorg.selectAll' | translate }}
            </button>
            <button mat-button class="small-btn" type="button" (click)="selectNone()" [disabled]="applying">
              {{ 'aiChat.reorg.selectNone' | translate }}
            </button>
          </div>
        }

        <div class="groups">
          @for (group of groups; track group.targetPath) {
            <div class="group">
              <div class="group-header">
                <mat-icon>{{ group.targetExists ? 'folder' : 'create_new_folder' }}</mat-icon>
                <span class="group-path" [matTooltip]="group.targetPath">{{ relative(group.targetPath) }}</span>
                @if (!group.targetExists) {
                  <span class="new-tag">{{ 'aiChat.reorg.newFolder' | translate }}</span>
                }
              </div>
              @for (item of group.items; track item.documentId ?? item.name) {
                <div class="item" [class.blocked]="!item.applicable" [class.item-done]="outcomeOf(item)">
                  @if (plan.status === 'PROPOSED') {
                    <mat-checkbox
                      [checked]="isSelected(item)"
                      [disabled]="!item.applicable || applying"
                      (change)="toggle(item, $event.checked)">
                    </mat-checkbox>
                  } @else {
                    <mat-icon class="outcome-icon" [attr.data-outcome]="outcomeOf(item)?.outcome ?? 'SKIPPED'"
                              [matTooltip]="outcomeOf(item)?.detail ?? ''">
                      {{ outcomeIcon(item) }}
                    </mat-icon>
                  }
                  <mat-icon class="item-type">{{ item.type === 'FOLDER' ? 'folder' : 'description' }}</mat-icon>
                  <div class="item-text">
                    <span class="item-name">{{ item.name }}</span>
                    @if (item.currentPath) {
                      <span class="item-from">{{ 'aiChat.reorg.from' | translate }} {{ item.currentPath }}</span>
                    }
                    @if (!item.applicable && item.issue) {
                      <span class="item-issue"><mat-icon>block</mat-icon>{{ item.issue }}</span>
                    }
                    @if (outcomeOf(item); as outcome) {
                      <span class="item-outcome" [attr.data-outcome]="outcome.outcome">
                        {{ 'aiChat.reorg.outcome.' + outcome.outcome | translate }}@if (outcome.detail) {: {{ outcome.detail }}}
                      </span>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>

        @if (plan.status === 'PROPOSED') {
          <div class="plan-actions">
            <button mat-stroked-button type="button" (click)="discard()" [disabled]="applying">
              {{ 'aiChat.reorg.discard' | translate }}
            </button>
            <button mat-flat-button color="primary" type="button" (click)="apply()" [disabled]="applying || selected.size === 0">
              @if (applying) {
                {{ 'aiChat.reorg.applying' | translate }}
              } @else {
                {{ 'aiChat.reorg.apply' | translate: { count: selected.size } }}
              }
            </button>
          </div>
        } @else if (plan.results) {
          <div class="plan-result" [attr.data-status]="plan.status">
            <mat-icon>{{ plan.status === 'APPLIED' ? 'check_circle' : plan.status === 'DISCARDED' ? 'cancel' : 'error_outline' }}</mat-icon>
            <span>{{ 'aiChat.reorg.applied' | translate: { moved: movedCount, failed: failedCount } }}</span>
          </div>
        }
        @if (actionError) {
          <div class="plan-error">
            <mat-icon>warning</mat-icon>
            <span>{{ actionError }}</span>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .plan-card {
      margin-top: 8px;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 12px;
      background: var(--bg-primary, #ffffff);
      color: var(--text-primary, #1e293b);
      font-size: 13px;
      overflow: hidden;
    }
    .plan-card.done { opacity: 0.92; }
    .plan-loading, .plan-error {
      display: flex; align-items: center; gap: 8px; padding: 12px 14px;
    }
    .plan-error { color: #991b1b; }
    .plan-header {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px 8px 14px;
    }
    .plan-icon {
      color: var(--primary, #6366f1);
      background: rgba(99, 102, 241, 0.12);
      border-radius: 8px;
      padding: 6px;
      font-size: 20px; width: 20px; height: 20px;
      flex-shrink: 0;
    }
    .plan-title-block { flex: 1; min-width: 0; }
    .plan-title { font-weight: 600; font-size: 14px; }
    .plan-subtitle {
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
      color: var(--text-secondary, #64748b); font-size: 12px; margin-top: 2px;
    }
    .plan-root {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;
    }
    .status-chip {
      flex-shrink: 0;
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;
      padding: 3px 8px; border-radius: 999px;
      background: var(--bg-tertiary, #f1f5f9); color: var(--text-secondary, #64748b);
    }
    .status-chip[data-status="PROPOSED"] { background: rgba(99, 102, 241, 0.12); color: var(--primary, #6366f1); }
    .status-chip[data-status="APPLIED"] { background: #dcfce7; color: #166534; }
    .status-chip[data-status="PARTIALLY_APPLIED"] { background: #fef3c7; color: #92400e; }
    .status-chip[data-status="FAILED"] { background: #fee2e2; color: #991b1b; }
    .plan-rationale {
      margin: 0; padding: 0 14px 8px 14px;
      color: var(--text-secondary, #64748b); font-style: italic;
    }
    .new-folders {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      padding: 0 14px 8px 14px;
    }
    .new-folders-label { color: var(--text-secondary, #64748b); font-size: 12px; }
    .folder-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 999px;
      background: var(--bg-tertiary, #f1f5f9); font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .folder-chip mat-icon, .group-header mat-icon, .item-type, .item-issue mat-icon {
      font-size: 16px; width: 16px; height: 16px;
    }
    .selection-bar {
      display: flex; gap: 4px; padding: 0 8px 4px 8px;
    }
    .small-btn { font-size: 12px; min-width: 0; padding: 0 8px; height: 28px; line-height: 28px; }
    .groups { border-top: 1px solid var(--border-color, #e2e8f0); }
    .group { padding: 6px 0; border-bottom: 1px solid var(--border-color, #e2e8f0); }
    .group:last-child { border-bottom: none; }
    .group-header {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 14px; font-weight: 600;
    }
    .group-header mat-icon { color: var(--primary, #6366f1); }
    .group-path {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .new-tag {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      padding: 1px 6px; border-radius: 999px;
      background: #dcfce7; color: #166534;
    }
    .item {
      display: flex; align-items: flex-start; gap: 6px;
      padding: 2px 14px 2px 10px;
    }
    .item.blocked { opacity: 0.7; }
    .item mat-checkbox { margin-top: -6px; margin-left: -4px; }
    .item-type { color: var(--text-secondary, #64748b); margin-top: 2px; }
    .outcome-icon { font-size: 18px; width: 18px; height: 18px; margin: 1px 2px 0 6px; }
    .outcome-icon[data-outcome="MOVED"] { color: #16a34a; }
    .outcome-icon[data-outcome="FAILED"] { color: #dc2626; }
    .outcome-icon[data-outcome="SKIPPED"] { color: var(--text-secondary, #64748b); }
    .item-text { display: flex; flex-direction: column; min-width: 0; }
    .item-name { overflow-wrap: anywhere; }
    .item-from, .item-issue, .item-outcome {
      font-size: 11px; color: var(--text-secondary, #64748b);
    }
    .item-issue { display: inline-flex; align-items: center; gap: 4px; color: #b45309; }
    .item-outcome[data-outcome="FAILED"] { color: #dc2626; }
    .item-outcome[data-outcome="MOVED"] { color: #16a34a; }
    .plan-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 10px 14px; border-top: 1px solid var(--border-color, #e2e8f0);
    }
    .plan-result {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; border-top: 1px solid var(--border-color, #e2e8f0);
      color: var(--text-secondary, #64748b);
    }
    .plan-result[data-status="APPLIED"] mat-icon { color: #16a34a; }
    .plan-result[data-status="PARTIALLY_APPLIED"] mat-icon, .plan-result[data-status="FAILED"] mat-icon { color: #dc2626; }
    :host-context([dir="rtl"]) .plan-actions { justify-content: flex-start; }
  `]
})
export class AiReorganizationCardComponent implements OnInit, OnDestroy {
  @Input({ required: true }) planId!: string;

  private chatService = inject(AiChatService);

  plan: ReorganizationPlan | null = null;
  groups: TargetGroup[] = [];
  selected = new Set<string>();
  loading = false;
  applying = false;
  error = false;
  actionError: string | null = null;

  private refreshSubscription?: Subscription;

  ngOnInit(): void {
    this.load(true);
    // The assistant may apply the plan itself when the user confirms in the conversation;
    // any turn that changed folders is a reason to refresh a pending card.
    this.refreshSubscription = this.chatService.folderContentChanged$.subscribe(() => {
      if (!this.applying && this.plan?.status === 'PROPOSED') {
        this.load(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  get movedCount(): number {
    return this.plan?.results?.filter(r => r.outcome === 'MOVED').length ?? 0;
  }

  get failedCount(): number {
    return this.plan?.results?.filter(r => r.outcome === 'FAILED').length ?? 0;
  }

  isSelected(item: ReorganizationPlanItem): boolean {
    return !!item.documentId && this.selected.has(item.documentId);
  }

  toggle(item: ReorganizationPlanItem, checked: boolean): void {
    if (!item.documentId) return;
    if (checked) {
      this.selected.add(item.documentId);
    } else {
      this.selected.delete(item.documentId);
    }
  }

  selectAll(): void {
    this.selected = new Set(
      (this.plan?.items ?? []).filter(i => i.applicable && i.documentId).map(i => i.documentId as string)
    );
  }

  selectNone(): void {
    this.selected = new Set();
  }

  outcomeOf(item: ReorganizationPlanItem): ReorganizationItemResult | undefined {
    if (!this.plan?.results || !item.documentId) return undefined;
    return this.plan.results.find(r => r.documentId === item.documentId);
  }

  outcomeIcon(item: ReorganizationPlanItem): string {
    const outcome = this.outcomeOf(item)?.outcome;
    if (outcome === 'MOVED') return 'check_circle';
    if (outcome === 'FAILED') return 'error';
    return 'remove_circle_outline';
  }

  /** Path relative to the plan's root folder — the card already names the root. */
  relative(path: string): string {
    const root = this.plan?.rootFolderPath ?? '/';
    if (root === '/') return path.startsWith('/') ? path.substring(1) || '/' : path;
    if (path === root) return '.';
    return path.startsWith(root + '/') ? path.substring(root.length + 1) : path;
  }

  apply(): void {
    if (!this.plan || this.selected.size === 0 || this.applying) return;
    this.applying = true;
    this.actionError = null;
    this.chatService.applyReorganizationPlan(this.plan.id, [...this.selected]).subscribe({
      next: result => {
        this.applying = false;
        this.setPlan(result.plan);
      },
      error: err => {
        this.applying = false;
        this.actionError = err?.error?.message || err?.message || 'Error';
        this.load(false);
      }
    });
  }

  discard(): void {
    if (!this.plan || this.applying) return;
    this.applying = true;
    this.actionError = null;
    this.chatService.discardReorganizationPlan(this.plan.id).subscribe({
      next: plan => {
        this.applying = false;
        this.setPlan(plan);
      },
      error: err => {
        this.applying = false;
        this.actionError = err?.error?.message || err?.message || 'Error';
        this.load(false);
      }
    });
  }

  private load(initial: boolean): void {
    this.loading = true;
    this.chatService.getReorganizationPlan(this.planId).subscribe({
      next: plan => {
        this.loading = false;
        this.error = false;
        const firstLoad = !this.plan;
        this.setPlan(plan);
        if (firstLoad || initial) {
          this.selectAll();
        }
      },
      error: () => {
        this.loading = false;
        this.error = true;
      }
    });
  }

  private setPlan(plan: ReorganizationPlan): void {
    this.plan = plan;
    const byTarget = new Map<string, TargetGroup>();
    for (const item of plan.items) {
      const key = item.targetPath ?? '';
      let group = byTarget.get(key);
      if (!group) {
        group = { targetPath: item.targetPath ?? '?', targetExists: item.targetExists, items: [] };
        byTarget.set(key, group);
      }
      group.items.push(item);
    }
    this.groups = [...byTarget.values()].sort((a, b) => a.targetPath.localeCompare(b.targetPath));
    if (plan.status !== 'PROPOSED') {
      this.selected = new Set();
    } else {
      // Drop selections that are no longer applicable after a refresh
      const applicable = new Set(plan.items.filter(i => i.applicable && i.documentId).map(i => i.documentId as string));
      this.selected = new Set([...this.selected].filter(id => applicable.has(id)));
    }
  }
}
