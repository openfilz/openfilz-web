import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { DocumentType, SearchFilters, SearchScope } from '../../models/document.models';

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
    scope: 'ALL'
  };

  metadataFilters: { key: string; value: string }[] = [];

  private snapshotFilters!: string;
  private snapshotMetadata!: string;

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

  documentTypes = [
    { labelKey: 'searchFilters.documentTypes.all', value: undefined },
    { labelKey: 'searchFilters.documentTypes.folders', value: DocumentType.FOLDER },
    { labelKey: 'searchFilters.documentTypes.files', value: DocumentType.FILE }
  ];

  dateOptions = [
    { labelKey: 'searchFilters.dateOptions.any', value: 'any' },
    { labelKey: 'searchFilters.dateOptions.today', value: 'today' },
    { labelKey: 'searchFilters.dateOptions.last7', value: 'last7' },
    { labelKey: 'searchFilters.dateOptions.last30', value: 'last30' }
  ];

  fileTypeOptions = [
    { labelKey: 'searchFilters.fileTypeOptions.any', value: 'any' },
    { labelKey: 'searchFilters.fileTypeOptions.pdfs', value: 'application/pdf' },
    { labelKey: 'searchFilters.fileTypeOptions.images', value: 'image/' },
    { labelKey: 'searchFilters.fileTypeOptions.documents', value: 'application/msword' },
    { labelKey: 'searchFilters.fileTypeOptions.spreadsheets', value: 'application/vnd.ms-excel' }
  ];

  scopeOptions: { labelKey: string; value: SearchScope }[] = [
    { labelKey: 'searchFilters.scopeOptions.all', value: 'ALL' },
    { labelKey: 'searchFilters.scopeOptions.currentAndSubfolders', value: 'CURRENT_AND_SUBFOLDERS' },
    { labelKey: 'searchFilters.scopeOptions.currentOnly', value: 'CURRENT_ONLY' }
  ];

  addMetadataFilter() {
    this.metadataFilters.push({ key: '', value: '' });
  }

  removeMetadataFilter(index: number) {
    this.metadataFilters.splice(index, 1);
  }

  applyFilters() {
    // Filter out empty keys
    const validMetadata = this.metadataFilters.filter(m => m.key.trim() !== '');
    this.filters.metadata = validMetadata;
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
      scope: 'ALL'
    };
    this.metadataFilters = [];
    this.filtersChanged.emit(this.filters);
  }
}
