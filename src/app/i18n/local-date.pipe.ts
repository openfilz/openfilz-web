import { Pipe, PipeTransform, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { appLocale } from './app-locale';

type DateInput = string | number | Date | null | undefined;

/**
 * `| date` in the UI language: `{{ task.dueAt | localDate:'mediumDate' }}` reads "18 sept. 2026" in
 * French, "18.09.2026" in German… (locale data: `registerAppLocales()` in main.ts). Same formats
 * as Angular's DatePipe ('short', 'medium', 'mediumDate', or a pattern). Impure so a language
 * switch in the header re-renders it, and memoised so change detection only re-formats when the
 * value, format or language changed.
 */
@Pipe({ name: 'localDate', standalone: true, pure: false })
export class LocalDatePipe implements PipeTransform {
  private translate = inject(TranslateService);
  private lastKey: string | null = null;
  private lastResult: string | null = null;

  transform(value: DateInput, format = 'mediumDate', timezone?: string): string | null {
    if (value === null || value === undefined || value === '') return null;
    const locale = appLocale(this.translate.getCurrentLang() || this.translate.getFallbackLang());
    const key = `${value instanceof Date ? value.getTime() : value}|${format}|${timezone ?? ''}|${locale}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lastResult = formatDate(value, format, locale, timezone);
    }
    return this.lastResult;
  }
}
