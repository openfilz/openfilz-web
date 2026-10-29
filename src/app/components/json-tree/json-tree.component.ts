import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

/** A translation key + params summarising an object or array ("3 keys", "5 items"). */
export interface JsonSummary {
  key: string;
  params: { count: number };
}

/** Summary of a JSON container, or null for a scalar. */
export function jsonSummary(value: unknown): JsonSummary | null {
  if (Array.isArray(value)) {
    return { key: value.length === 1 ? 'jsonTree.item' : 'jsonTree.items', params: { count: value.length } };
  }
  if (value !== null && typeof value === 'object') {
    const count = Object.keys(value).length;
    return { key: count === 1 ? 'jsonTree.key' : 'jsonTree.keys', params: { count } };
  }
  return null;
}

interface JsonChild {
  key: string;
  value: unknown;
}

/** Children shown before a "show more" button, so a huge array does not render thousands of rows. */
const PAGE_SIZE = 50;

/**
 * Read-only, collapsible view of a JSON value: one line per property, objects and arrays fold
 * behind a chevron and show their size when folded. The root object or array is always open (its
 * host shows its name); nested ones shallower than {@link expandDepth} start open.
 */
@Component({
  selector: 'app-json-tree',
  standalone: true,
  templateUrl: './json-tree.component.html',
  styleUrls: ['./json-tree.component.css'],
  imports: [NgTemplateOutlet, MatIconModule, TranslatePipe]
})
export class JsonTreeComponent implements OnChanges {
  @Input() value: unknown;
  /** Containers shallower than this start expanded (1 = nested values folded, 2 = their first level open…). */
  @Input() expandDepth = 1;

  private expanded = new Set<string>();
  private collapsed = new Set<string>();
  private limits = new Map<string, number>();
  private childrenCache = new WeakMap<object, JsonChild[]>();

  readonly summary = jsonSummary;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['value']) {
      this.expanded.clear();
      this.collapsed.clear();
      this.limits.clear();
    }
  }

  isContainer(value: unknown): value is object {
    return value !== null && typeof value === 'object';
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

  children(value: object): JsonChild[] {
    let children = this.childrenCache.get(value);
    if (!children) {
      children = Array.isArray(value)
        ? value.map((v, i) => ({ key: String(i), value: v }))
        : Object.entries(value).map(([key, v]) => ({ key, value: v }));
      this.childrenCache.set(value, children);
    }
    return children;
  }

  visibleChildren(value: object, path: string): JsonChild[] {
    return this.children(value).slice(0, this.limits.get(path) ?? PAGE_SIZE);
  }

  hiddenCount(value: object, path: string): number {
    return Math.max(0, this.children(value).length - (this.limits.get(path) ?? PAGE_SIZE));
  }

  showMore(path: string) {
    this.limits.set(path, (this.limits.get(path) ?? PAGE_SIZE) + PAGE_SIZE);
  }

  /** CSS class of a scalar: drives its colour. */
  scalarType(value: unknown): string {
    return value === null ? 'null' : typeof value;
  }

  formatScalar(value: unknown): string {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
  }
}
