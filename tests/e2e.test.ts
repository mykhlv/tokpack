import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SHIM, makeArray } from './helpers.js';

const ROOT = resolve(SHIM, '../..');

// Helper: run the CLI with given args and optional stdin
function cli(args: string[], opts: { input?: string, env?: Record<string, string> } = {}): string {
  return execFileSync('node', [SHIM, ...args], {
    encoding: 'utf8',
    input: opts.input ?? '',
    env: { ...process.env, ...opts.env },
  });
}

// --- Shebang ---

describe('shebang', () => {
  it('dist/index.js starts with #!/usr/bin/env node', () => {
    const first = readFileSync(SHIM, 'utf8').split('\n')[0];
    expect(first).toBe('#!/usr/bin/env node');
  });
});

// --- CLI commands ---

describe('CLI commands', () => {
  it('--help prints usage and exits 0', () => {
    const out = cli(['--help']);
    expect(out).toContain('tokpack');
    expect(out).toMatch(/usage|options|--format/i);
  });

  it('-h prints usage and exits 0', () => {
    const out = cli(['-h']);
    expect(out).toContain('tokpack');
    expect(out).toMatch(/usage|options|--format/i);
  });

  it('--formats shows format examples and exits 0', () => {
    const out = cli(['--formats']);
    expect(out).toContain('PSV');
    expect(out).toContain('MD');
    expect(out).toContain('TOON');
  });

  it('--config shows configuration and exits 0', () => {
    const out = cli(['--config']);
    expect(out).toMatch(/format|strip|flatten/i);
  });

  describe('--stats', () => {
    const testDir = join(tmpdir(), `tokpack-e2e-stats-${process.pid}`);
    const testStatsFile = join(testDir, 'stats.log');

    beforeEach(() => {
      mkdirSync(testDir, { recursive: true });
      try {
        rmSync(testStatsFile);
      } catch { /* ignore */ }
    });

    afterEach(() => {
      try {
        rmSync(testDir, { recursive: true });
      } catch { /* ignore */ }
    });

    it('--stats with empty log shows no stats message', () => {
      const out = cli(['--stats'], { env: { TOKPACK_STATS_PATH: testStatsFile } });
      expect(out).toContain('No stats');
    });

    it('--stats shows summary when data exists', () => {
      writeFileSync(testStatsFile, `${Date.now()},10000,4000\n${Date.now()},20000,8000\n`);
      const out = cli(['--stats'], { env: { TOKPACK_STATS_PATH: testStatsFile } });
      expect(out).toContain('Optimizations: 2');
      expect(out).toContain('tokens');
    });

    it('--stats --reset clears the stats', () => {
      writeFileSync(testStatsFile, `${Date.now()},10000,4000\n`);
      const out = cli(['--stats', '--reset'], { env: { TOKPACK_STATS_PATH: testStatsFile } });
      expect(out).toMatch(/reset|deleted/i);
      // After reset, stats should be empty
      const after = cli(['--stats'], { env: { TOKPACK_STATS_PATH: testStatsFile } });
      expect(after).toContain('No stats');
    });
  });
});

// --- CLI pipe mode with formats ---

describe('CLI pipe mode', () => {
  // Pipe mode processes line-by-line, so input must be a single minified line
  const jsonInput = JSON.stringify(JSON.parse(makeArray(10)));

  it('default format (PSV) with JSON array input', () => {
    const out = cli([], { input: jsonInput });
    expect(out).toContain('## PSV');
    expect(out).toContain('10 rows');
  });

  it('--format md outputs markdown table', () => {
    const out = cli(['--format', 'md'], { input: jsonInput });
    expect(out).toContain('|---|');
    expect(out).toContain('| id |');
    expect(out).not.toContain('## PSV');
  });

  it('--format toon outputs TOON format', () => {
    const out = cli(['--format', 'toon'], { input: jsonInput });
    expect(out).toMatch(/^\[\d+\]\{/);
    expect(out).not.toContain('## PSV');
  });

  it('--no-strip disables null/empty column stripping', () => {
    const data = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `user_${i + 1}`,
        empty: null,
      })),
    );
    const withStrip = cli([], { input: data });
    const noStrip = cli(['--no-strip'], { input: data });
    // Without strip, "empty" column should be present
    expect(noStrip).toContain('empty');
    // With strip (default), "empty" column should be removed
    expect(withStrip).not.toContain('empty');
  });

  it('--no-flatten disables dot-notation flattening', () => {
    const data = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        meta: { nested: true },
      })),
    );
    const withFlatten = cli([], { input: data });
    const noFlatten = cli(['--no-flatten'], { input: data });
    expect(withFlatten).toContain('meta.nested');
    expect(noFlatten).not.toContain('meta.nested');
  });
});

// --- Library imports from dist/ ---

describe('library imports from dist/', () => {
  it('CJS: require dist/lib.cjs exports pack, packRaw, createPacker', () => {
    const out = execFileSync('node', ['-e',
      "const m = require('./dist/lib.cjs'); console.log(JSON.stringify(Object.keys(m).sort()))",
    ], { encoding: 'utf8', cwd: ROOT });
    const keys = JSON.parse(out.trim());
    expect(keys).toContain('pack');
    expect(keys).toContain('packRaw');
    expect(keys).toContain('createPacker');
  });

  it('CJS: pack() produces PSV for large array', () => {
    const out = execFileSync('node', ['-e', [
      "const { pack } = require('./dist/lib.cjs');",
      "const data = Array.from({ length: 10 }, (_, i) => ({ id: i+1, name: 'u'+i }));",
      'console.log(pack(data));',
    ].join(' ')], { encoding: 'utf8', cwd: ROOT });
    expect(out).toContain('## PSV');
  });

  it('ESM: import from dist/lib.mjs exports pack, packRaw, createPacker', () => {
    const libPath = join(ROOT, 'dist/lib.mjs');
    const out = execFileSync('node', ['--input-type=module', '-e',
      `import('file://${libPath}').then(m => console.log(JSON.stringify(Object.keys(m).sort())))`,
    ], { encoding: 'utf8', cwd: ROOT });
    const keys = JSON.parse(out.trim());
    expect(keys).toContain('pack');
    expect(keys).toContain('packRaw');
    expect(keys).toContain('createPacker');
  });

  it('ESM: pack() produces PSV for large array', () => {
    const libPath = join(ROOT, 'dist/lib.mjs');
    const out = execFileSync('node', ['--input-type=module', '-e', [
      `const m = await import('file://${libPath}');`,
      "const data = Array.from({ length: 10 }, (_, i) => ({ id: i+1, name: 'u'+i }));",
      'console.log(m.pack(data));',
    ].join(' ')], { encoding: 'utf8', cwd: ROOT });
    expect(out).toContain('## PSV');
  });
});
