/** A UI language offered by the language switchers (app header + public signing page). */
export interface AppLanguage {
  code: string;
  /** Endonym — shown as-is in the picker. The flag is drawn by `LanguageFlagComponent`. */
  name: string;
}

/**
 * The eight locales shipped in `src/i18n/*.json`, in alphabetical order of their own name.
 * Shared so the authenticated header and the public signing page can never drift apart.
 */
export const APP_LANGUAGES: AppLanguage[] = [
  { code: 'ar', name: 'العربية' },
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pt', name: 'Português' }
];

export const DEFAULT_LANGUAGE = 'en';

export function findLanguage(code?: string | null): AppLanguage | undefined {
  return code ? APP_LANGUAGES.find(l => l.code === code) : undefined;
}

/** Arabic is the only RTL locale we ship. */
export function isRtlLanguage(code: string): boolean {
  return code === 'ar';
}

/** Apply a language to the document element (direction + lang attribute). */
export function applyDocumentLanguage(code: string): void {
  document.documentElement.setAttribute('dir', isRtlLanguage(code) ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', code);
}
