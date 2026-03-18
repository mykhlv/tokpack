import { spawn } from 'node:child_process';
import { parseArgs } from './cli.js';
import { runHelp, runVersion, runStats, runConfig, runFormats, runBench, runWrap, runTest } from './commands.js';
import { createMcpLineProcessor, createPipeLineProcessor, processStream } from './stream.js';

// --- Parse CLI arguments ---

const parsed = parseArgs(process.argv);
const { hasFlag, flagValue, opts, isMcpMode, hasChildCommand, isPipe, childArgs } = parsed;

// --- Standalone commands (exit immediately) ---

if (hasFlag('--help', '-h')) runHelp();
if (hasFlag('--version', '-V')) runVersion();
if (hasFlag('--stats')) runStats(hasFlag('--reset'));
if (hasFlag('--config')) runConfig(parsed);
if (hasFlag('--formats')) runFormats();
if (hasFlag('--bench')) runBench(flagValue('--bench'));
if (hasFlag('--wrap')) runWrap(parsed.ownArgs);
if (hasFlag('--test')) {
  runTest(process.argv.slice(2), parsed.sepIndex);
  // runTest is async (spawns child, exits in callbacks) — prevent fall-through
} else if (!hasChildCommand && !isPipe) {
  process.stderr.write(
    'Usage: cat data.jsonl | tokpack [options]\n'
    + '       tokpack --mcp [options] -- <command> [args...]\n'
    + 'Run tokpack --help for details.\n',
  );
  process.exit(2);
}

// --- Pipe mode: stdin → pack → stdout ---

if (!hasFlag('--test') && isPipe) {
  const processor = isMcpMode ? createMcpLineProcessor(opts) : createPipeLineProcessor(opts);
  processStream(process.stdin, processor, opts, () => {
    process.exit(0);
  });

  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') process.exit(0);
    process.stderr.write(`[tokpack] stdout error: ${err.message}\n`);
    process.exit(1);
  });
}

// --- MCP Proxy mode: spawn child, intercept stdout ---

if (!hasFlag('--test') && hasChildCommand) {
  const command = childArgs[0];
  const commandArgs = childArgs.slice(1);

  const child = spawn(command, commandArgs, {
    stdio: ['pipe', 'pipe', 'inherit'],
    shell: false,
  });

  process.stdin.pipe(child.stdin);
  child.stdin.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') {
      process.stderr.write(`[tokpack] child stdin error: ${err.message}\n`);
    }
  });

  let stdoutEnded = false;
  let childExited = false;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;

  function maybeExit(): void {
    if (!stdoutEnded || !childExited) return;
    if (exitSignal) {
      process.kill(process.pid, exitSignal);
    } else {
      process.exit(exitCode ?? 0);
    }
  }

  processStream(child.stdout, createMcpLineProcessor(opts), opts, () => {
    stdoutEnded = true;
    maybeExit();
  });

  child.on('exit', (code, signal) => {
    exitCode = code;
    exitSignal = signal;
    childExited = true;
    maybeExit();
  });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }

  child.on('error', (err: NodeJS.ErrnoException) => {
    process.stderr.write(`[tokpack] ${err.message}\n`);
    if (err.code === 'ENOENT') {
      process.exit(127);
    } else if (err.code === 'EACCES') {
      process.exit(126);
    } else {
      process.exit(1);
    }
  });

  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      if (child.pid && !child.killed) child.kill('SIGTERM');
      process.exit(0);
    } else {
      process.stderr.write(`[tokpack] stdout error: ${err.message}\n`);
      process.exit(1);
    }
  });

  process.on('uncaughtException', (err) => {
    process.stderr.write(`[tokpack] uncaught: ${err.message}\n`);
    if (child && child.pid && !child.killed) {
      child.kill('SIGTERM');
    }
    process.exit(1);
  });
}
