/**
 * Pure helpers for metadata values that may be JSON objects or arrays: how they are summarised,
 * previewed, typed in under a chosen type and saved back with that type. No Angular dependency, so the
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

/** How a scalar metadata value is typed in: as text, a number, a boolean or raw JSON. */
export type MetadataValueType = 'text' | 'number' | 'boolean' | 'json';

export const METADATA_VALUE_TYPES: readonly MetadataValueType[] = ['text', 'number', 'boolean', 'json'];

/** The type a stored value is edited as: objects and arrays as JSON, anything unknown (null) as text. */
export function metadataValueType(raw: unknown): MetadataValueType {
  if (typeof raw === 'number') return 'number';
  if (typeof raw === 'boolean') return 'boolean';
  if (isJsonContainer(raw)) return 'json';
  return 'text';
}

/** True when text typed as plain text opens a JSON object or array, so the editor can switch to JSON by itself. */
export function looksLikeJsonContainer(text: string): boolean {
  const first = text.trimStart()[0];
  return first === '{' || first === '[';
}

export type TypedValueError = 'invalidJson' | 'invalidNumber' | 'invalidBoolean';

/**
 * Lenient JSON input. Strict JSON (double quotes everywhere, no trailing comma) is what JSON.parse
 * takes; what people type is often JSON5 — `{ type: 2 }`, `{ 'type': 2 }`, a trailing comma, a
 * comment. The JSON5 parser is a separate chunk loaded on demand (nothing is loaded until a JSON
 * value is typed); until it is there, only strict JSON parses. Whatever the syntax typed, the value
 * saved is the parsed object, so what is stored and shown is always strict JSON.
 */
type LenientJsonParser = (text: string) => unknown;
let lenientJson: LenientJsonParser | null = null;
let lenientJsonLoading: Promise<void> | null = null;

/** Loads the JSON5 parser once; resolves either way (a failed load leaves strict parsing only). */
export function loadLenientJson(): Promise<void> {
  if (lenientJson) return Promise.resolve();
  if (!lenientJsonLoading) {
    lenientJsonLoading = import('json5').then(
      m => { lenientJson = text => m.default.parse(text); },
      () => { lenientJsonLoading = null; }
    );
  }
  return lenientJsonLoading;
}

export function lenientJsonLoaded(): boolean {
  return lenientJson !== null;
}

/** Strict JSON first, JSON5 when it is loaded; throws when neither reads the text. */
function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    if (!lenientJson) throw e;
    return lenientJson(text);
  }
}

/**
 * Value to save for text entered under a type, or the error to show when the text does not fit it.
 * Text stays a string whatever it looks like ("0123", "true" and "{}" are legitimate strings); a number
 * accepts a decimal comma; JSON takes any JSON value but null (a null entry would show as empty), in
 * strict or, once {@link loadLenientJson} has run, JSON5 syntax.
 */
export function parseTypedValue(type: MetadataValueType, text: string): { value: unknown } | { error: TypedValueError } {
  const trimmed = text.trim();
  switch (type) {
    case 'number': {
      const normalised = /^[^.,]*,[^.,]*$/.test(trimmed) ? trimmed.replace(',', '.') : trimmed;
      const value = Number(normalised);
      return trimmed && Number.isFinite(value) ? { value } : { error: 'invalidNumber' };
    }
    case 'boolean':
      return trimmed === 'true' || trimmed === 'false' ? { value: trimmed === 'true' } : { error: 'invalidBoolean' };
    case 'json':
      try {
        const value = parseJsonText(trimmed);
        return value === null ? { error: 'invalidJson' } : { value };
      } catch {
        return { error: 'invalidJson' };
      }
    default:
      return { value: trimmed };
  }
}
