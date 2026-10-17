/** A metadata key found on the documents the user can see (`GET /documents/metadata-keys`). */
export interface MetadataKeySuggestion {
  key: string;
  count: number;
}

/**
 * The suggestions for what the user typed: keys containing it (case-insensitive), the ones
 * starting with it first, each group in the server's order (most frequent first). An empty query
 * lists the most frequent keys; a key typed exactly is not suggested back.
 */
export function filterMetadataKeys(keys: MetadataKeySuggestion[], query: string, limit = 8): MetadataKeySuggestion[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) {
    return keys.slice(0, limit);
  }
  const starts: MetadataKeySuggestion[] = [];
  const contains: MetadataKeySuggestion[] = [];
  for (const k of keys) {
    const key = k.key.toLowerCase();
    if (k.key === query) {
      continue;
    }
    if (key.startsWith(q)) {
      starts.push(k);
    } else if (key.includes(q)) {
      contains.push(k);
    }
  }
  return [...starts, ...contains].slice(0, limit);
}
