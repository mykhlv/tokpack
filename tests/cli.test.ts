import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from '../src/cli.js';
import { SHIM } from './helpers.js';

// Helper to build argv array (simulates process.argv = ['node', 'tokpack', ...args])
function argv(...args: string[]): string[] {
  return ['node', 'tokpack', ...args];
}

// --- parseArgs unit tests ---

describe('parseArgs', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    // Default: simulate non-TTY (pipe mode)
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, writable: true, configurable: true });
  });

  describe('basic flags', () => {
    it('--verbose sets verbose: true', () => {
      const { opts } = parseArgs(argv('--verbose'));
      expect(opts.verbose).toBe(true);
    });

    it('-v sets verbose: true', () => {
      const { opts } = parseArgs(argv('-v'));
      expect(opts.verbose).toBe(true);
    });

    it('--no-strip sets stripEmpty: false', () => {
      const { opts } = parseArgs(argv('--no-strip'));
      expect(opts.stripEmpty).toBe(false);
    });

    it('--no-flatten sets flatten: false', () => {
      const { opts } = parseArgs(argv('--no-flatten'));
      expect(opts.flatten).toBe(false);
    });

    it('--no-parse-text sets parseText: false', () => {
      const { opts } = parseArgs(argv('--no-parse-text'));
      expect(opts.parseText).toBe(false);
    });

    it('--unwrap sets unwrapContent: true', () => {
      const { opts } = parseArgs(argv('--unwrap'));
      expect(opts.unwrapContent).toBe(true);
    });

    it('--disabled sets disabled: true', () => {
      const { opts } = parseArgs(argv('--disabled'));
      expect(opts.disabled).toBe(true);
    });

    it('--no-parse-python sets parsePython: false', () => {
      const { opts } = parseArgs(argv('--no-parse-python'));
      expect(opts.parsePython).toBe(false);
    });

    it('defaults are correct when no flags provided', () => {
      const { opts } = parseArgs(argv());
      expect(opts.verbose).toBe(false);
      expect(opts.disabled).toBe(false);
      expect(opts.format).toBe('auto');
      expect(opts.stripEmpty).toBe(true);
      expect(opts.flatten).toBe(true);
      expect(opts.parseText).toBe(true);
      expect(opts.parsePython).toBe(true);
      expect(opts.unwrapContent).toBe(false);
    });
  });

  describe('--format flag', () => {
    it('--format psv sets format to psv', () => {
      const { opts } = parseArgs(argv('--format', 'psv'));
      expect(opts.format).toBe('psv');
    });

    it('--format md sets format to md', () => {
      const { opts } = parseArgs(argv('--format', 'md'));
      expect(opts.format).toBe('md');
    });

    it('--format toon sets format to toon', () => {
      const { opts } = parseArgs(argv('--format', 'toon'));
      expect(opts.format).toBe('toon');
    });

    it('--format auto sets format to auto', () => {
      const { opts } = parseArgs(argv('--format', 'auto'));
      expect(opts.format).toBe('auto');
    });

    it('--format without value does not eat the next flag', () => {
      const { opts } = parseArgs(argv('--format', '--verbose'));
      expect(opts.format).toBe('auto'); // fallback, not "--verbose"
      expect(opts.verbose).toBe(true); // --verbose should still work
    });

    it('--format with unknown value falls back to auto', () => {
      // Suppress stderr warning
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const { opts } = parseArgs(argv('--format', 'xml'));
      expect(opts.format).toBe('auto');
      stderrSpy.mockRestore();
    });
  });

  describe('-- separator handling', () => {
    it('splits args at -- separator', () => {
      const parsed = parseArgs(argv('--verbose', '--', 'node', 'server.js'));
      expect(parsed.ownArgs).toEqual(['--verbose']);
      expect(parsed.childArgs).toEqual(['node', 'server.js']);
      expect(parsed.hasChildCommand).toBe(true);
      expect(parsed.sepIndex).toBe(1);
    });

    it('no separator means no child args', () => {
      const parsed = parseArgs(argv('--verbose'));
      expect(parsed.childArgs).toEqual([]);
      expect(parsed.hasChildCommand).toBe(false);
      expect(parsed.sepIndex).toBe(-1);
    });

    it('-- without child command after it', () => {
      const parsed = parseArgs(argv('--verbose', '--'));
      expect(parsed.hasChildCommand).toBe(false);
      expect(parsed.childArgs).toEqual([]);
    });
  });

  describe('version and help flags', () => {
    it('-V is detected by hasFlag', () => {
      const { hasFlag } = parseArgs(argv('-V'));
      expect(hasFlag('--version', '-V')).toBe(true);
    });

    it('--version is detected by hasFlag', () => {
      const { hasFlag } = parseArgs(argv('--version'));
      expect(hasFlag('--version', '-V')).toBe(true);
    });

    it('-h is detected by hasFlag', () => {
      const { hasFlag } = parseArgs(argv('-h'));
      expect(hasFlag('--help', '-h')).toBe(true);
    });

    it('--help is detected by hasFlag', () => {
      const { hasFlag } = parseArgs(argv('--help'));
      expect(hasFlag('--help', '-h')).toBe(true);
    });
  });

  describe('MCP mode detection', () => {
    it('--mcp sets isMcpMode: true', () => {
      const { isMcpMode } = parseArgs(argv('--mcp', '--', 'node', 'server.js'));
      expect(isMcpMode).toBe(true);
    });

    it('without --mcp, isMcpMode is false', () => {
      const { isMcpMode } = parseArgs(argv('--', 'node', 'server.js'));
      expect(isMcpMode).toBe(false);
    });
  });
});

// --- CLI e2e tests for --bench and --wrap ---

function cli(args: string[], opts: { input?: string, env?: Record<string, string> } = {}): string {
  return execFileSync('node', [SHIM, ...args], {
    encoding: 'utf8',
    input: opts.input ?? '',
    env: { ...process.env, ...opts.env },
  });
}

describe('--bench command', () => {
  const testDir = join(tmpdir(), `tokpack-bench-test-${process.pid}`);
  const testFile = join(testDir, 'bench-data.jsonl');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    const data = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `user_${i + 1}`,
        email: `user${i + 1}@example.com`,
        active: true,
      })),
    );
    writeFileSync(testFile, data + '\n');
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true });
    } catch { /* ignore */ }
  });

  it('--bench with a JSON file outputs benchmark results', () => {
    const out = cli(['--bench', testFile]);
    expect(out).toContain('tokpack bench');
    expect(out).toContain('Lines:');
    expect(out).toMatch(/PSV\s+:/);
    expect(out).toMatch(/MD\s+:/);
    expect(out).toMatch(/TOON\s+:/);
  });
});

describe('--wrap command', () => {
  it('--wrap outputs valid JSON config snippet', () => {
    const out = cli(['--wrap', 'npx', '-y', '@org/my-mcp']);
    expect(out).toContain('"mcpServers"');
    // Extract the JSON part after "mcpServers":
    const jsonMatch = out.match(/"mcpServers":\s*(\{[\s\S]*\})/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1]);
    expect(parsed).toBeDefined();
    // Should contain the server name key
    const keys = Object.keys(parsed);
    expect(keys.length).toBe(1);
    // The config should reference tokpack --mcp
    const serverConfig = parsed[keys[0]];
    expect(serverConfig.args).toContain('--mcp');
    expect(serverConfig.args).toContain('--');
  });
});
