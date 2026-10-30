import { metadataKeyError } from './metadata-key';

/** Only jasmine/vitest-common matchers (describe / it / expect / toEqual / toBe). */

describe('metadataKeyError', () => {
  const reserved = ['sha256', '_signed'];

  it('requires a key', () => {
    expect(metadataKeyError('', [], reserved)).toBe('keyRequired');
    expect(metadataKeyError('   ', [], reserved)).toBe('keyRequired');
  });

  it('accepts letters, digits, underscore and hyphen only', () => {
    expect(metadataKeyError('author_1-b', [], reserved)).toBeNull();
    expect(metadataKeyError('auteur principal', [], reserved)).toBe('invalidKeyFormat');
    expect(metadataKeyError('clé', [], reserved)).toBe('invalidKeyFormat');
  });

  it('refuses a key already on the document or reserved, whatever the case', () => {
    expect(metadataKeyError('Client', ['client'], reserved)).toBe('duplicateKey');
    expect(metadataKeyError('SHA256', [], reserved)).toBe('duplicateKey');
    expect(metadataKeyError('_Signed', [], reserved)).toBe('duplicateKey');
  });

  it('lets a renamed key keep its own name when the caller leaves it out of the taken keys', () => {
    const taken = ['client', 'status'].filter(k => k !== 'client');
    expect(metadataKeyError('client', taken, reserved)).toBeNull();
    expect(metadataKeyError('CLIENT', taken, reserved)).toBeNull();
    expect(metadataKeyError('status', taken, reserved)).toBe('duplicateKey');
  });
});
