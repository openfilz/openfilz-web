import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { DocumentType, SearchFilters } from '../../models/document.models';
import { ANY_FILE_TYPE, FILE_TYPE_CATEGORIES, FileTypeCategory, getFileTypeCategory } from '../../models/file-type-filters';
import {
  DATE_MODIFIED_OPTIONS, RELEVANCE_SORT, SEARCH_SORT_OPTIONS, SearchSortOption, SortOrder,
  countActiveFilters, findSortOption
} from '../../models/search-refine';
import { InsightFacetsService } from '../../services/insight-facets.service';

/**
 * The bar above the search results: quick filter chips (type, file type, date, owner, document
 * kind), "All filters", the sort menu and the grid / list toggle.
 *
 * It only edits a copy of the filters and emits it: the page owns the state (SearchService).
 * Dedicated file for the enterprise fork — the results page only hosts the element.
 */
@Component({
  selector: 'app-search-refine-bar',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatButtonModule, MatMenuModule, MatDividerModule, MatTooltipModule, TranslatePipe],
  templateUrl: './search-refine-bar.component.html',
  styleUrls: ['./search-refine-bar.component.css']
})
export class SearchRefineBarComponent {
  @Input() filters: SearchFilters = {};
  @Input() sortBy: string = RELEVANCE_SORT;
  @Input() sortOrder: SortOrder = 'DESC';
  /** Relevance only means something when a text query ranks the hits. */
  @Input() relevanceAvailable = true;
  @Input() viewMode: 'grid' | 'list' = 'list';

  @Output() filtersChange = new EventEmitter<SearchFilters>();
  @Output() sortChange = new EventEmitter<{ sortBy: string; sortOrder: SortOrder }>();
  @Output() viewModeChange = new EventEmitter<'grid' | 'list'>();
  /** "All filters": the host opens the advanced filter panel. */
  @Output() openAdvanced = new EventEmitter<void>();
  @Output() clearAll = new EventEmitter<void>();

  private insightFacets = inject(InsightFacetsService);

  readonly DocumentType = DocumentType;
  readonly fileTypeCategories = FILE_TYPE_CATEGORIES;
  readonly dateOptions = DATE_MODIFIED_OPTIONS;
  readonly ANY_FILE_TYPE = ANY_FILE_TYPE;

  /** Owner typed in the chip's menu, applied on Enter / "Apply". */
  ownerDraft = '';

  get sortOptions(): SearchSortOption[] {
    return SEARCH_SORT_OPTIONS.filter(o => this.relevanceAvailable || o.value !== RELEVANCE_SORT);
  }

  get activeSort(): SearchSortOption {
    return findSortOption(this.sortBy) ?? SEARCH_SORT_OPTIONS[1];
  }

  get isRelevance(): boolean {
    return this.sortBy === RELEVANCE_SORT;
  }

  get activeCount(): number {
    return countActiveFilters(this.filters);
  }

  get activeCategory(): FileTypeCategory | undefined {
    return getFileTypeCategory(this.filters.fileType);
  }

  get hasFileType(): boolean {
    return !!this.activeCategory;
  }

  get hasDate(): boolean {
    return !!this.filters.dateModified && this.filters.dateModified !== 'any';
  }

  get dateLabelKey(): string {
    return DATE_MODIFIED_OPTIONS.find(o => o.value === this.filters.dateModified)?.labelKey ?? DATE_MODIFIED_OPTIONS[0].labelKey;
  }

  get hasOwner(): boolean {
    return !!this.filters.owner?.trim();
  }

  get metadataCount(): number {
    return (this.filters.metadata ?? []).filter(m => m.key?.trim()).length;
  }

  /** Document-insights facets ("Document kind"), only when the insights are on. */
  get showKindFilter(): boolean {
    return this.insightFacets.enabled;
  }

  get kindCategories(): string[] {
    return this.insightFacets.categories;
  }

  categoryLabel(key: string): string {
    return this.insightFacets.categoryLabel(key);
  }

  languageLabel(code: string): string {
    return this.insightFacets.languageLabel(code);
  }

  // ----- chip actions -----

  setType(type: DocumentType | undefined): void {
    // Folders have no file type: drop it rather than showing an empty result
    const fileType = type === DocumentType.FOLDER ? ANY_FILE_TYPE : this.filters.fileType;
    this.emit({ type, fileType });
  }

  setFileType(fileType: string): void {
    // A file type implies files
    const type = fileType !== ANY_FILE_TYPE && this.filters.type === DocumentType.FOLDER ? undefined : this.filters.type;
    this.emit({ fileType, type });
  }

  setDate(dateModified: string): void {
    this.emit({ dateModified });
  }

  prepareOwnerDraft(): void {
    this.ownerDraft = this.filters.owner ?? '';
  }

  applyOwner(): void {
    this.emit({ owner: this.ownerDraft.trim() });
  }

  setCategory(category: string | undefined): void {
    // A facet searches the whole library (the insights index knows no folder)
    this.emit(category ? { category, scope: 'ALL' } : { category: undefined });
  }

  clearLanguage(): void {
    this.emit({ language: undefined });
  }

  clearMetadata(): void {
    this.emit({ metadata: [] });
  }

  private emit(patch: Partial<SearchFilters>): void {
    this.filtersChange.emit({ ...this.filters, ...patch });
  }

  // ----- sort / view -----

  selectSort(option: SearchSortOption): void {
    if (option.value === this.sortBy) {
      return;
    }
    this.sortChange.emit({ sortBy: option.value, sortOrder: option.defaultOrder });
  }

  toggleSortOrder(): void {
    if (this.isRelevance) {
      return;
    }
    this.sortChange.emit({ sortBy: this.sortBy, sortOrder: this.sortOrder === 'ASC' ? 'DESC' : 'ASC' });
  }

  setView(mode: 'grid' | 'list'): void {
    if (mode !== this.viewMode) {
      this.viewModeChange.emit(mode);
    }
  }

  /** Keys typed in the owner field must not reach the menu (it would move focus / close). */
  stopMenuKeys(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      event.stopPropagation();
    }
  }
}
