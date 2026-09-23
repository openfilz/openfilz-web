import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import localeDe from '@angular/common/locales/de';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';
import localeIt from '@angular/common/locales/it';
import localeNl from '@angular/common/locales/nl';
import localePtPT from '@angular/common/locales/pt-PT';
import { DEFAULT_LANGUAGE, findLanguage } from './languages';

/**
 * Dates follow the UI language, not the browser: Angular only ships `en-US` formatting data, so
 * without this every `| date` read "Sep 15, 2026" whatever the language picked in the header.
 * The texts in `pt.json` are European Portuguese ("ficheiro"), hence pt-PT formats.
 */
const LOCALE_IDS: Record<string, string> = { en: 'en-US', pt: 'pt-PT' };

let registered = false;

/** Registers the formatting data of every UI language — once, at bootstrap. */
export function registerAppLocales(): void {
  if (registered) return;
  registered = true;
  [localeAr, localeDe, localeEs, localeFr, localeIt, localeNl].forEach(data => registerLocaleData(data));
  registerLocaleData(localePtPT, 'pt-PT');
}

/** The locale id (for Angular's `formatDate` and for `Intl` / `toLocale*String`) of a UI language code. */
export function appLocale(lang?: string | null): string {
  const code = findLanguage(lang)?.code ?? DEFAULT_LANGUAGE;
  return LOCALE_IDS[code] ?? code;
}
