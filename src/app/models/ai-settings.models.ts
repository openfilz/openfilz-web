/**
 * Per-user AI (chat LLM) settings — BYOK (bring your own key).
 * Mirrors the /api/v1/settings/ai endpoints. The API key is write-only:
 * responses only carry hasApiKey + the last characters for display.
 */

export type AiProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'OPENAI_COMPATIBLE';

/** Value used in the UI for "use the server default model" (no row stored server-side). */
export type AiProviderChoice = AiProvider | 'DEFAULT';

export interface AiUserSettings {
  enabled: boolean;
  provider: AiProvider | null;
  model: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  keySuffix: string | null;
  defaultProvider: string;
  defaultModel: string;
}

export interface SaveAiSettingsRequest {
  provider: AiProvider;
  model: string;
  baseUrl?: string | null;
  apiKey?: string | null;
}

export interface AiConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

/**
 * Model suggestions shown per provider (datalist — free text stays possible).
 *
 * The FIRST entry is not just a suggestion: picking a provider pre-fills the model field with
 * it (see AiSettingsComponent#onProviderChange), so it has to be a model that currently works.
 * Providers retire ids without warning — `gemini-2.5-flash` sat here until it started answering
 * every chat with `404 ... no longer available to new users` — so lead each list with the id the
 * server itself defaults to, and keep the "-latest" aliases available for anyone who would
 * rather track the current model than pin one.
 */
export const AI_MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  OPENAI: ['gpt-4o', 'gpt-4o-mini'],
  ANTHROPIC: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  GOOGLE: [
    'gemini-3.6-flash',       // matches the server default (GOOGLE_CHAT_MODEL)
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',    // aliases — always the current model, so they never go stale
    'gemini-flash-lite-latest',
    'gemini-pro-latest'
  ],
  OPENAI_COMPATIBLE: []
};

/** Where to create an API key, per provider (shown as a help link in the settings UI). */
export const AI_KEY_HELP_URLS: Record<AiProvider, string> = {
  OPENAI: 'https://platform.openai.com/api-keys',
  ANTHROPIC: 'https://platform.claude.com',
  GOOGLE: 'https://aistudio.google.com',
  OPENAI_COMPATIBLE: ''
};
