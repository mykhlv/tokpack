import { describe, it, expect, vi } from 'vitest';
import { createMcpLineProcessor, createPipeLineProcessor } from '../src/stream.js';
import { MAX_LINE_LENGTH, type ResolvedOptions } from '../src/cli.js';
import { rpc, makeArray } from './helpers.js';

function defaultOpts(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    disabled: false,
    verbose: false,
    format: 'psv',
    stripEmpty: true,
    flatten: true,
    parseText: true,
    unwrapContent: false,
    ...overrides,
  };
}

// --- createMcpLineProcessor ---

describe('createMcpLineProcessor', () => {
  it('processes a normal MCP JSON-RPC line', () => {
    const processor = createMcpLineProcessor(defaultOpts());
    const bigArray = makeArray(10);
    const line = rpc(bigArray);
    const result = processor(line);
    expect(result).not.toBe(line);
    // Should contain optimized output
    const parsed = JSON.parse(result);
    expect(parsed.result.content[0].text).toContain('## PSV');
  });

  it('returns empty line unchanged', () => {
    const processor = createMcpLineProcessor(defaultOpts());
    const result = processor('');
    expect(result).toBe('');
  });

  it('strips \\r from line endings', () => {
    const processor = createMcpLineProcessor(defaultOpts());
    const line = '{"jsonrpc":"2.0","id":1,"method":"test"}\r';
    const result = processor(line);
    // Should not contain trailing \r
    expect(result).not.toMatch(/\r$/);
  });

  it('skips lines exceeding MAX_LINE_LENGTH', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const processor = createMcpLineProcessor(defaultOpts({ verbose: true }));
    const longLine = 'x'.repeat(MAX_LINE_LENGTH + 1);
    const result = processor(longLine);
    expect(result).toBe(longLine);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('skip: line exceeds'),
    );
    stderrSpy.mockRestore();
  });

  it('passes through non-result lines unchanged', () => {
    const processor = createMcpLineProcessor(defaultOpts());
    const line = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';
    const result = processor(line);
    expect(result).toBe(line);
  });
});

// --- createPipeLineProcessor ---

describe('createPipeLineProcessor', () => {
  it('processes a normal JSON array line', () => {
    const processor = createPipeLineProcessor(defaultOpts());
    const data = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `user_${i + 1}`,
        email: `user${i + 1}@example.com`,
        active: true,
      })),
    );
    const result = processor(data);
    expect(result).toContain('## PSV');
  });

  it('returns empty line unchanged', () => {
    const processor = createPipeLineProcessor(defaultOpts());
    const result = processor('');
    expect(result).toBe('');
  });

  it('strips \\r from line endings', () => {
    const processor = createPipeLineProcessor(defaultOpts());
    const input = 'just some text\r';
    const result = processor(input);
    // Should process the line without the \r
    expect(result).not.toMatch(/\r$/);
  });

  it('passes through lines exceeding MAX_LINE_LENGTH', () => {
    const processor = createPipeLineProcessor(defaultOpts());
    const longLine = 'x'.repeat(MAX_LINE_LENGTH + 1);
    const result = processor(longLine);
    expect(result).toBe(longLine);
  });
});
