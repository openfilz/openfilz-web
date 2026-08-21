import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AiSettingsService } from '../../services/ai-settings.service';
import {
  AI_KEY_HELP_URLS,
  AI_MODEL_SUGGESTIONS,
  AiProvider,
  AiProviderChoice,
  AiUserSettings
} from '../../models/ai-settings.models';

/**
 * "AI Assistant" section of the personal settings page (BYOK): pick the chat LLM
 * (server default / OpenAI / Anthropic / Gemini / any OpenAI-compatible endpoint),
 * paste an API key (write-only), test the connection, save or reset.
 * Dedicated component file to keep the enterprise fork merge simple.
 */
@Component({
  selector: 'app-ai-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, TranslatePipe],
  templateUrl: './ai-settings.component.html',
  styleUrls: ['./ai-settings.component.css']
})
export class AiSettingsComponent implements OnInit {

  private aiSettingsService = inject(AiSettingsService);
  private translate = inject(TranslateService);

  loaded = false;
  saving = false;
  testing = false;

  /** Current form state. */
  provider: AiProviderChoice = 'DEFAULT';
  model = '';
  baseUrl = '';
  apiKey = '';

  /** Last loaded server state. */
  current: AiUserSettings | null = null;

  banner: { kind: 'success' | 'error' | 'info'; text: string } | null = null;

  readonly providers: AiProviderChoice[] = ['DEFAULT', 'OPENAI', 'ANTHROPIC', 'GOOGLE', 'OPENAI_COMPATIBLE'];

  ngOnInit(): void {
    this.aiSettingsService.loadSettings().subscribe({
      next: settings => {
        this.current = settings;
        this.provider = settings.provider ?? 'DEFAULT';
        this.model = settings.model ?? '';
        this.baseUrl = settings.baseUrl ?? '';
        this.loaded = true;
      },
      error: () => {
        this.loaded = true;
        this.banner = { kind: 'error', text: this.translate.instant('settings.ai.loadError') };
      }
    });
  }

  get isDefault(): boolean {
    return this.provider === 'DEFAULT';
  }

  get needsBaseUrl(): boolean {
    return this.provider === 'OPENAI_COMPATIBLE';
  }

  get modelSuggestions(): string[] {
    return this.isDefault ? [] : AI_MODEL_SUGGESTIONS[this.provider as AiProvider] ?? [];
  }

  get keyHelpUrl(): string {
    return this.isDefault ? '' : AI_KEY_HELP_URLS[this.provider as AiProvider] ?? '';
  }

  get hasStoredKey(): boolean {
    return (this.current?.hasApiKey ?? false) && this.current?.provider === this.provider;
  }

  get apiKeyPlaceholder(): string {
    return this.hasStoredKey && this.current?.keySuffix
      ? '••••••••' + this.current.keySuffix
      : this.translate.instant('settings.ai.apiKeyPlaceholder');
  }

  get defaultModelLabel(): string {
    if (!this.current) {
      return '';
    }
    const model = this.current.defaultModel ? ` · ${this.current.defaultModel}` : '';
    return `${this.current.defaultProvider}${model}`;
  }

  get canSubmit(): boolean {
    if (this.isDefault) {
      return true;
    }
    if (!this.model.trim()) {
      return false;
    }
    if (this.needsBaseUrl && !this.baseUrl.trim()) {
      return false;
    }
    return this.hasStoredKey || this.apiKey.trim().length > 0;
  }

  onProviderChange(): void {
    this.banner = null;
    if (!this.isDefault) {
      const suggestions = this.modelSuggestions;
      const keepModel = this.current?.provider === this.provider && this.current?.model;
      this.model = keepModel ? this.current!.model! : (suggestions[0] ?? '');
      this.baseUrl = this.current?.provider === this.provider ? (this.current?.baseUrl ?? '') : '';
    }
  }

  onTest(): void {
    if (this.isDefault || !this.canSubmit || this.testing) {
      return;
    }
    this.testing = true;
    this.banner = { kind: 'info', text: this.translate.instant('settings.ai.testing') };
    this.aiSettingsService.testConnection(this.buildRequest()).subscribe({
      next: result => {
        this.testing = false;
        this.banner = result.ok
          ? { kind: 'success', text: this.translate.instant('settings.ai.testOk', { latency: result.latencyMs }) }
          : { kind: 'error', text: this.translate.instant('settings.ai.testFailed', { message: result.message }) };
      },
      error: err => {
        this.testing = false;
        this.banner = { kind: 'error', text: this.translate.instant('settings.ai.testFailed', { message: err?.error?.message ?? err.message ?? '' }) };
      }
    });
  }

  onSave(): void {
    if (!this.canSubmit || this.saving) {
      return;
    }
    this.saving = true;
    this.banner = null;
    const done = () => {
      this.saving = false;
      this.apiKey = '';
      this.banner = { kind: 'success', text: this.translate.instant('settings.ai.saved') };
    };
    const fail = (err: any) => {
      this.saving = false;
      this.banner = { kind: 'error', text: err?.error?.message ?? this.translate.instant('settings.ai.saveError') };
    };
    if (this.isDefault) {
      this.aiSettingsService.resetSettings().subscribe({
        next: () => {
          this.current = this.aiSettingsService.settings;
          done();
        },
        error: fail
      });
    } else {
      this.aiSettingsService.saveSettings(this.buildRequest()).subscribe({
        next: settings => {
          this.current = settings;
          done();
        },
        error: fail
      });
    }
  }

  private buildRequest() {
    return {
      provider: this.provider as AiProvider,
      model: this.model.trim(),
      baseUrl: this.needsBaseUrl ? this.baseUrl.trim() : null,
      apiKey: this.apiKey.trim() || null
    };
  }
}
