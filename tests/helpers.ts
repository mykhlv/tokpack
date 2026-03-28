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

/** Generate Context7-style structured text with N sections */
export function makeStructuredText(n: number): string {
  const sections = Array.from({ length: n }, (_, i) => [
    `- Title: Library_${i + 1}`,
    `- ID: /org/lib-${i + 1}`,
    `- Description: A library for doing thing ${i + 1} with code`,
    `- Code Snippets: ${(i + 1) * 100}`,
    `- Score: ${(i + 1) * 10.5}`,
  ].join('\n'));
  return 'Available Libraries:\n\n' + sections.join('\n----------\n');
}

/** Send a JSON command to the child's stdin */
export function send(proc: ChildProcess, cmd: object): void {
  proc.stdin!.write(JSON.stringify(cmd) + '\n');
}

/** Generate blank-line-separated Key: Value text with N sections */
export function makeKeyValueText(n: number): string {
  return Array.from({ length: n }, (_, i) => [
    `Name: Library_${i + 1}`,
    `Version: ${i + 1}.0.0`,
    `Description: A library for doing thing ${i + 1} with code and more padding`,
    `Downloads: ${(i + 1) * 1000}`,
    'License: MIT',
  ].join('\n')).join('\n\n');
}

/** Generate markdown-bold **Key**: Value text with N sections */
export function makeBoldKeyValueText(n: number): string {
  return Array.from({ length: n }, (_, i) => [
    `**Name**: Library_${i + 1}`,
    `**Version**: ${i + 1}.0.0`,
    `**Description**: A library for doing thing ${i + 1} with code and padding`,
    `**Downloads**: ${(i + 1) * 1000}`,
    '**License**: MIT',
  ].join('\n')).join('\n\n');
}

/** Generate markdown-header-separated Key: Value text with N sections */
export function makeHeaderSeparatedText(n: number): string {
  return Array.from({ length: n }, (_, i) => [
    `## Library ${i + 1}`,
    `Name: Library_${i + 1}`,
    `Version: ${i + 1}.0.0`,
    `Description: A library for doing thing ${i + 1} with code and more padding`,
    `Downloads: ${(i + 1) * 1000}`,
    'License: MIT',
  ].join('\n')).join('\n');
}

/** Generate a Python repr array of N objects */
export function makePythonRepr(n: number): string {
  const items = Array.from({ length: n }, (_, i) =>
    `{'id': ${i + 1}, 'name': 'user_${i + 1}', 'email': 'user${i + 1}@example.com', 'active': True}`,
  );
  return `[${items.join(', ')}]`;
}

/** Spawn the shim with a child command, collect stdout/stderr.
 *  Always adds --mcp flag for proxy mode (child command). */
export function runShim(
  shimFlags: string[] = [],
  childCmd = 'node',
  childArgs = [MOCK],
): { proc: ChildProcess, done: Promise<ShimResult> } {
  const proc = spawn('node', [SHIM, '--mcp', ...shimFlags, '--', childCmd, ...childArgs], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdoutBuf: Buffer[] = [];
  const stderrBuf: Buffer[] = [];
  proc.stdout!.on('data', (d: Buffer) => stdoutBuf.push(d));
  proc.stderr!.on('data', (d: Buffer) => stderrBuf.push(d));

  const done = new Promise<ShimResult>((resolve, reject) => {
    proc.on('exit', (code) => {
      resolve({
        stdout: Buffer.concat(stdoutBuf).toString(),
        stderr: Buffer.concat(stderrBuf).toString(),
        code,
      });
    });
    proc.on('error', (err) => {
      reject(err);
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
  shimFlags: string[] = [],
  childCmd = 'node',
  childArgs = [MOCK],
): { proc: ChildProcess, done: Promise<ShimResult> } {
  const result = runShim(shimFlags, childCmd, childArgs);
  procs.push(result.proc);
  return result;
}

/** Create a bound shim runner that auto-tracks processes for cleanup */
export function createShimRunner(procs: ChildProcess[]) {
  return (...args: Parameters<typeof trackedRunShim> extends [ChildProcess[], ...infer R] ? R : never) =>
    trackedRunShim(procs, ...args);
}
