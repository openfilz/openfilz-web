import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DocumentLanguageInfo } from '../../services/onlyoffice.service';

export interface DocumentLanguageDialogData {
  fileName?: string;
  info: DocumentLanguageInfo;
}

/**
 * `set`: write `language` into the document. `keep`: leave it (the dialog has shown how to change
 * it in OnlyOffice) — remembered per document. Dismissed (Escape, backdrop, X on the first step):
 * `undefined`, the question comes back next time.
 */
export type DocumentLanguageDialogResult = { action: 'set'; language: string } | { action: 'keep' };

/** The languages the dialog offers, besides the detected and declared ones. */
const LANGUAGE_TAGS = ['fr-FR', 'en-US', 'en-GB', 'de-DE', 'es-ES', 'it-IT', 'nl-NL', 'pt-PT', 'pt-BR', 'ar-SA'];

/**
 * Asked when a Word document opened in OnlyOffice declares no language, or another one than its
 * text: OnlyOffice then spell-checks it in the wrong language and underlines everything. Offers to
 * write the detected language into the document; declining shows how to do it in OnlyOffice later.
 */
@Component({
  selector: 'app-document-language-dialog',
  standalone: true,
  templateUrl: './document-language-dialog.component.html',
  styleUrls: ['./document-language-dialog.component.css'],
  imports: [MatDialogModule, MatButtonModule, MatIconModule, FormsModule, TranslatePipe],
})
export class DocumentLanguageDialogComponent {
  readonly dialogRef = inject(MatDialogRef<DocumentLanguageDialogComponent, DocumentLanguageDialogResult>);
  readonly data = inject<DocumentLanguageDialogData>(MAT_DIALOG_DATA);
  private translate = inject(TranslateService);

  /** `ask` first; `manual` once the user declined (how to change it in OnlyOffice). */
  step: 'ask' | 'manual' = 'ask';
  language = this.data.info.detected ?? 'en-US';

  readonly options: { tag: string; label: string }[];
  private readonly names?: Intl.DisplayNames;

  constructor() {
    try {
      this.names = new Intl.DisplayNames([this.translate.getCurrentLang() || 'en'], { type: 'language' });
    } catch {
      this.names = undefined;
    }
    const tags = [...new Set([this.data.info.detected, this.data.info.declared, ...LANGUAGE_TAGS]
      .filter((t): t is string => !!t))];
    this.options = tags
      .map(tag => ({ tag, label: this.languageName(tag) }))
      .sort((a, b) => a.tag === this.data.info.detected ? -1 : b.tag === this.data.info.detected ? 1 : a.label.localeCompare(b.label));
  }

  /** "fr-FR" → "français (France)" in the UI language; the tag itself when the browser cannot name it. */
  languageName(tag: string | undefined): string {
    if (!tag) {
      return '';
    }
    try {
      return this.names?.of(tag) ?? tag;
    } catch {
      return tag;
    }
  }

  apply(): void {
    this.dialogRef.close({ action: 'set', language: this.language });
  }

  decline(): void {
    this.step = 'manual';
  }

  /** On the first step this is a dismissal; after "leave it as is" it confirms the choice. */
  close(): void {
    this.dialogRef.close(this.step === 'manual' ? { action: 'keep' } : undefined);
  }
}
