import { filterMetadataKeys, MetadataKeySuggestion } from './metadata-key-filter';

const KEYS: MetadataKeySuggestion[] = [
  { key: 'status', count: 40 },
  { key: 'project', count: 30 },
  { key: 'sub-project', count: 20 },
  { key: 'Projection', count: 5 },
  { key: 'owner', count: 1 }
];

describe('filterMetadataKeys', () => {
  it('lists the most frequent keys for an empty query', () => {
    expect(filterMetadataKeys(KEYS, '', 2).map(k => k.key)).toEqual(['status', 'project']);
  });

  it('matches anywhere, case-insensitively, prefixes first', () => {
    expect(filterMetadataKeys(KEYS, 'PROJ').map(k => k.key)).toEqual(['project', 'Projection', 'sub-project']);
  });

  it('does not suggest back the key typed exactly', () => {
    expect(filterMetadataKeys(KEYS, 'owner')).toEqual([]);
  });

  it('caps the list', () => {
    expect(filterMetadataKeys(KEYS, 'o', 3).length).toBe(3);
  });
});
