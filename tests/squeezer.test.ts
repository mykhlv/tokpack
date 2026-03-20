import { describe, it, expect } from 'vitest';
import { Squeezer } from '../src/squeezer.js';
import { rpc, makeArray, makeStructuredText, makeKeyValueText, makeBoldKeyValueText, makeHeaderSeparatedText } from './helpers.js';

const sq = new Squeezer({});

// --- 3.1 Threshold guards ---

describe('threshold guards', () => {
  it('passes through payload < 512 bytes', () => {
    const small = JSON.stringify([{ id: 1, name: 'a' }]);
    const line = rpc(small);
    expect(sq.process(line)).toBe(line);
  });

  it('optimizes payload >= 512 bytes', () => {
    const big = makeArray(10);
    expect(big.length).toBeGreaterThanOrEqual(512);
    const result = sq.process(rpc(big));
    expect(result).not.toBe(rpc(big));
  });
});

// --- 3.2 MIN_ITEMS guard ---

describe('MIN_ITEMS guard', () => {
  it('array with 2 items → minified JSON (not PSV)', () => {
    const data = Array.from({ length: 2 }, (_, i) => ({
      id: i + 1,
      name: `user_with_a_very_long_name_for_padding_${i}`,
      email: `user_with_a_very_long_email_address_${i}@example-domain.com`,
      bio: `This is a much longer biography text for testing purposes to ensure we exceed the minimum character threshold number ${i}`,
      description: `Additional description field to add more bytes to the payload for testing purposes ${i}`,
    }));
    const text = JSON.stringify(data, null, 2);
    expect(text.length).toBeGreaterThanOrEqual(512);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    // Should be minified JSON, not PSV (< MIN_ITEMS)
    expect(out).not.toContain('## PSV');
    expect(out).toBe(JSON.stringify(data));
  });

  it('array with 6+ items → PSV', () => {
    const arr = makeArray(6);
    const result = sq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const text = parsed.result.content[0].text;
    expect(text).toContain('## PSV');
  });
});

// --- 3.3 Uniformity guard ---

describe('uniformity guard', () => {
  it('valid first 3 items, mismatched 4th → fallback to minified JSON', () => {
    // First 3 items are uniform, but 4th has extra key → full validation catches it
    const data = [
      { id: 1, name: 'a', email: 'a@b.com' },
      { id: 2, name: 'b', email: 'b@b.com' },
      { id: 3, name: 'c', email: 'c@b.com' },
      { id: 4, name: 'd', email: 'd@b.com', extra: 'oops' },
      { id: 5, name: 'e', email: 'e@b.com' },
      { id: 6, name: 'f', email: 'f@b.com' },
    ];
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    // toPSV should throw on key count mismatch → fallback to minified JSON
    expect(out).not.toContain('## PSV');
    expect(out.startsWith('[')).toBe(true);
  });

  it('mixed key sets → fallback to minified JSON', () => {
    const data = [
      { id: 1, name: 'a' },
      { id: 2, age: 30 },
      { id: 3, name: 'c' },
      { id: 4, name: 'd' },
      { id: 5, name: 'e' },
      { id: 6, name: 'f' },
    ];
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
  });
});

// --- 3.4 Nested values ---

describe('nested values', () => {
  it('object in value → flattened to PSV with dot-notation keys', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      addr: { city: 'Kyiv' },
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('addr.city');
  });

  it('object in value → fallback when flatten disabled', () => {
    const noFlatten = new Squeezer({ flatten: false });
    const data = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      addr: { city: 'Kyiv' },
    }));
    const text = JSON.stringify(data, null, 2);
    const result = noFlatten.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
  });

  it('array in value → flattened to PSV with stringified array', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      tags: ['a', 'b'],
      note: 'padding to exceed threshold',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
  });

  it('array in value → fallback when flatten disabled', () => {
    const noFlatten = new Squeezer({ flatten: false });
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      tags: ['a', 'b'],
      note: 'padding to exceed threshold',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = noFlatten.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
  });
});

// --- 3.5 Pipe escaping ---

describe('pipe escaping', () => {
  it('values containing | → escaped as \\|', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `a|b_${i}`,
      email: `user${i}@example.com`,
      note: 'some longer note to exceed threshold',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('a\\|b_0');
  });

  it('unicode/emoji → unchanged', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Привіт_${i}`,
      email: `user${i}@example.com`,
      icon: '🎉',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('Привіт_0');
    expect(out).toContain('🎉');
  });

  it('values containing \\ → backslash preserved', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `path\\to\\file_${i}`,
      email: `user${i}@example.com`,
      note: 'some longer note to exceed threshold',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('path\\\\to\\\\file_0');
  });

  it('backslash before pipe → both preserved (known ambiguity)', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `foo\\|bar_${i}`,
      email: `user${i}@example.com`,
      note: 'some longer note to exceed threshold',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    // source `foo\|bar_0` → backslash escaped then pipe escaped: `foo\\\|bar_0`
    expect(out).toContain('foo\\\\\\|bar_0');
  });
});

// --- 3.6 Null handling ---

describe('null handling', () => {
  it('null → empty string (strip disabled)', () => {
    const noStrip = new Squeezer({ verbose: false, stripEmpty: false });
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: null,
      email: `user${i}@example.com`,
      note: 'some text to ensure we exceed the byte threshold',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = noStrip.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    // null should become empty between pipes
    const lines = out.split('\n');
    expect(lines[1]).toBe('1||user0@example.com|some text to ensure we exceed the byte threshold');
  });

  it('all-null column → stripped from output', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: null,
      email: `user${i}@example.com`,
      note: 'some text to ensure we exceed the byte threshold',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).not.toContain('name');
    const lines = out.split('\n');
    expect(lines[0]).toContain('id,email,note');
  });

  it('undefined → empty string (serialized as null in JSON)', () => {
    // JSON.stringify turns undefined to null — test that null from JSON becomes empty
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      email: `user${i}@example.com`,
      note: 'some text to ensure we exceed the byte threshold easily',
    }));
    data[0].name = null as unknown as string;
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    const lines = out.split('\n');
    expect(lines[1]).toContain('1||user0@example.com');
  });
});

// --- 3.7 Quick filter ---

describe('quick filter', () => {
  it('lines not starting with { → pass-through', () => {
    expect(sq.process('hello world')).toBe('hello world');
    expect(sq.process('[1,2,3]')).toBe('[1,2,3]');
  });

  it('lines without "result" → pass-through', () => {
    const line = JSON.stringify({ jsonrpc: '2.0', method: 'test', params: {} });
    expect(sq.process(line)).toBe(line);
  });

  it('lines without "content" → pass-through', () => {
    const line = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { data: 'x' } });
    expect(sq.process(line)).toBe(line);
  });

  it('valid JSON-RPC with non-text content type → pass-through', () => {
    const line = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'image', data: 'base64...' }] },
    });
    expect(sq.process(line)).toBe(line);
  });

  it('multiple content items optimized independently', () => {
    const bigArray = makeArray(10);
    const smallText = '{"status":"ok"}';
    const line = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          { type: 'text', text: bigArray },
          { type: 'text', text: smallText },
        ],
      },
    });
    const result = sq.process(line);
    const parsed = JSON.parse(result);
    // First item should be optimized to PSV
    expect(parsed.result.content[0].text).toContain('## PSV');
    // Second item should remain unchanged (too small)
    expect(parsed.result.content[1].text).toBe(smallText);
  });
});

// --- 3.8 PSV format verification ---

describe('PSV format', () => {
  it('header format: ## PSV|key1,key2,...', () => {
    const arr = makeArray(8);
    const result = sq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const header = out.split('\n')[0];
    expect(header).toBe('## PSV|id,name,email,active');
  });

  it('row format: val1|val2|...', () => {
    const arr = makeArray(6);
    const result = sq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toBe('1|user_1|user1@example.com|true');
  });

  it('correct row count', () => {
    const arr = makeArray(10);
    const result = sq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    // 1 header + 10 data rows
    expect(lines).toHaveLength(11);
  });
});

// --- 3.9 Minification ---

describe('minification', () => {
  it('pretty-printed JSON → minified JSON for small arrays', () => {
    const data = Array.from({ length: 2 }, (_, i) => ({
      id: i + 1,
      name: `user_with_a_very_long_name_for_padding_${i}`,
      email: `user_with_a_very_long_email_address_${i}@example-domain.com`,
      bio: `This is a much longer biography text for testing purposes to ensure we exceed the minimum character threshold number ${i}`,
      description: `Additional description field to add more bytes to the payload for testing purposes ${i}`,
    }));
    const text = JSON.stringify(data, null, 2);
    expect(text.length).toBeGreaterThanOrEqual(512);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('\n');
    expect(out).toBe(JSON.stringify(data));
  });
});

// --- 3.10 Snapshot tests ---

describe('snapshots', () => {
  it('50-row array → stable PSV output', () => {
    const arr = makeArray(50);
    const result = sq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[0]).toBe('## PSV|id,name,email,active');
    expect(lines).toHaveLength(51); // 1 header + 50 rows
    expect(lines[1]).toBe('1|user_1|user1@example.com|true');
    expect(lines[50]).toBe('50|user_50|user50@example.com|true');
  });

  it('10-row array → stable PSV output', () => {
    const arr = makeArray(10);
    const result = sq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toMatchInlineSnapshot(`
      "## PSV|id,name,email,active
      1|user_1|user1@example.com|true
      2|user_2|user2@example.com|true
      3|user_3|user3@example.com|true
      4|user_4|user4@example.com|true
      5|user_5|user5@example.com|true
      6|user_6|user6@example.com|true
      7|user_7|user7@example.com|true
      8|user_8|user8@example.com|true
      9|user_9|user9@example.com|true
      10|user_10|user10@example.com|true"
    `);
  });
});

// --- 4.1 Null/empty stripping ---

describe('null/empty stripping', () => {
  it('strips column that is empty string in all rows', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      deleted: '',
      email: `user${i}@example.com`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).not.toContain('deleted');
    expect(out).toContain('id,email,note');
  });

  it('preserves column with mixed null and non-null values', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: i === 0 ? null : `user_${i}`,
      email: `user${i}@example.com`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const noStrip = new Squeezer({ verbose: false, stripEmpty: false });
    const result = noStrip.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('name');
  });

  it('strips multiple all-null columns', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      field_a: null,
      field_b: null,
      email: `user${i}@example.com`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).not.toContain('field_a');
    expect(out).not.toContain('field_b');
    expect(out).toContain('id,email,note');
  });

  it('disabled via stripEmpty: false', () => {
    const noStrip = new Squeezer({ verbose: false, stripEmpty: false });
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: null,
      email: `user${i}@example.com`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = noStrip.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('name');
  });
});

// --- 4.2 Dot-notation flattening ---

describe('dot-notation flattening', () => {
  it('single level nesting → dot-notation keys in PSV', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      address: { city: 'Kyiv', zip: '01001' },
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('address.city');
    expect(out).toContain('address.zip');
    expect(out).toContain('Kyiv');
  });

  it('two-level nesting → flattened with double dot', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      meta: { location: { city: 'Kyiv' } },
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('meta.location.city');
  });

  it('beyond max depth → stringified as JSON', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      deep: { a: { b: { c: { d: 'too deep' } } } },
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    // depth 3 means a.b.c is flattened, but c.d is stringified
    expect(out).toContain('deep.a.b.c');
  });

  it('array values → stringified as JSON in PSV', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      tags: [1, 2, 3],
      note: 'padding to exceed threshold value',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    // tags should be stringified: [1,2,3]
    const lines = out.split('\n');
    expect(lines[1]).toContain('[1,2,3]');
  });

  it('non-uniform nested structures → fallback to minified JSON', () => {
    const data = [
      { id: 1, meta: { city: 'Kyiv' }, name: 'a', note: 'padding text here' },
      { id: 2, meta: { age: 30 }, name: 'b', note: 'padding text here' },
      { id: 3, meta: { city: 'Lviv' }, name: 'c', note: 'padding text here' },
      { id: 4, meta: { city: 'Odesa' }, name: 'd', note: 'padding text here' },
      { id: 5, meta: { city: 'Dnipro' }, name: 'e', note: 'padding text here' },
      { id: 6, meta: { city: 'Kharkiv' }, name: 'f', note: 'padding text here' },
    ];
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    // Non-uniform nested keys after flattening → key mismatch → minified
    expect(out).not.toContain('## PSV');
  });

  it('combined strip + flatten on same data', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      deleted_at: null,
      profile: { name: `user_${i}`, bio: '' },
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    // deleted_at should be stripped (all null)
    expect(out).not.toContain('deleted_at');
    // profile.bio is "" but not all rows — wait, it IS all rows
    // profile should be flattened
    expect(out).toContain('profile.name');
  });
});

// --- 4.3 Markdown table format ---

describe('markdown table format', () => {
  const mdSq = new Squeezer({ verbose: false, format: 'md' });

  it('produces markdown table with header and separator', () => {
    const arr = makeArray(6);
    const result = mdSq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[0]).toBe('| id | name | email | active |');
    expect(lines[1]).toBe('|---|---|---|---|');
    expect(lines[2]).toBe('| 1 | user_1 | user1@example.com | true |');
  });

  it('correct row count (header + separator + N data rows)', () => {
    const arr = makeArray(10);
    const result = mdSq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    // 1 header + 1 separator + 10 data rows
    expect(lines).toHaveLength(12);
  });

  it('pipe escaping in markdown cells', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `a|b_${i}`,
      email: `user${i}@example.com`,
      note: 'padding to exceed threshold value',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = mdSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('a\\|b_0');
  });

  it('null values in markdown cells → empty', () => {
    const noStrip = new Squeezer({ verbose: false, format: 'md', stripEmpty: false });
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: null,
      email: `user${i}@example.com`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = noStrip.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    // null becomes empty cell
    expect(lines[2]).toBe('| 1 |  | user0@example.com | padding text to exceed the byte threshold easily |');
  });

  it('same data: default → PSV, format=md → markdown', () => {
    const arr = makeArray(6);
    const psvResult = sq.process(rpc(arr));
    const mdResult = mdSq.process(rpc(arr));
    const psvOut = JSON.parse(psvResult).result.content[0].text;
    const mdOut = JSON.parse(mdResult).result.content[0].text;
    expect(psvOut).toContain('## PSV');
    expect(mdOut).toContain('|---|');
    expect(mdOut).not.toContain('## PSV');
  });
});

// --- 5.1 Newline escaping in PSV ---

describe('newline escaping in PSV', () => {
  it('values containing newline → escaped as \\n in PSV output', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      bio: 'line1\nline2',
      email: `user${i}@example.com`,
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    // Each row should be a single line — newline in value must be escaped
    const lines = out.split('\n');
    // 1 header + 10 data rows = 11 lines
    expect(lines).toHaveLength(11);
    expect(lines[1]).toContain('line1\\nline2');
  });
});

// --- 5.2 Backslash escaping in markdown ---

describe('backslash escaping in markdown', () => {
  it('values containing backslash → escaped in markdown output', () => {
    const mdSq = new Squeezer({ verbose: false, format: 'md' });
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `path\\to\\file_${i}`,
      email: `user${i}@example.com`,
      note: 'padding to exceed threshold value',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = mdSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('|---|');
    expect(out).toContain('path\\\\to\\\\file_0');
  });
});

// --- 5.3 Nested null stripping after flatten ---

describe('nested null stripping after flatten', () => {
  it('nested field that is null in ALL rows → stripped after flattening', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      profile: { name: `user_${i}`, bio: null },
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('profile.name');
    // profile.bio is null in ALL rows → should be stripped after flatten
    expect(out).not.toContain('profile.bio');
  });
});

// --- 5.4 Key collision in flattening ---

describe('key collision in flattening', () => {
  it('dot-notation key collides with nested key → fallback to minified JSON', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      'id': i + 1,
      'a.b': 1,
      'a': { b: 2 },
      'note': 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    // Key collision means flatten returns null → nested data → fallback
    expect(out).not.toContain('## PSV');
  });
});

// --- 6.1 TOON format ---

describe('TOON format', () => {
  const toonSq = new Squeezer({ verbose: false, format: 'toon' });

  it('produces TOON header with count and keys', () => {
    const arr = makeArray(6);
    const result = toonSq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[0]).toBe('[6]{id,name,email,active}:');
  });

  it('correct row count (header + N data rows)', () => {
    const arr = makeArray(10);
    const result = toonSq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    // 1 header + 10 data rows
    expect(lines).toHaveLength(11);
  });

  it('row values are comma-separated with 2-space indent', () => {
    const arr = makeArray(6);
    const result = toonSq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toBe('  1,user_1,user1@example.com,true');
  });

  it('null values → null literal', () => {
    const noStrip = new Squeezer({ verbose: false, format: 'toon', stripEmpty: false });
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: null,
      email: `user${i}@example.com`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = noStrip.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toBe('  1,null,user0@example.com,padding text to exceed the byte threshold easily');
  });

  it('empty string → quoted ""', () => {
    const noStrip = new Squeezer({ verbose: false, format: 'toon', stripEmpty: false });
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: '',
      email: `user${i}@example.com`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = noStrip.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toContain('"",user0@example.com');
  });

  it('values containing comma → quoted', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `last, first_${i}`,
      email: `user${i}@example.com`,
      note: 'padding to exceed threshold value',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toContain('"last, first_0"');
  });

  it('boolean and number values → unquoted', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      active: i % 2 === 0,
      score: i * 10,
      name: `user_${i}`,
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toBe('  1,true,0,user_0');
    expect(lines[2]).toBe('  2,false,10,user_1');
  });

  it('string that looks like number → quoted (§7.2)', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      code: `${(i + 1) * 100}`,
      name: `user_${i}`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    // "100" matches numeric pattern → must be quoted
    expect(lines[1]).toContain('"100"');
  });

  it('string "true"/"false"/"null" → quoted to avoid ambiguity', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      val: i === 0 ? 'true' : i === 1 ? 'false' : i === 2 ? 'null' : `user_${i}`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toContain('"true"');
    expect(lines[2]).toContain('"false"');
    expect(lines[3]).toContain('"null"');
  });

  it('newline in value → escaped as \\n', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      bio: 'line1\nline2',
      name: `user_${i}`,
      email: `user${i}@example.com`,
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    // Newlines must be escaped, so total lines = header + data rows only
    const lines = out.split('\n');
    expect(lines).toHaveLength(11);
    expect(lines[1]).toContain('line1\\nline2');
  });

  it('same data: default → PSV, format=toon → TOON', () => {
    const arr = makeArray(6);
    const psvResult = sq.process(rpc(arr));
    const toonResult = toonSq.process(rpc(arr));
    const psvOut = JSON.parse(psvResult).result.content[0].text;
    const toonOut = JSON.parse(toonResult).result.content[0].text;
    expect(psvOut).toContain('## PSV');
    expect(toonOut).toContain('{id,name,email,active}:');
    expect(toonOut).not.toContain('## PSV');
  });

  it('values with double quotes → escaped', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `say "hello"_${i}`,
      email: `user${i}@example.com`,
      note: 'padding to exceed threshold value',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toContain('"say \\"hello\\"_0"');
  });

  it('values with backslash → escaped', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `path\\to\\file_${i}`,
      email: `user${i}@example.com`,
      note: 'padding to exceed threshold value',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toContain('"path\\\\to\\\\file_0"');
  });

  it('TOON + flatten (nested objects with dot-notation keys)', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      address: { city: 'Kyiv', zip: '01001' },
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('{id,name,address.city,address.zip}:');
    expect(out).toContain('Kyiv');
    expect(out).toContain('01001');
  });

  it('TOON + stripEmpty (all-null column removed)', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      deleted_at: null,
      name: `user_${i}`,
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('deleted_at');
    expect(out).toContain('{id,name,note}:');
  });

  it('10-row stable snapshot', () => {
    const arr = makeArray(10);
    const result = toonSq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toMatchInlineSnapshot(`
      "[10]{id,name,email,active}:
        1,user_1,user1@example.com,true
        2,user_2,user2@example.com,true
        3,user_3,user3@example.com,true
        4,user_4,user4@example.com,true
        5,user_5,user5@example.com,true
        6,user_6,user6@example.com,true
        7,user_7,user7@example.com,true
        8,user_8,user8@example.com,true
        9,user_9,user9@example.com,true
        10,user_10,user10@example.com,true"
    `);
  });

  // --- TOON spec compliance (https://github.com/toon-format/spec) ---

  it('§2: Infinity/NaN → null, -0 → 0 (via packData)', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      val: [Infinity, -Infinity, NaN, -0, 0, 42][i],
      label: `item_${i}`,
      note: 'padding to exceed threshold value for toon',
    }));
    const out = toonSq.packData(data);
    const lines = out.split('\n');
    expect(lines[1]).toBe('  1,null,item_0,padding to exceed threshold value for toon'); // Infinity → null
    expect(lines[2]).toBe('  2,null,item_1,padding to exceed threshold value for toon'); // -Infinity → null
    expect(lines[3]).toBe('  3,null,item_2,padding to exceed threshold value for toon'); // NaN → null
    expect(lines[4]).toBe('  4,0,item_3,padding to exceed threshold value for toon'); // -0 → 0
  });

  it('§2: canonical numbers — no exponent notation (via packData)', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      val: [1e6, 1e-6, -3.14, 1.5, 100, 0.1][i],
      label: `item_${i}`,
      note: 'padding to exceed threshold value for toon',
    }));
    const out = toonSq.packData(data);
    const lines = out.split('\n');
    expect(lines[1]).toContain(',1000000,'); // 1e6 → 1000000
    expect(lines[2]).toContain(',0.000001,'); // 1e-6 → 0.000001
    expect(lines[3]).toContain(',-3.14,');
    expect(lines[4]).toContain(',1.5,');
  });

  it('§7.2: strings starting with "-" → quoted', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      val: ['-', '-foo', '--bar', 'normal', '-123abc', 'ok'][i],
      note: 'padding to exceed threshold value for toon',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toContain('"-"');
    expect(lines[2]).toContain('"-foo"');
    expect(lines[3]).toContain('"--bar"');
    expect(lines[4]).not.toContain('"normal"');
    expect(lines[5]).toContain('"-123abc"');
  });

  it('§7.2: numeric-looking strings → quoted, non-numeric → unquoted', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      val: ['42', '3.14', '1e6', '05', '+42', '.5'][i],
      note: 'padding to exceed threshold value for toon',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const lines = out.split('\n');
    expect(lines[1]).toContain('"42"'); // matches number pattern → quoted
    expect(lines[2]).toContain('"3.14"'); // matches number pattern → quoted
    expect(lines[3]).toContain('"1e6"'); // matches number pattern → quoted
    expect(lines[4]).toContain('"05"'); // leading-zero → quoted
    expect(lines[5]).toContain(',+42,'); // +42 doesn't match → unquoted
    expect(lines[6]).toContain(',.5,'); // .5 doesn't match → unquoted
  });

  it('§7.3: keys not matching unquoted-key pattern → fallback to JSON', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      'valid_key': i + 1,
      'key with space': `val_${i}`,
      'note': 'padding to exceed threshold value for toon',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    // Should NOT be TOON since key contains space — falls back to JSON
    expect(out).not.toMatch(/^\[.*\]\{/);
  });
});

// --- 7.1 Structured text parsing ---

describe('structured text parsing', () => {
  it('Context7-style text with 5+ sections → PSV', () => {
    const text = makeStructuredText(6);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('Title');
    expect(out).toContain('Library_1');
  });

  it('fewer than 3 sections → unchanged', () => {
    const text = makeStructuredText(2);
    const line = rpc(text);
    const result = sq.process(line);
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
    expect(out).toBe(text);
  });

  it('structured text with markdown format', () => {
    const mdSq = new Squeezer({ format: 'md' });
    const text = makeStructuredText(6);
    const result = mdSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('|---|');
    expect(out).toContain('Library_1');
  });

  it('structured text with TOON format falls back when keys have spaces', () => {
    const toonSq = new Squeezer({ format: 'toon' });
    const text = makeStructuredText(6);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    // "Code Snippets" key has a space → invalid unquoted TOON key (§7.3) → fallback to JSON
    expect(out).not.toContain('{Title');
    expect(out).toContain('Library_1');
  });

  it('values containing colons (URLs) → correctly parsed', () => {
    const sections = Array.from({ length: 6 }, (_, i) => [
      `- Name: item_with_a_longer_name_${i + 1}`,
      `- URL: https://example.com/very/long/path/to/resource/${i + 1}`,
      '- Status: active',
      `- Description: This is a longer description to exceed the byte threshold for item ${i + 1}`,
    ].join('\n'));
    const text = sections.join('\n----------\n');
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('https://example.com/very/long/path/to/resource/1');
  });

  it('inconsistent keys across sections → uses intersection', () => {
    const sections = Array.from({ length: 6 }, (_, i) => {
      const lines = [
        `- Name: item_with_a_longer_name_for_testing_${i + 1}`,
        `- Score: ${i * 10}`,
        '- Description: Padding text to make this section long enough to exceed the minimum byte threshold',
      ];
      if (i % 2 === 0) lines.push(`- Extra: bonus_${i}`);
      return lines.join('\n');
    });
    const text = sections.join('\n----------\n');
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('Name');
    expect(out).toContain('Score');
    expect(out).toContain('Description');
    expect(out).not.toContain('Extra');
  });

  it('fewer than 2 common keys → unchanged', () => {
    const sections = Array.from({ length: 6 }, (_, i) => {
      return `- Key${i}: value_${i}\n- Other${i}: data_${i}`;
    });
    const text = sections.join('\n----------\n');
    const line = rpc(text);
    const result = sq.process(line);
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
  });

  it('disabled via parseText: false', () => {
    const noParseText = new Squeezer({ parseText: false });
    const text = makeStructuredText(6);
    const line = rpc(text);
    const result = noParseText.process(line);
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
    expect(out).toBe(text);
  });

  it('valid JSON text → takes JSON path, not structured text', () => {
    const arr = makeArray(10);
    const result = sq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('id,name,email,active');
  });

  it('text shorter than MIN_CHARS → not attempted', () => {
    const text = '- Title: A\n- ID: B\n----------\n- Title: C\n- ID: D';
    expect(text.length).toBeLessThan(512);
    const line = rpc(text);
    expect(sq.process(line)).toBe(line);
  });
});

describe('parseText: false via packText()', () => {
  it('structured text with parseText: false is NOT converted to tabular format', () => {
    const noParseText = new Squeezer({ parseText: false });
    const text = makeStructuredText(6);
    const result = noParseText.packText(text);
    expect(result).not.toContain('## PSV');
    expect(result).not.toContain('|---|');
    expect(result).toBe(text);
  });

  it('structured text with parseText: true (default) IS converted', () => {
    const withParseText = new Squeezer({ parseText: true });
    const text = makeStructuredText(6);
    const result = withParseText.packText(text);
    expect(result).toContain('## PSV');
  });
});

// --- 7.2 Universal text parsing (combinatorial separators × patterns) ---

describe('blank-line separated Key: Value text', () => {
  it('5+ sections with Key: Value → PSV', () => {
    const text = makeKeyValueText(6);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('Library_1');
  });

  it('fewer than 3 sections → unchanged', () => {
    const text = makeKeyValueText(2);
    const line = rpc(text);
    const result = sq.process(line);
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
  });

  it('Key: Value with TOON format', () => {
    const toonSq = new Squeezer({ format: 'toon' });
    const text = makeKeyValueText(6);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('{Name,Version,Description,Downloads,License}:');
  });
});

describe('markdown bold **Key**: Value text', () => {
  it('5+ sections → PSV', () => {
    const text = makeBoldKeyValueText(6);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('Library_1');
  });

  it('markdown bold with md format', () => {
    const mdSq = new Squeezer({ format: 'md' });
    const text = makeBoldKeyValueText(6);
    const result = mdSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('|---|');
    expect(out).toContain('Library_1');
  });
});

describe('markdown-header separated text', () => {
  it('5+ sections with ## headers → PSV', () => {
    const text = makeHeaderSeparatedText(6);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('Library_1');
  });
});

describe('density guard', () => {
  it('prose with occasional colons → not parsed as structured text', () => {
    const sections = Array.from({ length: 6 }, (_, i) => [
      `This is paragraph ${i + 1} about something interesting.`,
      'It has some text with a colon: but it is not structured.',
      'More prose follows here without any key-value pattern.',
      'And even more text to make the section substantial enough.',
      `Final line: concluding thoughts on topic ${i + 1}.`,
    ].join('\n'));
    const text = sections.join('\n\n');
    const line = rpc(text);
    const result = sq.process(line);
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
  });

  it('high density sections pass (4/5 = 80%)', () => {
    const sections = Array.from({ length: 6 }, (_, i) => [
      `Intro text for item ${i + 1}`,
      `Name: Library_${i + 1}`,
      `Version: ${i + 1}.0.0`,
      `Description: A library for doing thing ${i + 1} with padding text`,
      'License: MIT',
    ].join('\n'));
    const text = sections.join('\n\n');
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
  });
});

describe('combinatorial scoring', () => {
  it('picks strategy with highest score (records × keys)', () => {
    // Context7 format uses dash separator + bullet KV — should still work
    const text = makeStructuredText(8);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
  });
});

// --- 7.2.1 Edge cases ---

describe('text parsing edge cases', () => {
  it('density exactly 60% (3/5 lines) → passes', () => {
    const sections = Array.from({ length: 6 }, (_, i) => [
      `Heading for item ${i + 1}`,
      'Subheading for context',
      `Name: Library_${i + 1}`,
      `Version: ${i + 1}.0.0`,
      'License: MIT',
    ].join('\n'));
    const text = sections.join('\n\n');
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
  });

  it('density below 60% (2/5 lines) → not parsed', () => {
    const sections = Array.from({ length: 6 }, (_, i) => [
      `Heading for item ${i + 1}`,
      'Some prose about the topic.',
      'More context and background.',
      `Name: Library_${i + 1}`,
      `Version: ${i + 1}.0.0`,
    ].join('\n'));
    const text = sections.join('\n\n');
    const line = rpc(text);
    const result = sq.process(line);
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
  });

  it('values with colons (timestamps) → key is first part only', () => {
    const sections = Array.from({ length: 6 }, (_, i) => [
      `- Name: item_${i + 1}`,
      '- Time: 12:30:45',
      '- Status: active',
      '- Note: Important: do not remove this item from the list',
    ].join('\n'));
    const text = sections.join('\n----------\n');
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('12:30:45');
    expect(out).toContain('Important: do not remove this item from the list');
  });

  it('sections with URLs → URL preserved in value', () => {
    const sections = Array.from({ length: 6 }, (_, i) => [
      `- Name: project_${i + 1}`,
      `- URL: https://example.com/path/to/resource/${i + 1}`,
      `- Stars: ${(i + 1) * 100}`,
      `- Description: A project about something interesting number ${i + 1}`,
    ].join('\n'));
    const text = sections.join('\n----------\n');
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('## PSV');
    expect(out).toContain('https://example.com/path/to/resource/1');
  });

  it('header-separated text with fewer than 5 sections → unchanged', () => {
    const text = makeHeaderSeparatedText(3);
    const line = rpc(text);
    const result = sq.process(line);
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
  });

  it('header-separated text with TOON format', () => {
    const toonSq = new Squeezer({ format: 'toon' });
    const text = makeHeaderSeparatedText(6);
    const result = toonSq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).toContain('{');
    expect(out).toContain('Library_1');
  });

  it('bold pattern requires colon (**Key** Value without colon → not matched)', () => {
    const sections = Array.from({ length: 6 }, (_, i) => [
      `**Name** Library_${i + 1}`,
      `**Version** ${i + 1}.0.0`,
      `**Description** A library for doing thing ${i + 1} with padding`,
      '**License** MIT',
    ].join('\n'));
    const text = sections.join('\n\n');
    const line = rpc(text);
    const result = sq.process(line);
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    // Without colon, bold pattern should NOT match
    expect(out).not.toContain('## PSV');
  });
});

// --- 7.3 Content wrapper compression ---

describe('content wrapper compression', () => {
  it('single text block with unwrapContent: true → content becomes string', () => {
    const unwrap = new Squeezer({ unwrapContent: true });
    const line = rpc('Hello world');
    const result = unwrap.process(line);
    const parsed = JSON.parse(result);
    expect(parsed.result.content).toBe('Hello world');
  });

  it('single text block with unwrapContent: false → content stays array', () => {
    const line = rpc('Hello world');
    const result = sq.process(line);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.result.content)).toBe(true);
  });

  it('multiple text blocks with unwrapContent: true → content stays array', () => {
    const unwrap = new Squeezer({ unwrapContent: true });
    const line = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
      },
    });
    const result = unwrap.process(line);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.result.content)).toBe(true);
  });

  it('non-text content type with unwrapContent: true → content stays array', () => {
    const unwrap = new Squeezer({ unwrapContent: true });
    const line = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'image', data: 'base64...' }] },
    });
    const result = unwrap.process(line);
    expect(result).toBe(line);
  });

  it('unwrap + optimization combined', () => {
    const unwrap = new Squeezer({ unwrapContent: true });
    const arr = makeArray(10);
    const result = unwrap.process(rpc(arr));
    const parsed = JSON.parse(result);
    expect(typeof parsed.result.content).toBe('string');
    expect(parsed.result.content).toContain('## PSV');
  });
});
