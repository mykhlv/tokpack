import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

export const SHIM = resolve('dist/index.js');
export const MOCK = resolve('tests/fixtures/mock-server.mjs');

export interface ShimResult {
  stdout: string
  stderr: string
  code: number | null
}

/** Wrap a text value into a JSON-RPC result line */
export function rpc(text: string, id: number = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text }] },
  });
}

/** Generate a pretty-printed flat array of N objects */
export function makeArray(n: number): string {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: `user_${i + 1}`,
      email: `user${i + 1}@example.com`,
      active: true,
    })),
    null,
    2,
  );
}

/** Send a JSON command to the child's stdin */
export function send(proc: ChildProcess, cmd: object): void {
  proc.stdin!.write(JSON.stringify(cmd) + '\n');
}

/** Spawn the shim with a child command, collect stdout/stderr */
export function runShim(
  env: Record<string, string> = {},
  childCmd = 'node',
  childArgs = [MOCK],
): { proc: ChildProcess, done: Promise<ShimResult> } {
  const proc = spawn('node', [SHIM, '--', childCmd, ...childArgs], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdoutBuf: Buffer[] = [];
  const stderrBuf: Buffer[] = [];
  proc.stdout!.on('data', (d: Buffer) => stdoutBuf.push(d));
  proc.stderr!.on('data', (d: Buffer) => stderrBuf.push(d));

  const done = new Promise<ShimResult>((resolve) => {
    proc.on('exit', (code) => {
      resolve({
        stdout: Buffer.concat(stdoutBuf).toString(),
        stderr: Buffer.concat(stderrBuf).toString(),
        code,
      });
    });
  });

  return { proc, done };
}

/** Kill tracked processes — call from afterEach */
export function killAll(procs: ChildProcess[]): void {
  for (const p of procs) {
    if (p.pid && !p.killed) {
      try {
        p.kill('SIGKILL');
      } catch {}
    }
  }
  procs.length = 0;
}

/** Spawn shim, track process for cleanup, return result promise */
export function trackedRunShim(
  procs: ChildProcess[],
  env: Record<string, string> = {},
  childCmd = 'node',
  childArgs = [MOCK],
): { proc: ChildProcess, done: Promise<ShimResult> } {
  const result = runShim(env, childCmd, childArgs);
  procs.push(result.proc);
  return result;
}

/** Create a bound shim runner that auto-tracks processes for cleanup */
export function createShimRunner(procs: ChildProcess[]) {
  return (...args: Parameters<typeof trackedRunShim> extends [ChildProcess[], ...infer R] ? R : never) =>
    trackedRunShim(procs, ...args);
}
