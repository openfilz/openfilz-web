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

/** Model suggestions shown per provider (datalist — free text stays possible). */
export const AI_MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  OPENAI: ['gpt-4o', 'gpt-4o-mini'],
  ANTHROPIC: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  GOOGLE: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  OPENAI_COMPATIBLE: []
};

/** Where to create an API key, per provider (shown as a help link in the settings UI). */
export const AI_KEY_HELP_URLS: Record<AiProvider, string> = {
  OPENAI: 'https://platform.openai.com/api-keys',
  ANTHROPIC: 'https://platform.claude.com',
  GOOGLE: 'https://aistudio.google.com',
  OPENAI_COMPATIBLE: ''
};
