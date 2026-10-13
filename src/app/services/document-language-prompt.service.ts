import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { OnlyOfficeService } from './onlyoffice.service';

/** Browser storage of the documents whose language the user chose to leave as it is. */
const DECLINED_KEY = 'openfilz.onlyoffice.languageDeclined';
const MAX_DECLINED = 500;

/**
 * Before a Word document opens in OnlyOffice for editing: when it declares no language, or another
 * one than its text is written in, asks once whether to write the detected language into it
 * (otherwise OnlyOffice spell-checks it in the wrong language and underlines the whole text).
 * Declining is remembered per document in this browser and shows how to change it in OnlyOffice.
 *
 * Never blocks the editor: any failure just lets it open.
 */
@Injectable({ providedIn: 'root' })
export class DocumentLanguagePromptService {
  private onlyOffice = inject(OnlyOfficeService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  /** Resolves when the editor may be created. */
  async checkBeforeEditing(documentId: string, fileName?: string): Promise<void> {
    if (fileName && !fileName.toLowerCase().endsWith('.docx')) {
      return;
    }
    if (this.declined().includes(documentId)) {
      return;
    }
    try {
      const info = await firstValueFrom(this.onlyOffice.getDocumentLanguage(documentId));
      if (!info.supported || !info.editable || !info.suggested || !info.detected) {
        return;
      }
      const { DocumentLanguageDialogComponent } = await import('../dialogs/document-language-dialog/document-language-dialog.component');
      const result = await firstValueFrom(this.dialog.open(DocumentLanguageDialogComponent, {
        width: '32rem',
        maxWidth: '94vw',
        autoFocus: 'dialog',
        data: { fileName, info },
      }).afterClosed());
      if (result?.action === 'set') {
        await this.apply(documentId, result.language);
      } else {
        this.remember(documentId);
      }
    } catch (err) {
      console.warn('Document language check skipped:', err);
    }
  }

  private async apply(documentId: string, language: string): Promise<void> {
    try {
      await firstValueFrom(this.onlyOffice.setDocumentLanguage(documentId, language));
      let name = language;
      try {
        name = new Intl.DisplayNames([this.translate.getCurrentLang() || 'en'], { type: 'language' }).of(language) ?? language;
      } catch {
        // keep the tag
      }
      this.snackBar.open(this.translate.instant('documentLanguage.applied', { language: name }), undefined, { duration: 4000 });
    } catch (err) {
      console.error('Failed to set the document language:', err);
      this.snackBar.open(this.translate.instant('documentLanguage.applyFailed'), this.translate.instant('common.close'), { duration: 6000 });
    }
  }

  private declined(): string[] {
    try {
      const raw = localStorage.getItem(DECLINED_KEY);
      const ids = raw ? JSON.parse(raw) : [];
      return Array.isArray(ids) ? ids : [];
    } catch {
      return [];
    }
  }

  private remember(documentId: string): void {
    try {
      const ids = this.declined().filter(id => id !== documentId);
      ids.push(documentId);
      localStorage.setItem(DECLINED_KEY, JSON.stringify(ids.slice(-MAX_DECLINED)));
    } catch {
      // storage unavailable: the question comes back next time
    }
  }
}
