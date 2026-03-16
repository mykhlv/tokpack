import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { Squeezer } from './squeezer.js';

declare const VERSION: string;

const MAX_LINE_LENGTH = 10 * 1024 * 1024; // 10MB

// --- 4.1 Parse CLI arguments ---

const args = process.argv.slice(2);
const sepIndex = args.indexOf('--');
const ownArgs = sepIndex === -1 ? args : args.slice(0, sepIndex);

if (ownArgs.includes('--version') || ownArgs.includes('-V')) {
  process.stdout.write(`mcp-squeeze v${VERSION}\n`);
  process.exit(0);
}

if (sepIndex === -1 || sepIndex + 1 >= args.length) {
  process.stderr.write(
    'Usage: mcp-squeeze [--version] -- <command> [args...]\n',
  );
  process.exit(2);
}

const childArgs = args.slice(sepIndex + 1);
const command = childArgs[0];
const commandArgs = childArgs.slice(1);

const disabled = process.env.MCP_SQUEEZE_DISABLED === '1';
const verbose = process.env.MCP_SQUEEZE_VERBOSE === '1';

// --- 4.2 Spawn child process ---

const child = spawn(command, commandArgs, {
  stdio: ['pipe', 'pipe', 'inherit'],
  shell: false,
});

process.stdin.pipe(child.stdin);
child.stdin.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') {
    process.stderr.write(`[mcp-squeeze] child stdin error: ${err.message}\n`);
  }
});

// --- 4.3 Stdout interception ---

let stdoutEnded = false;
let childExited = false;
let exitCode: number | null = null;
let exitSignal: NodeJS.Signals | null = null;

if (disabled) {
  child.stdout.pipe(process.stdout);
  child.stdout.on('end', () => {
    stdoutEnded = true;
    maybeExit();
  });
} else {
  const squeezer = new Squeezer(verbose);
  const decoder = new StringDecoder('utf8');
  let buffer = '';

  function emitLine(raw: string): void {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.length > MAX_LINE_LENGTH) {
      if (verbose) {
        process.stderr.write(
          `[mcp-squeeze] skip: line exceeds ${MAX_LINE_LENGTH} bytes\n`,
        );
      }
      process.stdout.write(line + '\n');
    } else {
      process.stdout.write(squeezer.process(line) + '\n');
    }
  }

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += decoder.write(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const raw of lines) {
      emitLine(raw);
    }
  });

  child.stdout.on('end', () => {
    buffer += decoder.end();
    if (buffer.length > 0) {
      emitLine(buffer);
    }
    stdoutEnded = true;
    maybeExit();
  });
}

// --- 4.4 Graceful shutdown ---

function maybeExit(): void {
  if (!stdoutEnded || !childExited) return;
  if (exitSignal) {
    process.kill(process.pid, exitSignal);
  } else {
    process.exit(exitCode ?? 0);
  }
}

child.on('exit', (code, signal) => {
  exitCode = code;
  exitSignal = signal;
  childExited = true;
  maybeExit();
});

// --- 4.5 Signal propagation ---

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    child.kill(sig);
  });
}

// --- 4.6 Error handling ---

child.on('error', (err: NodeJS.ErrnoException) => {
  process.stderr.write(`[mcp-squeeze] ${err.message}\n`);
  if (err.code === 'ENOENT') {
    process.exit(127);
  } else if (err.code === 'EACCES') {
    process.exit(126);
  } else {
    process.exit(1);
  }
});

// --- 4.7 EPIPE handling ---

process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') {
    if (child.pid && !child.killed) child.kill('SIGTERM');
    process.exit(0);
  } else {
    process.stderr.write(`[mcp-squeeze] stdout error: ${err.message}\n`);
    process.exit(1);
  }
});

// --- 4.8 Uncaught exception handler ---

process.on('uncaughtException', (err) => {
  process.stderr.write(`[mcp-squeeze] uncaught: ${err.message}\n`);
  if (child && child.pid && !child.killed) {
    child.kill('SIGTERM');
  }
  process.exit(1);
});
