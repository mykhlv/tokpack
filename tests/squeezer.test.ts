import { describe, it, expect } from 'vitest';
import { Squeezer } from '../src/squeezer.js';
import { rpc, makeArray } from './helpers.js';

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
  it('array with 4 items → minified JSON (not PSV)', () => {
    const data = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      name: `user_with_a_longer_name_${i}`,
      email: `user_with_longer_email_${i}@example-domain.com`,
      bio: `This is a longer biography text for testing purposes number ${i}`,
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
    expect(text).toContain('6 rows');
  });
});

// --- 3.3 Uniformity guard ---

describe('uniformity guard', () => {
  it('valid first 3 items, mismatched 4th → fallback to minified JSON', () => {
    // SAMPLE_SIZE=3 — first 3 pass uniformity check, but 4th has extra key
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
  it('header format: ## PSV|key1,key2,...|N rows', () => {
    const arr = makeArray(8);
    const result = sq.process(rpc(arr));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    const header = out.split('\n')[0];
    expect(header).toBe('## PSV|id,name,email,active|8 rows');
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
    const data = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      name: `user_with_a_longer_name_${i}`,
      email: `user_with_longer_email_${i}@example-domain.com`,
      bio: `This is a longer biography text for testing purposes number ${i}`,
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
    expect(lines[0]).toBe('## PSV|id,name,email,active|50 rows');
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
      "## PSV|id,name,email,active|10 rows
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
      bio: `line1\nline2`,
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
      id: i + 1,
      'a.b': 1,
      a: { b: 2 },
      note: 'padding text to exceed the byte threshold easily',
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    // Key collision means flatten returns null → nested data → fallback
    expect(out).not.toContain('## PSV');
  });
});
