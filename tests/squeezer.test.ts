import { describe, it, expect } from 'vitest';
import { Squeezer } from '../src/squeezer.js';

const sq = new Squeezer(false);

/** Wrap a text value into a JSON-RPC result line */
function rpc(text: string, id: number = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text }] },
  });
}

/** Generate a flat array of N objects as a JSON string */
function makeArray(n: number): string {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `user_${i + 1}`,
    email: `user${i + 1}@example.com`,
    active: true,
  }));
  return JSON.stringify(rows, null, 2);
}

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
  it('object in value → fallback to minified JSON', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      addr: { city: 'Kyiv' },
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
  });

  it('array in value → fallback to minified JSON', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      tags: ['a', 'b'],
    }));
    const text = JSON.stringify(data, null, 2);
    const result = sq.process(rpc(text));
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
    expect(out).toContain('path\\to\\file_0');
  });

  // Known limitation: value `foo\|bar` (literal backslash before pipe) becomes
  // `foo\\|bar` which is ambiguous on reverse parse. Acceptable for v1 —
  // LLM read-only consumption, not machine-to-machine.
});

// --- 3.6 Null handling ---

describe('null handling', () => {
  it('null → empty string', () => {
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
    // null should become empty between pipes
    const lines = out.split('\n');
    expect(lines[1]).toBe('1||user0@example.com|some text to ensure we exceed the byte threshold');
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
