import {
  JSON_PREVIEW_MAX_LENGTH,
  formatMetadataValue,
  jsonChildPath,
  jsonSummary,
  parseEditedValue,
  previewMetadataValue
} from './json-values';

/** Only jasmine/vitest-common matchers (describe / it / expect / toEqual / toBe). */

describe('jsonSummary', () => {
  it('counts the keys of an object, singular for one', () => {
    expect(jsonSummary({ a: 1 })).toEqual({ key: 'jsonTree.key', params: { count: 1 } });
    expect(jsonSummary({ a: 1, b: 2 })).toEqual({ key: 'jsonTree.keys', params: { count: 2 } });
    expect(jsonSummary({})).toEqual({ key: 'jsonTree.keys', params: { count: 0 } });
  });

  it('counts the items of an array, singular for one', () => {
    expect(jsonSummary([1])).toEqual({ key: 'jsonTree.item', params: { count: 1 } });
    expect(jsonSummary([1, 2, 3])).toEqual({ key: 'jsonTree.items', params: { count: 3 } });
  });

  it('is null for scalars', () => {
    expect(jsonSummary('text')).toBeNull();
    expect(jsonSummary(12)).toBeNull();
    expect(jsonSummary(true)).toBeNull();
    expect(jsonSummary(null)).toBeNull();
    expect(jsonSummary(undefined)).toBeNull();
  });
});

describe('jsonChildPath', () => {
  it('appends the key as a segment', () => {
    expect(jsonChildPath('$', 'a')).toBe('$/a');
    expect(jsonChildPath('$/a', '0')).toBe('$/a/0');
  });

  it('escapes slashes and tildes so keys cannot collide with nested paths', () => {
    const flat = jsonChildPath('$', 'a/b');
    const nested = jsonChildPath(jsonChildPath('$', 'a'), 'b');
    expect(flat).not.toBe(nested);
    expect(flat).toBe('$/a~1b');
    expect(jsonChildPath('$', '~x')).toBe('$/~0x');
    expect(jsonChildPath('$', '~/')).toBe('$/~0~1');
  });
});

describe('formatMetadataValue', () => {
  it('renders objects and arrays as compact JSON', () => {
    expect(formatMetadataValue({ a: [1, 'b'] })).toBe('{"a":[1,"b"]}');
    expect(formatMetadataValue([])).toBe('[]');
  });

  it('renders scalars as text and null / undefined as empty', () => {
    expect(formatMetadataValue('x')).toBe('x');
    expect(formatMetadataValue(13)).toBe('13');
    expect(formatMetadataValue(false)).toBe('false');
    expect(formatMetadataValue(null)).toBe('');
    expect(formatMetadataValue(undefined)).toBe('');
  });
});

describe('previewMetadataValue', () => {
  it('leaves short text alone', () => {
    expect(previewMetadataValue('{"a":1}')).toBe('{"a":1}');
    expect(previewMetadataValue('x'.repeat(JSON_PREVIEW_MAX_LENGTH))).toBe('x'.repeat(JSON_PREVIEW_MAX_LENGTH));
  });

  it('cuts long text to the limit with an ellipsis', () => {
    const preview = previewMetadataValue('x'.repeat(JSON_PREVIEW_MAX_LENGTH + 1));
    expect(preview.length).toBe(JSON_PREVIEW_MAX_LENGTH);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('parseEditedValue', () => {
  it('keeps a string entry a string, even when its text looks like JSON', () => {
    expect(parseEditedValue('old', '{"a":1}')).toBe('{"a":1}');
    expect(parseEditedValue('old', '12')).toBe('12');
    expect(parseEditedValue(null, '12')).toBe('12');
    expect(parseEditedValue(undefined, 'x')).toBe('x');
  });

  it('parses objects and arrays back from their JSON text', () => {
    expect(parseEditedValue({ a: 1 }, '{\n  "a": 2,\n  "b": [true]\n}')).toEqual({ a: 2, b: [true] });
    expect(parseEditedValue([1], '[]')).toEqual([]);
    expect(parseEditedValue({ a: 1 }, '"now a string"')).toBe('now a string');
  });

  it('refuses invalid JSON for an object or array', () => {
    expect(parseEditedValue({ a: 1 }, '{a: 1}')).toBeUndefined();
    expect(parseEditedValue([1], 'not json')).toBeUndefined();
  });

  it('parses numbers and booleans, falling back to text when the JSON is invalid', () => {
    expect(parseEditedValue(12, '13')).toBe(13);
    expect(parseEditedValue(true, 'false')).toBe(false);
    expect(parseEditedValue(12, 'twelve')).toBe('twelve');
    expect(parseEditedValue(12, '{"a":1}')).toEqual({ a: 1 });
  });

  it('does not pollute Object.prototype through a __proto__ key', () => {
    const parsed = parseEditedValue({}, '{"__proto__": {"polluted": true}}') as Record<string, unknown>;
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(true);
  });
});
