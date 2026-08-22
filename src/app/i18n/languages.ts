/** A UI language offered by the language switchers (app header + public signing page). */
export interface AppLanguage {
  code: string;
  name: string;
  flag: string;
}

/**
 * The eight locales shipped in `src/i18n/*.json`, in alphabetical order of their own name.
 * Shared so the authenticated header and the public signing page can never drift apart.
 */
export const APP_LANGUAGES: AppLanguage[] = [
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' }
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
