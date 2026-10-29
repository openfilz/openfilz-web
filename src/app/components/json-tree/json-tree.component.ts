import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { isJsonContainer, jsonChildPath, jsonSummary } from '../../utils/json-values';

export { jsonSummary } from '../../utils/json-values';
export type { JsonSummary } from '../../utils/json-values';

interface JsonChild {
  key: string;
  value: unknown;
}

/** The children of a container currently shown: the first `limit` of them. */
interface JsonPage {
  limit: number;
  children: JsonChild[];
}

/** Children shown before a "show more" button, so a huge array does not render thousands of rows. */
const PAGE_SIZE = 50;

/**
 * Read-only, collapsible view of a JSON value: one line per property, objects and arrays fold
 * behind a chevron and show their size when folded. The root object or array is always open (its
 * host shows its name); nested ones shallower than {@link expandDepth} start open.
 *
 * OnPush: the host (the details panel) re-renders often; the tree only changes through its own
 * clicks and its `value` input.
 */
@Component({
  selector: 'app-json-tree',
  standalone: true,
  templateUrl: './json-tree.component.html',
  styleUrls: ['./json-tree.component.css'],
  imports: [NgTemplateOutlet, MatIconModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JsonTreeComponent implements OnChanges {
  @Input() value: unknown;
  /** Containers shallower than this start expanded (1 = nested values folded, 2 = their first level open…). */
  @Input() expandDepth = 1;

  private expanded = new Set<string>();
  private collapsed = new Set<string>();
  private limits = new Map<string, number>();
  private childrenCache = new WeakMap<object, JsonChild[]>();
  /** The slice shown per path, kept so change detection does not rebuild it on every pass. */
  private pages = new Map<string, JsonPage>();

  readonly summary = jsonSummary;
  readonly isContainer = isJsonContainer;
  readonly childPath = jsonChildPath;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['value']) {
      this.expanded.clear();
      this.collapsed.clear();
      this.limits.clear();
      this.pages.clear();
    }
  }

  isArray(value: unknown): boolean {
    return Array.isArray(value);
  }

  isOpen(path: string, depth: number): boolean {
    if (this.expanded.has(path)) return true;
    if (this.collapsed.has(path)) return false;
    return depth < this.expandDepth;
  }

  toggle(path: string, depth: number) {
    if (this.isOpen(path, depth)) {
      this.expanded.delete(path);
      this.collapsed.add(path);
    } else {
      this.collapsed.delete(path);
      this.expanded.add(path);
    }
  }

  private children(value: object): JsonChild[] {
    let children = this.childrenCache.get(value);
    if (!children) {
      children = Array.isArray(value)
        ? value.map((v, i) => ({ key: String(i), value: v }))
        : Object.entries(value).map(([key, v]) => ({ key, value: v }));
      this.childrenCache.set(value, children);
    }
    return children;
  }

  private limit(path: string): number {
    return this.limits.get(path) ?? PAGE_SIZE;
  }

  visibleChildren(value: object, path: string): JsonChild[] {
    const limit = this.limit(path);
    let page = this.pages.get(path);
    if (!page || page.limit !== limit) {
      page = { limit, children: this.children(value).slice(0, limit) };
      this.pages.set(path, page);
    }
    return page.children;
  }

  hiddenCount(value: object, path: string): number {
    return Math.max(0, this.children(value).length - this.limit(path));
  }

  showMore(path: string) {
    this.limits.set(path, this.limit(path) + PAGE_SIZE);
  }

  /** CSS class of a scalar: drives its colour. */
  scalarType(value: unknown): string {
    return value === null ? 'null' : typeof value;
  }

  formatScalar(value: unknown): string {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
  }
}
