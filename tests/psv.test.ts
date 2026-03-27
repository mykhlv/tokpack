import { describe, it, expect } from 'vitest';
import { Squeezer } from '../src/squeezer.js';
import { decodePSV } from './decode-psv.js';

const sq = new Squeezer({ format: 'psv' });

// MIN_CHARS=512, MIN_ITEMS=3 — tests need enough data to trigger compression.
const PAD = 'x'.repeat(80); // padding to push past byte threshold

// --- Helper: encode JSON array via Squeezer, return PSV string ---

function encode(data: Record<string, unknown>[]): string {
  const out = sq.packData(data);
  if (!out.startsWith('## PSV|')) {
    throw new Error(`Squeezer did not produce PSV (got ${out.slice(0, 60)}…). Data may be too small.`);
  }
  return out;
}

// --- Round-trip tests: encode → decode → compare ---

describe('PSV round-trip', () => {
  it('basic array', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i + 1}`,
      email: `user${i + 1}@example.com`,
      active: true,
    }));
    const psv = encode(data);
    const decoded = decodePSV(psv);
    expect(decoded).toHaveLength(10);
    // All values become strings after round-trip
    expect(decoded[0]).toEqual({
      id: '1',
      name: 'user_1',
      email: 'user1@example.com',
      active: 'true',
    });
  });

  it('values with pipes', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      value: `a|b_${i}`,
      pad: PAD,
    }));
    const psv = encode(data);
    const decoded = decodePSV(psv);
    expect(decoded[0].value).toBe('a|b_0');
  });

  it('values with backslashes', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      path: `path\\to\\file_${i}`,
      pad: PAD,
    }));
    const psv = encode(data);
    const decoded = decodePSV(psv);
    expect(decoded[0].path).toBe('path\\to\\file_0');
  });

  it('values with backslash immediately before pipe', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      tricky: `foo\\|bar_${i}`,
      pad: PAD,
    }));
    const psv = encode(data);
    const decoded = decodePSV(psv);
    expect(decoded[0].tricky).toBe('foo\\|bar_0');
  });

  it('values with newlines', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      text: `line1\nline2_${i}`,
      pad: PAD,
    }));
    const psv = encode(data);
    // Each row should still be a single line
    const lines = psv.split('\n');
    expect(lines).toHaveLength(11); // 1 header + 10 data
    const decoded = decodePSV(psv);
    expect(decoded[0].text).toBe('line1\nline2_0');
  });

  it('values with CRLF', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      text: `line1\r\nline2_${i}`,
      pad: PAD,
    }));
    const psv = encode(data);
    const decoded = decodePSV(psv);
    // Encoder normalizes \r\n → \n, so decoded value has \n only
    expect(decoded[0].text).toBe('line1\nline2_0');
  });

  it('unicode and emoji', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      emoji: `🎉✨_${i}`,
      cjk: `漢字_${i}`,
      pad: PAD,
    }));
    const psv = encode(data);
    const decoded = decodePSV(psv);
    expect(decoded[0].emoji).toBe('🎉✨_0');
    expect(decoded[0].cjk).toBe('漢字_0');
  });

  it('null and undefined become empty strings', () => {
    const noStrip = new Squeezer({ format: 'psv', stripEmpty: false });
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      nullable: i === 0 ? null : `val_${i}`,
      missing: i === 0 ? undefined : `val_${i}`,
      pad: PAD,
    }));
    const psv = noStrip.packData(data);
    const decoded = decodePSV(psv);
    expect(decoded[0].nullable).toBe('');
    expect(decoded[0].missing).toBe('');
  });

  it('boolean and number type coercion', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      active: i % 2 === 0,
      score: i * 3.14,
      pad: PAD,
    }));
    const psv = encode(data);
    const decoded = decodePSV(psv);
    expect(decoded[0].active).toBe('true');
    expect(decoded[1].active).toBe('false');
    expect(decoded[0].score).toBe('0');
    expect(decoded[1].score).toBe('3.14');
  });

  it('combined special characters', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      messy: `a\\b|c\nd_${i}`,
      pad: PAD,
    }));
    const psv = encode(data);
    const decoded = decodePSV(psv);
    // Encoder: \ → \\, | → \|, \n → \n  → decoder reverses all
    expect(decoded[0].messy).toBe('a\\b|c\nd_0');
  });
});

// --- Decoder-only tests ---

describe('decodePSV', () => {
  it('decodes a minimal valid PSV', () => {
    const input = '## PSV|name\nAlice';
    const rows = decodePSV(input);
    expect(rows).toEqual([{ name: 'Alice' }]);
  });

  it('decodes header-only (zero rows)', () => {
    const rows = decodePSV('## PSV|a,b,c');
    expect(rows).toEqual([]);
  });

  it('throws on missing header magic', () => {
    expect(() => decodePSV('name,email\nAlice,a@b.com')).toThrow('## PSV|');
  });

  it('throws on empty input', () => {
    expect(() => decodePSV('')).toThrow('## PSV|');
  });

  it('throws on wrong column count', () => {
    const input = '## PSV|a,b,c\n1|2';
    expect(() => decodePSV(input)).toThrow('3 columns');
  });

  it('unescapes all four escape sequences', () => {
    // \| → |, \\ → \, \n → newline, \r → CR
    const input = '## PSV|val\na\\|b\\\\c\\nd\\re';
    const rows = decodePSV(input);
    expect(rows[0].val).toBe('a|b\\c\nd\re');
  });

  it('handles double backslash before pipe as column delimiter', () => {
    // \\| means: escaped backslash + column delimiter
    const input = '## PSV|a,b\nfoo\\\\|bar';
    const rows = decodePSV(input);
    expect(rows[0].a).toBe('foo\\');
    expect(rows[0].b).toBe('bar');
  });

  it('skips trailing empty line', () => {
    const input = '## PSV|x\n1\n2\n';
    const rows = decodePSV(input);
    expect(rows).toHaveLength(2);
  });

  it('preserves empty values', () => {
    const input = '## PSV|a,b,c\n||';
    const rows = decodePSV(input);
    expect(rows[0]).toEqual({ a: '', b: '', c: '' });
  });
});
