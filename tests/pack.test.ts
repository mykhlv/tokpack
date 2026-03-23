import { describe, it, expect } from 'vitest';
import { pack, packRaw, createPacker } from '../src/pack.js';
import { makeArray, makeStructuredText, makeKeyValueText } from './helpers.js';

// --- pack() ---

describe('pack()', () => {
  it('array of objects → PSV', () => {
    const data = JSON.parse(makeArray(10));
    const result = pack(data);
    expect(result).toContain('## PSV');
  });

  it('small array returns minified JSON', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = pack(data);
    expect(result).toBe('[{"id":1},{"id":2}]');
  });

  it('non-array returns JSON', () => {
    const result = pack({ name: 'test' });
    expect(result).toBe('{"name":"test"}');
  });

  it('null/undefined returns JSON', () => {
    expect(pack(null)).toBe('null');
    expect(pack(undefined)).toBe('undefined');
  });

  it('circular reference returns string fallback', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = pack(obj);
    expect(result).toBe('[object Object]');
  });

  it('createPacker().pack() matches pack() for undefined', () => {
    const packer = createPacker();
    expect(packer.pack(undefined)).toBe(pack(undefined));
  });

  it('format option: md', () => {
    const data = JSON.parse(makeArray(10));
    const result = pack(data, { format: 'md' });
    expect(result).toContain('|---|');
    expect(result).not.toContain('## PSV');
  });

  it('format option: toon', () => {
    const data = JSON.parse(makeArray(10));
    const result = pack(data, { format: 'toon' });
    expect(result).toContain('{id,name,email,active}:');
    expect(result).not.toContain('## PSV');
  });

  it('format option: auto picks shortest output', () => {
    const data = JSON.parse(makeArray(10));
    const auto = pack(data, { format: 'auto' });
    const psv = pack(data, { format: 'psv' });
    const md = pack(data, { format: 'md' });
    const toon = pack(data, { format: 'toon' });
    const shortest = Math.min(psv.length, md.length, toon.length);
    expect(auto.length).toBe(shortest);
  });

  it('nested objects are flattened', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      meta: { nested: true },
    }));
    const result = pack(data);
    expect(result).toContain('meta.nested');
  });

  it('flatten: false disables flattening', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      meta: { nested: true },
    }));
    const result = pack(data, { flatten: false });
    // Without flattening, nested values cause non-uniform keys → fallback to JSON
    expect(result).not.toContain('meta.nested');
  });

  it('empty columns are stripped', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i + 1}`,
      empty: null,
    }));
    const result = pack(data);
    expect(result).toContain('## PSV');
    expect(result).not.toContain('empty');
  });

  it('stripEmpty: false keeps empty columns', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `user_${i + 1}`,
      empty: null,
    }));
    const result = pack(data, { stripEmpty: false });
    expect(result).toContain('empty');
  });
});

// --- packRaw() ---

describe('packRaw()', () => {
  it('JSON string → PSV', () => {
    const json = makeArray(10);
    const result = packRaw(json);
    expect(result).toContain('## PSV');
  });

  it('structured text (KV patterns) → PSV', () => {
    const text = makeStructuredText(6);
    const result = packRaw(text);
    expect(result).toContain('## PSV');
  });

  it('blank-line separated KV text → PSV', () => {
    const text = makeKeyValueText(6);
    const result = packRaw(text);
    expect(result).toContain('## PSV');
  });

  it('short text returns unchanged', () => {
    const text = 'hello world';
    expect(packRaw(text)).toBe(text);
  });

  it('non-structured text returns unchanged', () => {
    const text = 'A'.repeat(600) + '\nsome random prose without KV patterns';
    expect(packRaw(text)).toBe(text);
  });

  it('small JSON array returns minified', () => {
    const text = JSON.stringify([{ id: 1 }, { id: 2 }]);
    const result = packRaw(text);
    expect(result).toBe(text); // too short for MIN_CHARS
  });

  it('format option: toon', () => {
    const text = makeArray(10);
    const result = packRaw(text, { format: 'toon' });
    expect(result).toContain('{id,name,email,active}:');
  });

  it('pretty-printed non-array JSON → minified', () => {
    const obj = { name: 'test', value: 42, nested: { a: 1 } };
    const pretty = JSON.stringify(obj, null, 2);
    const result = packRaw(pretty);
    expect(result).toBe(JSON.stringify(obj));
  });

  it('already minified non-array JSON → unchanged', () => {
    const text = '{"name":"test","value":42}';
    expect(packRaw(text)).toBe(text);
  });
});

// --- createPacker() ---

describe('createPacker()', () => {
  it('reusable packer with fixed options', () => {
    const packer = createPacker({ format: 'toon' });
    const data = JSON.parse(makeArray(10));
    const result = packer.pack(data);
    expect(result).toContain('{id,name,email,active}:');
  });

  it('packRaw on packer instance', () => {
    const packer = createPacker({ format: 'md' });
    const text = makeArray(10);
    const result = packer.packRaw(text);
    expect(result).toContain('|---|');
  });
});
