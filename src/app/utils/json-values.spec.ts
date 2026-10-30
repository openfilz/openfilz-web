import {
  JSON_PREVIEW_MAX_LENGTH,
  formatMetadataValue,
  jsonChildPath,
  jsonSummary,
  lenientJsonLoaded,
  loadLenientJson,
  looksLikeJsonContainer,
  metadataValueType,
  parseTypedValue,
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

describe('metadataValueType', () => {
  it('edits numbers, booleans and containers as their own type, everything else as text', () => {
    expect(metadataValueType(12)).toBe('number');
    expect(metadataValueType(false)).toBe('boolean');
    expect(metadataValueType({ a: 1 })).toBe('json');
    expect(metadataValueType([])).toBe('json');
    expect(metadataValueType('12')).toBe('text');
    expect(metadataValueType(null)).toBe('text');
    expect(metadataValueType(undefined)).toBe('text');
  });
});

describe('looksLikeJsonContainer', () => {
  it('spots text opening an object or an array, blanks allowed', () => {
    expect(looksLikeJsonContainer('{')).toBe(true);
    expect(looksLikeJsonContainer('  [1]')).toBe(true);
    expect(looksLikeJsonContainer('x {')).toBe(false);
    expect(looksLikeJsonContainer('"{"')).toBe(false);
    expect(looksLikeJsonContainer('')).toBe(false);
  });
});

describe('parseTypedValue', () => {
  it('keeps text a string, even when it looks like JSON, a number or a boolean', () => {
    expect(parseTypedValue('text', '{"a":1}')).toEqual({ value: '{"a":1}' });
    expect(parseTypedValue('text', '0123')).toEqual({ value: '0123' });
    expect(parseTypedValue('text', 'true')).toEqual({ value: 'true' });
    expect(parseTypedValue('text', '  x  ')).toEqual({ value: 'x' });
  });

  it('parses numbers, with a decimal comma, and refuses anything else', () => {
    expect(parseTypedValue('number', '13')).toEqual({ value: 13 });
    expect(parseTypedValue('number', '-1.5')).toEqual({ value: -1.5 });
    expect(parseTypedValue('number', '1,5')).toEqual({ value: 1.5 });
    expect(parseTypedValue('number', '1,000.5')).toEqual({ error: 'invalidNumber' });
    expect(parseTypedValue('number', 'twelve')).toEqual({ error: 'invalidNumber' });
    expect(parseTypedValue('number', '')).toEqual({ error: 'invalidNumber' });
    expect(parseTypedValue('number', 'Infinity')).toEqual({ error: 'invalidNumber' });
  });

  it('parses the two boolean literals only', () => {
    expect(parseTypedValue('boolean', 'true')).toEqual({ value: true });
    expect(parseTypedValue('boolean', 'false')).toEqual({ value: false });
    expect(parseTypedValue('boolean', 'yes')).toEqual({ error: 'invalidBoolean' });
  });

  it('parses any JSON value but null, and refuses invalid JSON', () => {
    expect(parseTypedValue('json', '{\n  "a": 2,\n  "b": [true]\n}')).toEqual({ value: { a: 2, b: [true] } });
    expect(parseTypedValue('json', '[]')).toEqual({ value: [] });
    expect(parseTypedValue('json', '"a string"')).toEqual({ value: 'a string' });
    expect(parseTypedValue('json', '42')).toEqual({ value: 42 });
    expect(parseTypedValue('json', 'null')).toEqual({ error: 'invalidJson' });
    expect(parseTypedValue('json', '{a: 1}')).toEqual({ error: 'invalidJson' });
    expect(parseTypedValue('json', 'not json')).toEqual({ error: 'invalidJson' });
  });

  it('does not pollute Object.prototype through a __proto__ key', () => {
    const parsed = parseTypedValue('json', '{"__proto__": {"polluted": true}}') as { value: Record<string, unknown> };
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed.value, '__proto__')).toBe(true);
  });
});

describe('parseTypedValue with the lenient parser', () => {
  it('reads only strict JSON until the lenient parser is loaded', () => {
    expect(lenientJsonLoaded()).toBe(false);
    expect(parseTypedValue('json', "{ 'type': 2 }")).toEqual({ error: 'invalidJson' });
  });

  it('then reads JSON5: unquoted or single-quoted keys, single-quoted strings, trailing commas, comments', async () => {
    await loadLenientJson();
    expect(lenientJsonLoaded()).toBe(true);
    expect(parseTypedValue('json', "{ 'type': 2 }")).toEqual({ value: { type: 2 } });
    expect(parseTypedValue('json', '{ type: 2, name: \'it\\\'s\', }')).toEqual({ value: { type: 2, name: "it's" } });
    expect(parseTypedValue('json', '[1, 2, 3,]')).toEqual({ value: [1, 2, 3] });
    expect(parseTypedValue('json', '{\n  // the kind\n  kind: "invoice", /* paid? */ paid: false\n}')).toEqual({ value: { kind: 'invoice', paid: false } });
    expect(parseTypedValue('json', "'a string'")).toEqual({ value: 'a string' });
  });

  it('still refuses what is not JSON5 either, and null', async () => {
    await loadLenientJson();
    expect(parseTypedValue('json', '{ type: }')).toEqual({ error: 'invalidJson' });
    expect(parseTypedValue('json', 'not json')).toEqual({ error: 'invalidJson' });
    expect(parseTypedValue('json', 'null')).toEqual({ error: 'invalidJson' });
  });

  it('does not pollute Object.prototype through an unquoted __proto__ key', async () => {
    await loadLenientJson();
    const parsed = parseTypedValue('json', '{ __proto__: { polluted: true } }') as { value: Record<string, unknown> };
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed.value, '__proto__')).toBe(true);
  });
});
