import { Component, ElementRef, ViewChild, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { MetadataKeySuggestion, filterMetadataKeys } from '../../utils/metadata-key-filter';

let nextId = 0;

/**
 * The key field of a metadata filter row, with suggestions from the keys of the visible documents
 * (substring match, document count as hint, ↑/↓/Enter/Esc). The list is drawn inside the filter
 * panel itself rather than in a CDK overlay: the panel closes on clicks outside its own element and
 * covers the overlay container on phones. Without suggestions it is a plain text input.
 * Dedicated file for the enterprise fork.
 */
@Component({
  selector: 'app-metadata-key-input',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './metadata-key-input.component.html',
  styleUrls: ['./metadata-key-input.component.css']
})
export class MetadataKeyInputComponent {
  /** The key, two-way bound. */
  value = model<string>('');
  /** Every suggested key, most frequent first. */
  keys = input<MetadataKeySuggestion[]>([]);
  placeholder = input<string>('');
  ariaLabel = input<string>('');

  @ViewChild('field', { static: true }) field!: ElementRef<HTMLInputElement>;

  /** A list opened at the bottom of the panel's scrolling content is brought into view (phones). */
  @ViewChild('list') set list(list: ElementRef<HTMLElement> | undefined) {
    list?.nativeElement.scrollIntoView?.({ block: 'nearest' });
  }

  readonly listId = `metadata-key-list-${nextId++}`;
  open = false;
  activeIndex = -1;
  options: MetadataKeySuggestion[] = [];

  optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  onFocus() {
    this.refresh(true);
  }

  onInput(text: string) {
    this.value.set(text);
    this.refresh(true);
  }

  onBlur() {
    this.open = false;
    this.activeIndex = -1;
  }

  onKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open) {
          this.refresh(true);
        } else if (this.options.length) {
          this.activeIndex = (this.activeIndex + 1) % this.options.length;
        }
        break;
      case 'ArrowUp':
        if (this.open && this.options.length) {
          event.preventDefault();
          this.activeIndex = this.activeIndex <= 0 ? this.options.length - 1 : this.activeIndex - 1;
        }
        break;
      case 'Enter':
        if (this.open && this.activeIndex >= 0) {
          event.preventDefault();
          this.pick(this.options[this.activeIndex]);
        }
        break;
      case 'Escape':
        if (this.open) {
          // closes the list, not the filter panel
          event.stopPropagation();
          this.onBlur();
        }
        break;
    }
  }

  pick(option: MetadataKeySuggestion) {
    this.value.set(option.key);
    this.open = false;
    this.activeIndex = -1;
    this.field.nativeElement.focus();
  }

  private refresh(show: boolean) {
    this.options = filterMetadataKeys(this.keys(), this.value());
    this.open = show && this.options.length > 0;
    this.activeIndex = -1;
  }
}
