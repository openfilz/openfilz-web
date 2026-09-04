import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DocumentInsightsService } from '../../../services/document-insights.service';
import { SmartFilingService } from '../../../services/smart-filing.service';
import { DocumentInsights, FilingOutcome } from '../../../models/smart-filing.models';

/**
 * "Insights" section of the details panel for FILE documents: the read-only facts OpenFilz
 * derived from the file at upload (category, summary, keywords, language, pages, embedded
 * title / author / dates), plus the "Filed by OpenFilz" chip with its "Move back" button when
 * smart filing placed the document. Hidden entirely when there is nothing to show.
 * Dedicated file for the enterprise fork; the panel only hosts the element.
 */
@Component({
  selector: 'app-document-insights',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, TranslatePipe],
  templateUrl: './document-insights.component.html',
  styleUrls: ['./document-insights.component.css']
})
export class DocumentInsightsComponent implements OnChanges {
  @Input() documentId?: string;
  @Input() documentType?: string;
  /** The document was moved back where it was: the listing should refresh. */
  @Output() movedBack = new EventEmitter<void>();

  private insightsService = inject(DocumentInsightsService);
  private smartFiling = inject(SmartFilingService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  insights: DocumentInsights | null = null;
  filing: FilingOutcome | null = null;
  undoing = false;
  /** Guards against an out-of-order answer overwriting a newer document's data. */
  private requestId = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['documentId'] || changes['documentType']) {
      this.load();
    }
  }

  private load(): void {
    const requestId = ++this.requestId;
    this.insights = null;
    this.filing = null;
    this.undoing = false;
    if (!this.documentId || this.documentType !== 'FILE') {
      return;
    }
    const id = this.documentId;
    if (this.insightsService.enabled) {
      this.insightsService.getInsights(id).subscribe(insights => {
        if (requestId === this.requestId) {
          this.insights = insights;
        }
      });
    }
    if (this.smartFiling.enabled) {
      this.smartFiling.getDocumentFiling(id).subscribe(filing => {
        if (requestId === this.requestId) {
          this.filing = filing?.status === 'FILED' ? filing : null;
        }
      });
    }
  }

  /** Nothing derived and not filed: the whole section stays hidden. */
  get hasContent(): boolean {
    return !!this.insights || !!this.filing;
  }

  get keywords(): string[] {
    return (this.insights?.keywords ?? []).filter(k => !!k && k.trim().length > 0);
  }

  get hasFacts(): boolean {
    const i = this.insights;
    return !!i && !!(i.language || i.pageCount || i.fileTitle || i.fileAuthor || i.fileCreatedAt || i.fileModifiedAt);
  }

  /** Translated language name when the browser knows it, the raw code otherwise. */
  languageLabel(code: string): string {
    try {
      const names = new Intl.DisplayNames([this.translate.currentLang || 'en'], { type: 'language' });
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  }

  moveBack(): void {
    const planId = this.filing?.planId;
    if (!planId || this.undoing) {
      return;
    }
    this.undoing = true;
    this.smartFiling.undoFiling(planId).subscribe({
      next: () => {
        this.undoing = false;
        this.filing = null;
        this.snackBar.open(
          this.translate.instant('smartFiling.toast.movedBack'),
          this.translate.instant('common.close'),
          { duration: 4000 }
        );
        this.movedBack.emit();
      },
      error: () => {
        this.undoing = false;
        this.snackBar.open(
          this.translate.instant('smartFiling.toast.undoFailed'),
          this.translate.instant('common.close'),
          { duration: 4000 }
        );
      }
    });
  }
}
