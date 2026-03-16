import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Squeezer } from '../src/squeezer.js';
import { SHIM, rpc, makeArray, send, createShimRunner, killAll } from './helpers.js';

// --- Squeezer smoke ---

describe('squeezer smoke', () => {
  const sq = new Squeezer({});

  it('non-JSON line passes through unchanged', () => {
    expect(sq.process('hello')).toBe('hello');
  });

  it('small payload passes through unchanged', () => {
    const line = rpc('{"ok":true}');
    expect(sq.process(line)).toBe(line);
  });

  it('large flat array → PSV', () => {
    const result = sq.process(rpc(makeArray(10)));
    const parsed = JSON.parse(result);
    const text = parsed.result.content[0].text;
    expect(text).toContain('## PSV');
    expect(text).toContain('10 rows');
  });

  it('nested data → flattened to PSV', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      meta: { nested: true },
    }));
    const result = sq.process(rpc(JSON.stringify(data, null, 2)));
    const parsed = JSON.parse(result);
    const text = parsed.result.content[0].text;
    expect(text).toContain('## PSV');
    expect(text).toContain('meta.nested');
  });

  it('broken JSON in text field → unchanged', () => {
    const line = rpc('{not valid json!!!');
    expect(sq.process(line)).toBe(line);
  });

  it('error never throws — returns original line', () => {
    const garbage = '{bad json that starts with brace';
    expect(sq.process(garbage)).toBe(garbage);
  });

  it('small array (≤5 items) → minified JSON, not PSV', () => {
    const data = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      name: `user_with_long_name_${i}`,
      email: `user_with_long_email_${i}@example-domain.com`,
      bio: `A longer biography text for padding purposes number ${i}`,
    }));
    const text = JSON.stringify(data, null, 2);
    expect(text.length).toBeGreaterThanOrEqual(512);
    const result = sq.process(rpc(text));
    const parsed = JSON.parse(result);
    const out = parsed.result.content[0].text;
    expect(out).not.toContain('## PSV');
    expect(out).not.toContain('\n');
    expect(out).toBe(JSON.stringify(data));
  });

  it('non-text content type → passthrough', () => {
    const line = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'image', data: 'base64...' }] },
    });
    expect(sq.process(line)).toBe(line);
  });
});

// --- CLI smoke ---

describe('CLI smoke', () => {
  const procs: ChildProcess[] = [];
  const sh = createShimRunner(procs);

  afterEach(() => killAll(procs));

  it('dist/index.js exists after build', () => {
    expect(existsSync(SHIM)).toBe(true);
  });

  it('--version prints version and exits 0', () => {
    const out = execFileSync('node', [SHIM, '--version'], {
      encoding: 'utf8',
    });
    expect(out).toMatch(/^mcp-squeeze v\d+\.\d+\.\d+/);
  });

  it('-V prints version and exits 0', () => {
    const out = execFileSync('node', [SHIM, '-V'], { encoding: 'utf8' });
    expect(out).toMatch(/^mcp-squeeze v\d+\.\d+\.\d+/);
  });

  it('no arguments → usage message + exit 2', () => {
    try {
      execFileSync('node', [SHIM], { encoding: 'utf8', stdio: 'pipe' });
      expect.unreachable('should have exited with code 2');
    } catch (err: unknown) {
      const e = err as { status: number, stderr: string };
      expect(e.status).toBe(2);
      expect(e.stderr).toContain('Usage:');
    }
  });

  it('-- without command → usage message + exit 2', () => {
    try {
      execFileSync('node', [SHIM, '--'], { encoding: 'utf8', stdio: 'pipe' });
      expect.unreachable('should have exited with code 2');
    } catch (err: unknown) {
      const e = err as { status: number, stderr: string };
      expect(e.status).toBe(2);
    }
  });

  it('round-trip: stdin → mock server → optimized stdout', async () => {
    const { proc, done } = sh();
    send(proc, { cmd: 'big', id: 1 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stdout } = await done;
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.result.content[0].text).toContain('## PSV');
  });

  it('small payload passthrough', async () => {
    const { proc, done } = sh();
    send(proc, { cmd: 'small', id: 1 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stdout } = await done;
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.result.content[0].text).toBe('{"ok":true}');
  });

  it('child exit code propagated', async () => {
    const { proc, done } = sh();
    send(proc, { cmd: 'exit', code: 42 });
    const { code } = await done;
    expect(code).toBe(42);
  });

  it('nonexistent command → exit 127', async () => {
    const { done } = sh({}, 'nonexistent-cmd-xyz');
    const { code, stderr } = await done;
    expect(code).toBe(127);
    expect(stderr).toContain('[mcp-squeeze]');
  });

  it('MCP_SQUEEZE_DISABLED=1 → bypass optimization', async () => {
    const { proc, done } = sh({ MCP_SQUEEZE_DISABLED: '1' });
    send(proc, { cmd: 'big', id: 1 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stdout } = await done;
    const parsed = JSON.parse(stdout.trim());
    const text = parsed.result.content[0].text;
    expect(text).not.toContain('## PSV');
    expect(text).toContain('"id": 1');
  });

  it('MCP_SQUEEZE_VERBOSE=1 → stats on stderr', async () => {
    const { proc, done } = sh({ MCP_SQUEEZE_VERBOSE: '1' });
    send(proc, { cmd: 'big', id: 1 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stderr } = await done;
    expect(stderr).toContain('[mcp-squeeze]');
    expect(stderr).toContain('OPT');
  });
});
