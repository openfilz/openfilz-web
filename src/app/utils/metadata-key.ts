/**
 * Rules of a metadata key, shared by the add row and the inline edit (where the key can be renamed).
 * No Angular dependency: `metadata-key.spec.ts` runs under plain vitest.
 */

/** Letters, digits, underscore and hyphen; the API key grammar */
export const METADATA_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

export type MetadataKeyError = 'keyRequired' | 'invalidKeyFormat' | 'duplicateKey';

/**
 * Why `key` cannot be saved, or null. `taken` are the keys already on the document (minus the one
 * being renamed), `reserved` the keys the user never writes (system, e-Sign); both compared without
 * regard to case, since two keys differing by case only would be impossible to tell apart.
 */
export function metadataKeyError(key: string, taken: Iterable<string>, reserved: Iterable<string>): MetadataKeyError | null {
  const trimmed = key.trim();
  if (!trimmed) return 'keyRequired';
  if (!METADATA_KEY_PATTERN.test(trimmed)) return 'invalidKeyFormat';
  const lower = trimmed.toLowerCase();
  for (const existing of [...taken, ...reserved]) {
    if (existing.toLowerCase() === lower) return 'duplicateKey';
  }
  return null;
}
