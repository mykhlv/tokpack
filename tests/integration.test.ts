import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

const SHIM = resolve('dist/index.js');
const MOCK = resolve('tests/fixtures/mock-server.mjs');

interface ShimResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runShim(
  env: Record<string, string> = {},
  childCmd = 'node',
  childArgs = [MOCK],
): { proc: ChildProcess; done: Promise<ShimResult> } {
  const proc = spawn('node', [SHIM, '--', childCmd, ...childArgs], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  proc.stdout!.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
  proc.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  const done = new Promise<ShimResult>((res) => {
    proc.on('exit', (code) => {
      res({
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
        code,
      });
    });
  });

  return { proc, done };
}

function send(proc: ChildProcess, cmd: object): void {
  proc.stdin!.write(JSON.stringify(cmd) + '\n');
}

const procs: ChildProcess[] = [];
const origRunShim = runShim;
// Wrap runShim to track processes for cleanup
const trackedRunShim: typeof runShim = (...args) => {
  const result = origRunShim(...args);
  procs.push(result.proc);
  return result;
};

afterEach(() => {
  for (const p of procs) {
    if (p.pid && !p.killed) {
      try { p.kill('SIGKILL'); } catch {}
    }
  }
  procs.length = 0;
});

// --- 5.2 End-to-end data flow ---

describe('end-to-end data flow', () => {
  it('big array → PSV output', async () => {
    const { proc, done } = trackedRunShim();
    send(proc, { cmd: 'big', id: 1 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stdout, code } = await done;
    const parsed = JSON.parse(stdout.trim());
    const text = parsed.result.content[0].text;
    expect(text).toContain('## PSV');
    expect(text).toContain('10 rows');
    expect(code).toBe(0);
  });

  it('small payload → pass-through', async () => {
    const { proc, done } = trackedRunShim();
    send(proc, { cmd: 'small', id: 2 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stdout } = await done;
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.result.content[0].text).toBe('{"ok":true}');
  });
});

// --- 5.3 Chunking test ---

describe('chunking', () => {
  it('chunked response reassembled and optimized', async () => {
    const { proc, done } = trackedRunShim();
    send(proc, { cmd: 'chunked', id: 3 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stdout } = await done;
    const parsed = JSON.parse(stdout.trim());
    const text = parsed.result.content[0].text;
    expect(text).toContain('## PSV');
    expect(text).toContain('10 rows');
  });
});

// --- 5.4 Signal propagation ---

describe('signal propagation', () => {
  it('SIGTERM forwarded to child, shim exits', async () => {
    const { proc, done } = trackedRunShim();
    // Give the child time to start
    await new Promise((r) => setTimeout(r, 200));
    proc.kill('SIGTERM');
    const { code } = await done;
    // Child killed by signal — shim may exit with null code or signal
    expect(code === null || code === 0 || code === 143).toBe(true);
  });
});

// --- 5.5 Exit code propagation ---

describe('exit code propagation', () => {
  it('child exit 127 → shim exit 127', async () => {
    const { proc, done } = trackedRunShim();
    send(proc, { cmd: 'exit', code: 127 });
    const { code } = await done;
    expect(code).toBe(127);
  });

  it('child exit 0 → shim exit 0', async () => {
    const { proc, done } = trackedRunShim();
    send(proc, { cmd: 'exit', code: 0 });
    const { code } = await done;
    expect(code).toBe(0);
  });
});

// --- 5.6 Stderr pass-through ---

describe('stderr pass-through', () => {
  it('child stderr appears on shim stderr', async () => {
    const { proc, done } = trackedRunShim();
    send(proc, { cmd: 'stderr', msg: 'hello from server' });
    send(proc, { cmd: 'exit', code: 0 });
    const { stderr } = await done;
    expect(stderr).toContain('hello from server');
  });
});

// --- 5.7 ENOENT handling ---

describe('ENOENT handling', () => {
  it('non-existent command → exit 127 + error', async () => {
    const { done } = trackedRunShim({}, 'nonexistent-command-xyz');
    const { code, stderr } = await done;
    expect(code).toBe(127);
    expect(stderr).toContain('[mcp-squeeze]');
  });
});

// --- 5.8 Bypass mode ---

describe('bypass mode', () => {
  it('MCP_SQUEEZE_DISABLED=1 → data unmodified', async () => {
    const { proc, done } = trackedRunShim({ MCP_SQUEEZE_DISABLED: '1' });
    send(proc, { cmd: 'big', id: 4 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stdout } = await done;
    const parsed = JSON.parse(stdout.trim());
    const text = parsed.result.content[0].text;
    // In bypass mode, the original pretty-printed JSON should pass through
    expect(text).not.toContain('## PSV');
    expect(text).toContain('"id": 1');
  });
});

// --- 5.9 CRLF line endings ---

describe('CRLF line endings', () => {
  it('\\r\\n stripped, data processed correctly', async () => {
    const { proc, done } = trackedRunShim();
    send(proc, { cmd: 'crlf', id: 5 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stdout } = await done;
    const parsed = JSON.parse(stdout.trim());
    const text = parsed.result.content[0].text;
    expect(text).toContain('## PSV');
  });
});

// --- 5.10 MAX_LINE_LENGTH bypass ---

describe('MAX_LINE_LENGTH bypass', () => {
  it('line >10MB passes through without optimization', async () => {
    const { proc, done } = trackedRunShim({ MCP_SQUEEZE_VERBOSE: '1' });
    send(proc, { cmd: 'huge', id: 6 });
    // Allow time for the 11MB write to flush through pipes
    await new Promise((r) => setTimeout(r, 1000));
    send(proc, { cmd: 'exit', code: 0 });
    const { stderr, code } = await done;
    // Verbose mode should log the skip
    expect(stderr).toContain('[mcp-squeeze] skip');
    expect(code).toBe(0);
  }, 30000);
});

// --- 5.11 Verbose mode ---

describe('verbose mode', () => {
  it('optimization stats on stderr with [mcp-squeeze] prefix', async () => {
    const { proc, done } = trackedRunShim({ MCP_SQUEEZE_VERBOSE: '1' });
    send(proc, { cmd: 'big', id: 7 });
    send(proc, { cmd: 'exit', code: 0 });
    const { stderr } = await done;
    expect(stderr).toContain('[mcp-squeeze]');
    expect(stderr).toContain('OPT');
    expect(stderr).toContain('tokens saved');
    // Verify format includes sizes and ratio: "1234B -> 567B (-55%)"
    expect(stderr).toMatch(/\d+B -> \d+B \(-\d+%\)/);
  });
});

// --- 5.12 Stdout drain before exit ---

describe('stdout drain before exit', () => {
  it('all data received before shim exits', async () => {
    const { proc, done } = trackedRunShim();
    // Send multiple responses then immediately exit
    for (let i = 1; i <= 5; i++) {
      send(proc, { cmd: 'big', id: i });
    }
    send(proc, { cmd: 'exit', code: 0 });
    const { stdout } = await done;
    // Should have 5 separate JSON-RPC lines
    const lines = stdout.trim().split('\n');
    expect(lines).toHaveLength(5);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.result.content[0].text).toContain('## PSV');
    }
  });
});
