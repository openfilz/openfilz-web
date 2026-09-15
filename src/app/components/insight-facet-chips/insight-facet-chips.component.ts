import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { SearchFilters } from '../../models/document.models';
import { InsightFacetsService } from '../../services/insight-facets.service';

export type InsightFacetField = 'category' | 'language';

interface FacetChip {
  field: InsightFacetField;
  icon: string;
  label: string;
}

/**
 * The active document-insights facets of a search — "Document kind" and "Language" — as
 * removable chips. Renders nothing when neither is set. Dedicated file for the enterprise fork:
 * the search results page only hosts the element.
 */
@Component({
  selector: 'app-insight-facet-chips',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule, TranslatePipe],
  template: `
    @if (chips.length > 0) {
      <div class="facet-chips" role="list" [attr.aria-label]="'searchFilters.activeFacets' | translate">
        @for (chip of chips; track chip.field) {
          <span class="facet-chip" role="listitem">
            <mat-icon class="facet-chip-icon" aria-hidden="true">{{ chip.icon }}</mat-icon>
            <span class="facet-chip-label">{{ chip.label }}</span>
            <button type="button" class="facet-chip-remove" (click)="remove.emit(chip.field)"
              [matTooltip]="'searchFilters.removeFilter' | translate"
              [attr.aria-label]="('searchFilters.removeFilter' | translate) + ': ' + chip.label">
              <mat-icon aria-hidden="true">close</mat-icon>
            </button>
          </span>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .facet-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 8px; }
    .facet-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 6px 4px 10px; border-radius: 999px;
      background: color-mix(in srgb, var(--primary, #6366f1) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--primary, #6366f1) 30%, transparent);
      color: var(--text-primary, #1e293b); font-size: 13px; line-height: 20px;
    }
    .facet-chip-icon { font-size: 16px; width: 16px; height: 16px; color: var(--primary, #6366f1); }
    .facet-chip-label { white-space: nowrap; }
    .facet-chip-remove {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; padding: 0; border: none; border-radius: 50%;
      background: none; color: var(--text-secondary, #64748b); cursor: pointer;
    }
    .facet-chip-remove:hover { background: color-mix(in srgb, var(--primary, #6366f1) 20%, transparent); color: var(--text-primary, #1e293b); }
    .facet-chip-remove mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `]
})
export class InsightFacetChipsComponent {
  @Input() filters?: SearchFilters | null;
  /** The user removed one facet: the host clears that field of the filters. */
  @Output() remove = new EventEmitter<InsightFacetField>();

  private facets = inject(InsightFacetsService);

  get chips(): FacetChip[] {
    const chips: FacetChip[] = [];
    const filters = this.filters;
    if (filters?.category) {
      chips.push({ field: 'category', icon: 'category', label: this.facets.facetLabel('category', filters.category) });
    }
    if (filters?.language) {
      chips.push({ field: 'language', icon: 'translate', label: this.facets.facetLabel('language', filters.language) });
    }
    return chips;
  }
}
