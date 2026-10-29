/**
 * Pure helpers for metadata values that may be JSON objects or arrays: how they are summarised,
 * previewed, edited as text and saved back with their type. No Angular dependency, so the
 * `json-values.spec.ts` suite runs under plain vitest.
 */

/** A translation key + params summarising an object or array ("3 keys", "5 items"). */
export interface JsonSummary {
  key: string;
  params: { count: number };
}

/** Longest one-line JSON preview shown for a folded value (the full text is only in the tree / editor). */
export const JSON_PREVIEW_MAX_LENGTH = 200;

export function isJsonContainer(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

/** Summary of a JSON container, or null for a scalar. */
export function jsonSummary(value: unknown): JsonSummary | null {
  if (Array.isArray(value)) {
    return { key: value.length === 1 ? 'jsonTree.item' : 'jsonTree.items', params: { count: value.length } };
  }
  if (isJsonContainer(value)) {
    const count = Object.keys(value).length;
    return { key: count === 1 ? 'jsonTree.key' : 'jsonTree.keys', params: { count } };
  }
  return null;
}

/**
 * Path of a child inside the tree, used as the key of its fold state. Segments are escaped the
 * JSON-pointer way (`~` → `~0`, `/` → `~1`) so a key containing `/` cannot collide with a nested path.
 */
export function jsonChildPath(parentPath: string, key: string): string {
  return parentPath + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Text form of a metadata value: JSON for objects and arrays (String() would give "[object Object]"). */
export function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** One-line preview of a value, cut to {@link JSON_PREVIEW_MAX_LENGTH} characters with an ellipsis. */
export function previewMetadataValue(text: string): string {
  return text.length > JSON_PREVIEW_MAX_LENGTH ? text.slice(0, JSON_PREVIEW_MAX_LENGTH - 1) + '…' : text;
}

/**
 * Value to save for an edited entry. A string stays a string; any other stored type is parsed back
 * from its JSON text. `undefined` means the text is not valid JSON for an object or array.
 */
export function parseEditedValue(raw: unknown, text: string): unknown {
  if (raw === null || raw === undefined || typeof raw === 'string') return text;
  try {
    return JSON.parse(text);
  } catch {
    return typeof raw === 'object' ? undefined : text;
  }
}
