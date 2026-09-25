import { Component, EventEmitter, HostListener, Input, OnInit, Output, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { DocumentType, SearchFilters, SearchScope } from '../../models/document.models';
import { ANY_FILE_TYPE, FILE_TYPE_CATEGORIES } from '../../models/file-type-filters';
import { DATE_MODIFIED_OPTIONS, countActiveFilters } from '../../models/search-refine';
import { InsightFacetsService } from '../../services/insight-facets.service';
import { InsightFacetCount } from '../../models/smart-filing.models';

@Component({
  selector: 'app-search-filters',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatButtonModule, MatTooltipModule, TranslatePipe],
  templateUrl: './search-filters.component.html',
  styleUrls: ['./search-filters.component.css']
})
export class SearchFiltersComponent implements OnInit {
  @Input() initialFilters?: SearchFilters;
  @Output() filtersChanged = new EventEmitter<SearchFilters>();
  @Output() close = new EventEmitter<void>();

  filters: SearchFilters = {
    type: undefined,
    dateModified: 'any',
    owner: '',
    fileType: 'any',
    metadata: [],
    scope: 'ALL',
    category: undefined,
    language: undefined
  };

  metadataFilters: { key: string; value: string }[] = [];

  private snapshotFilters!: string;
  private snapshotMetadata!: string;

  /** Document insights facets ("Document kind" / "Language") — only when the insights are on. */
  private insightFacets = inject(InsightFacetsService);
  /** Languages carried by at least one document, most frequent first (loaded once per session). */
  facetLanguages: InsightFacetCount[] = [];

  ngOnInit() {
    if (this.initialFilters) {
      this.filters = { ...this.filters, ...this.initialFilters };
      if (!this.filters.scope) {
        this.filters.scope = 'ALL';
      }
      if (this.initialFilters.metadata) {
        this.metadataFilters = [...this.initialFilters.metadata];
      }
    }
    this.takeSnapshot();
    if (this.showInsightFacets) {
      this.insightFacets.getLanguages().subscribe(languages => this.facetLanguages = languages);
    }
  }

  private takeSnapshot() {
    this.snapshotFilters = JSON.stringify({ ...this.filters, metadata: undefined });
    this.snapshotMetadata = JSON.stringify(this.metadataFilters);
  }

  get hasChanges(): boolean {
    const currentFilters = JSON.stringify({ ...this.filters, metadata: undefined });
    const currentMetadata = JSON.stringify(this.metadataFilters);
    return currentFilters !== this.snapshotFilters || currentMetadata !== this.snapshotMetadata;
  }

  get showFileTypeFilter(): boolean {
    return this.filters.type !== DocumentType.FOLDER;
  }

  /** The facet selects follow the backend's insights flag (the facets endpoint 404s without it). */
  get showInsightFacets(): boolean {
    return this.insightFacets.enabled;
  }

  /** The deployment's category list, `other` included; a custom key keeps its raw name as label. */
  get facetCategories(): string[] {
    return this.insightFacets.categories;
  }

  /**
   * A facet searches the whole library: the insights index knows no folder, so the scope is
   * pinned to "All files" while one is set (the select shows it, greyed out, with a note).
   */
  get hasFacetFilter(): boolean {
    return !!this.filters.category || !!this.filters.language;
  }

  categoryLabel(key: string): string {
    return this.insightFacets.categoryLabel(key);
  }

  languageLabel(code: string): string {
    return this.insightFacets.languageLabel(code);
  }

  documentTypes = [
    { labelKey: 'searchFilters.documentTypes.all', value: undefined },
    { labelKey: 'searchFilters.documentTypes.folders', value: DocumentType.FOLDER },
    { labelKey: 'searchFilters.documentTypes.files', value: DocumentType.FILE }
  ];

  dateOptions = DATE_MODIFIED_OPTIONS;

  // File-type options are sourced from the shared category definitions so the advanced
  // dialog and the toolbar quick-filter stay in sync. Values are category ids (e.g. 'word'),
  // resolved to content-type LIKE patterns in DocumentApiService.
  fileTypeOptions = [
    { labelKey: 'searchFilters.fileTypeOptions.any', value: ANY_FILE_TYPE, icon: 'apps', color: '' },
    ...FILE_TYPE_CATEGORIES.map(c => ({ labelKey: c.labelKey, value: c.id, icon: c.icon, color: c.color }))
  ];

  scopeOptions: { labelKey: string; value: SearchScope }[] = [
    { labelKey: 'searchFilters.scopeOptions.all', value: 'ALL' },
    { labelKey: 'searchFilters.scopeOptions.currentAndSubfolders', value: 'CURRENT_AND_SUBFOLDERS' },
    { labelKey: 'searchFilters.scopeOptions.currentOnly', value: 'CURRENT_ONLY' }
  ];

  /** Filters set in the panel right now (the badge next to the title). */
  get activeCount(): number {
    return countActiveFilters({ ...this.filters, metadata: this.metadataFilters });
  }

  setScope(scope: SearchScope) {
    if (!this.hasFacetFilter) {
      this.filters.scope = scope;
    }
  }

  setType(type: DocumentType | undefined) {
    this.filters.type = type;
    if (type === DocumentType.FOLDER) {
      // Folders have no file type
      this.filters.fileType = ANY_FILE_TYPE;
    }
  }

  setFileType(fileType: string) {
    this.filters.fileType = fileType;
    if (fileType !== ANY_FILE_TYPE && this.filters.type === DocumentType.FOLDER) {
      this.filters.type = undefined;
    }
  }

  setDate(value: string) {
    this.filters.dateModified = value;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close.emit();
  }

  addMetadataFilter() {
    this.metadataFilters.push({ key: '', value: '' });
  }

  removeMetadataFilter(index: number) {
    this.metadataFilters.splice(index, 1);
  }

  /** Picking a facet pins the scope to the whole library (see {@link hasFacetFilter}). */
  onFacetChange() {
    if (this.hasFacetFilter) {
      this.filters.scope = 'ALL';
    }
  }

  applyFilters() {
    // Filter out empty keys
    const validMetadata = this.metadataFilters.filter(m => m.key.trim() !== '');
    this.filters.metadata = validMetadata;
    if (this.hasFacetFilter) {
      this.filters.scope = 'ALL';
    }
    this.filtersChanged.emit(this.filters);
    this.close.emit();
  }

  clearFilters() {
    this.filters = {
      type: undefined,
      dateModified: 'any',
      owner: '',
      fileType: 'any',
      metadata: [],
      scope: 'ALL',
      category: undefined,
      language: undefined
    };
    this.metadataFilters = [];
    this.filtersChanged.emit(this.filters);
  }
}
