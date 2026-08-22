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

  /**
   * Models offered in the picker. Filled from the provider via the backend; falls back to the
   * built-in list until a key is entered, or when the provider cannot be reached — the field is
   * free text either way, so the form is never blocked on this.
   */
  models: string[] = [];
  loadingModels = false;
  /** Set when the list shown is the built-in one, with the provider's reason where there is one. */
  modelsFallbackReason: string | null = null;

  /** Guards against an out-of-order response overwriting a newer one (provider/key changed twice). */
  private modelsRequestId = 0;

  readonly providers: AiProviderChoice[] = ['DEFAULT', 'OPENAI', 'ANTHROPIC', 'GOOGLE', 'OPENAI_COMPATIBLE'];

  ngOnInit(): void {
    this.aiSettingsService.loadSettings().subscribe({
      next: settings => {
        this.current = settings;
        this.provider = settings.provider ?? 'DEFAULT';
        this.model = settings.model ?? '';
        this.baseUrl = settings.baseUrl ?? '';
        this.loaded = true;
        if (!this.isDefault) {
          this.refreshModels();   // a stored key can list models with nothing typed
        }
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

  /** The built-in list for the selected provider — what the picker shows before the live one arrives. */
  get builtInModels(): string[] {
    return this.isDefault ? [] : AI_MODEL_SUGGESTIONS[this.provider as AiProvider] ?? [];
  }

  get modelSuggestions(): string[] {
    if (this.isDefault) {
      return [];
    }
    return this.models.length > 0 ? this.models : this.builtInModels;
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
    this.models = [];
    this.modelsFallbackReason = null;
    if (!this.isDefault) {
      const keepModel = this.current?.provider === this.provider && this.current?.model;
      this.model = keepModel ? this.current!.model! : (this.builtInModels[0] ?? '');
      this.baseUrl = this.current?.provider === this.provider ? (this.current?.baseUrl ?? '') : '';
      this.refreshModels();
    }
  }

  /**
   * Called when the key or base URL is edited: a different key can reach a different set of
   * models, so the list is re-fetched once the user stops typing rather than on every keystroke.
   */
  onCredentialsChange(): void {
    if (!this.isDefault) {
      this.refreshModels();
    }
  }

  /**
   * Ask the provider (through the backend) what it currently offers.
   *
   * The model already typed is kept if the provider still lists it; only a model the provider does
   * not know is replaced, and then by the first entry — the backend orders the list so that entry
   * is a sensible default. Failures are silent by design: the backend answers with its built-in
   * list rather than an error, and the field takes free text, so there is nothing to interrupt the
   * user with.
   */
  private refreshModels(): void {
    const requestId = ++this.modelsRequestId;
    this.loadingModels = true;
    this.aiSettingsService.listModels({
      provider: this.provider as AiProvider,
      baseUrl: this.needsBaseUrl ? this.baseUrl.trim() : null,
      apiKey: this.apiKey.trim() || null
    }).subscribe({
      next: response => {
        if (requestId !== this.modelsRequestId) {
          return;   // a newer request is in flight — this answer is already stale
        }
        this.loadingModels = false;
        this.models = response.models ?? [];
        this.modelsFallbackReason = response.source === 'FALLBACK' ? (response.message ?? '') : null;
        if (this.models.length > 0 && !this.models.includes(this.model)) {
          this.model = this.models[0];
        }
      },
      error: () => {
        if (requestId !== this.modelsRequestId) {
          return;
        }
        this.loadingModels = false;
        this.models = [];
      }
    });
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
