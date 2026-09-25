import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DocumentType, FileItem } from '../../models/document.models';
import { FileActionDescriptor, FileActionId, STANDARD_ITEM_ACTIONS, isFolderItem, isPdfItem, isPdfToolsAction } from '../../models/file-actions';
import { PdfToolActionId } from '../../models/pdf-tools.models';
import { highlightTerms, sanitizeSnippet } from '../../models/search-refine';
import { FileIconService } from '../../services/file-icon.service';
import { TouchDetectionService } from '../../services/touch-detection.service';
import { SignatureAccessService } from '../../services/signature-access.service';
import { WorkflowAccessService } from '../../services/workflow-access.service';
import { PdfToolsAccessService } from '../../services/pdf-tools-access.service';
import { UnzipAccessService } from '../../services/unzip-access.service';
import { AiOrganizeAccessService } from '../../services/ai-organize-access.service';
import { InsightFacetsService } from '../../services/insight-facets.service';
import { AuthImageDirective } from '../../directives/auth-image.directive';
import { appLocale } from '../../i18n/app-locale';

/**
 * Search results as rich rows: icon or thumbnail, the name with the query terms highlighted,
 * type · size · modified · owner, the matching content extract, and the item actions.
 *
 * Emits the same events as the file list so the results page drives both the same way.
 * Mouse: click selects (and shows details), double-click opens. Touch: a tap opens, the
 * checkbox selects. Keyboard: ↑ / ↓ move, Enter opens, Space selects.
 * Dedicated file for the enterprise fork — the results page only hosts the element.
 */
@Component({
  selector: 'app-search-result-list',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatCheckboxModule, MatTooltipModule, MatMenuModule, MatDividerModule, TranslatePipe, AuthImageDirective],
  templateUrl: './search-result-list.component.html',
  styleUrls: ['./search-result-list.component.css']
})
export class SearchResultListComponent {
  @Input() items: FileItem[] = [];
  /** The text query: its terms are highlighted in the names. */
  @Input() query = '';
  @Input() selectionCount = 0;

  @Output() itemClick = new EventEmitter<FileItem>();
  @Output() itemDoubleClick = new EventEmitter<FileItem>();
  @Output() selectionChange = new EventEmitter<{ item: FileItem; selected: boolean }>();
  @Output() selectAll = new EventEmitter<boolean>();
  @Output() rename = new EventEmitter<FileItem>();
  @Output() download = new EventEmitter<FileItem>();
  @Output() move = new EventEmitter<FileItem>();
  @Output() copy = new EventEmitter<FileItem>();
  @Output() delete = new EventEmitter<FileItem>();
  @Output() toggleFavorite = new EventEmitter<FileItem>();
  @Output() viewProperties = new EventEmitter<FileItem>();
  @Output() requestSignature = new EventEmitter<FileItem>();
  @Output() startWorkflow = new EventEmitter<FileItem>();
  @Output() unzip = new EventEmitter<FileItem>();
  @Output() pdfTool = new EventEmitter<{ item: FileItem; action: PdfToolActionId }>();
  @Output() organizeWithAi = new EventEmitter<FileItem>();
  /** "Show in folder": open the item's parent folder with the item focused. */
  @Output() showInFolder = new EventEmitter<FileItem>();

  private fileIconService = inject(FileIconService);
  private touchDetection = inject(TouchDetectionService);
  private translate = inject(TranslateService);
  private signatureAccess = inject(SignatureAccessService);
  private workflowAccess = inject(WorkflowAccessService);
  private pdfToolsAccess = inject(PdfToolsAccessService);
  private unzipAccess = inject(UnzipAccessService);
  private aiOrganizeAccess = inject(AiOrganizeAccessService);
  private insightFacets = inject(InsightFacetsService);
  private host = inject(ElementRef<HTMLElement>);

  focusedIndex = 0;

  get isTouch(): boolean {
    return this.touchDetection.isTouchDevice();
  }

  // ----- selection -----

  get allSelected(): boolean {
    return this.items.length > 0 && this.items.every(i => i.selected);
  }

  get someSelected(): boolean {
    return this.items.some(i => i.selected);
  }

  /** Once something is selected, the checkboxes stay visible on every row (they hide on hover otherwise). */
  get selectionMode(): boolean {
    return this.selectionCount > 0;
  }

  onRowClick(item: FileItem, index: number): void {
    this.focusedIndex = index;
    if (this.touchDetection.isTouchDevice()) {
      // Phones / tablets: a tap opens — unless the user is picking items, then it toggles
      if (this.selectionMode) {
        this.selectionChange.emit({ item, selected: !item.selected });
      } else {
        this.itemDoubleClick.emit(item);
      }
      return;
    }
    this.itemClick.emit(item);
  }

  onRowDoubleClick(item: FileItem): void {
    if (this.touchDetection.isTouchDevice()) {
      return; // the tap already opened it
    }
    this.itemDoubleClick.emit(item);
  }

  onCheckbox(item: FileItem, selected: boolean): void {
    this.selectionChange.emit({ item, selected });
  }

  // ----- display helpers -----

  highlightedName(item: FileItem): string {
    return highlightTerms(item.name, this.query);
  }

  snippet(item: FileItem): string {
    return sanitizeSnippet(item.contentSnippet);
  }

  icon(item: FileItem): string {
    return this.fileIconService.getFileIcon(item.name, item.type);
  }

  color(item: FileItem): string {
    return this.fileIconService.getFileColor(item.name, item.type);
  }

  typeLabel(item: FileItem): string {
    if (item.type === DocumentType.FOLDER) {
      return this.translate.instant('common.folder');
    }
    const ext = this.fileIconService.getFileExtension(item.name);
    if (ext) {
      return ext.toUpperCase();
    }
    return item.contentType ? this.fileIconService.getContentTypeLabel(item.contentType) : this.translate.instant('common.file');
  }

  size(item: FileItem): string | null {
    return item.type === DocumentType.FILE && item.size ? this.fileIconService.getFileSize(item.size) : null;
  }

  categoryLabel(item: FileItem): string | null {
    return item.category ? this.insightFacets.categoryLabel(item.category) : null;
  }

  /** "Modified 3 days ago" / "Modified yesterday", or "Modified on 12 Sep 2025" past a week. */
  modifiedLabel(item: FileItem): string | null {
    const value = item.updatedAt || item.createdAt;
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return null;
    }
    const lang = appLocale(this.translate.getCurrentLang());
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    let when: string;
    if (abs < 60) {
      when = rtf.format(0, 'second');
    } else if (abs < 3600) {
      when = rtf.format(Math.round(seconds / 60), 'minute');
    } else if (abs < 86400) {
      when = rtf.format(Math.round(seconds / 3600), 'hour');
    } else if (abs < 86400 * 7) {
      when = rtf.format(Math.round(seconds / 86400), 'day');
    } else {
      const formatted = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
      return this.translate.instant('searchResults.modifiedOn', { date: formatted });
    }
    return this.translate.instant('searchResults.modifiedAgo', { when });
  }

  fullDate(value: string | undefined): string {
    if (!value) {
      return '';
    }
    const lang = appLocale(this.translate.getCurrentLang());
    return new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));
  }

  onThumbnailError(item: FileItem): void {
    item.thumbnailUrl = undefined;
  }

  // ----- per-item menu (kebab + right click) -----

  @ViewChild('contextMenuTrigger') contextMenuTrigger?: MatMenuTrigger;
  contextMenuPosition = { x: 0, y: 0 };
  menuItem?: FileItem;

  /** The kebab and context menu act on one item: hidden while several are selected (use the toolbar). */
  get showItemMenu(): boolean {
    return this.selectionCount <= 1;
  }

  get visibleItemActions(): FileActionDescriptor[] {
    const item = this.menuItem;
    const signAllowed = this.signatureAccess.canRequestSignature && !!item && isPdfItem(item);
    const pdfToolsAllowed = this.pdfToolsAccess.enabled && !!item && isPdfItem(item);
    const unzipAllowed = this.unzipAccess.canUnzip(item);
    const organizeAllowed = this.aiOrganizeAccess.enabled && !!item && isFolderItem(item);
    const workflowAllowed = this.workflowAccess.canStart && !!item && !isFolderItem(item);
    return STANDARD_ITEM_ACTIONS.filter(a => (a.id !== 'requestSignature' || signAllowed)
      && (a.id !== 'startWorkflow' || workflowAllowed)
      && (!isPdfToolsAction(a.id) || pdfToolsAllowed)
      && (a.id !== 'unzip' || unzipAllowed)
      && (a.id !== 'organizeWithAi' || organizeAllowed));
  }

  onKebabClick(event: Event, item: FileItem): void {
    event.stopPropagation();
    this.menuItem = item;
  }

  onContextMenu(event: MouseEvent, item: FileItem): void {
    if (this.touchDetection.isTouchDevice()) {
      // Long press on a touch screen: start picking items (the kebab still opens the menu)
      event.preventDefault();
      this.selectionChange.emit({ item, selected: !item.selected });
      return;
    }
    if (!this.showItemMenu) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.menuItem = item;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    this.contextMenuTrigger?.openMenu();
  }

  onShowInFolder(event: Event, item: FileItem): void {
    event.stopPropagation();
    this.showInFolder.emit(item);
  }

  onFavorite(event: Event, item: FileItem): void {
    event.stopPropagation();
    this.toggleFavorite.emit(item);
  }

  onMenuAction(actionId: FileActionId): void {
    const item = this.menuItem;
    if (!item) {
      return;
    }
    switch (actionId) {
      case 'open': this.itemDoubleClick.emit(item); break;
      case 'download': this.download.emit(item); break;
      case 'rename': this.rename.emit(item); break;
      case 'move': this.move.emit(item); break;
      case 'copy': this.copy.emit(item); break;
      case 'details': this.viewProperties.emit(item); break;
      case 'requestSignature': this.requestSignature.emit(item); break;
      case 'startWorkflow': this.startWorkflow.emit(item); break;
      case 'organizePdf':
      case 'splitPdf':
      case 'rotatePdf':
      case 'mergePdf':
        this.pdfTool.emit({ item, action: actionId });
        break;
      case 'organizeWithAi': this.organizeWithAi.emit(item); break;
      case 'unzip': this.unzip.emit(item); break;
      case 'delete': this.delete.emit(item); break;
    }
  }

  // ----- keyboard -----

  onRowKeydown(event: KeyboardEvent, item: FileItem, index: number): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusRow(Math.min(index + 1, this.items.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusRow(Math.max(index - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        this.focusRow(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusRow(this.items.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        this.itemDoubleClick.emit(item);
        break;
      case ' ':
        event.preventDefault();
        this.selectionChange.emit({ item, selected: !item.selected });
        break;
    }
  }

  private focusRow(index: number): void {
    this.focusedIndex = index;
    const rows = (this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.result-row');
    rows[index]?.focus();
  }
}
