import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Squeezer, Format } from './squeezer.js';
import { createPacker } from './pack.js';
import { printStats, resetStats, BYTES_PER_TOKEN } from './stats.js';
import type { ParsedArgs } from './cli.js';

declare const VERSION: string;

export function runHelp(): never {
  process.stdout.write(`tokpack v${VERSION} — Pack more data into fewer tokens

Usage:
  cat data.jsonl | tokpack [options]              Pipe/filter mode
  tokpack --mcp [options] -- <command> [args...]   MCP proxy mode

Options:
  --help, -h           Show this help message
  --version, -V        Show version
  --stats              Show cumulative token savings
  --stats --reset      Clear stats history
  --config             Show current configuration
  --formats            Show example output in PSV, Markdown, and TOON
  --bench <file>       Benchmark a file (one JSON/text per line)
  --test               Verify child MCP server starts and responds
  --wrap <command>      Generate MCP client config snippet

  --format <fmt>       Output format: auto (default), psv, md, toon
  --verbose, -v        Log per-call stats to stderr
  --no-strip           Disable null/empty column stripping
  --no-flatten         Disable dot-notation flattening
  --no-parse-text      Disable structured text parsing
  --no-parse-python    Disable Python repr normalization
  --mcp                MCP proxy mode (JSON-RPC protocol)
  --unwrap             Unwrap single-text content blocks (MCP only)

Examples:
  echo '[{"id":1,"name":"Alice"},...]' | tokpack
  cat responses.jsonl | tokpack --format toon
  tokpack --mcp -- npx -y @upstash/context7-mcp
  tokpack --wrap npx -y @upstash/context7-mcp
`);
  process.exit(0);
}

export function runVersion(): never {
  process.stdout.write(`tokpack v${VERSION}\n`);
  process.exit(0);
}

export function runStats(shouldReset: boolean): never {
  if (shouldReset) {
    const deleted = resetStats();
    process.stdout.write(deleted ? 'Stats reset.\n' : 'No stats to reset.\n');
  } else {
    printStats();
  }
  process.exit(0);
}

export function runConfig(parsed: ParsedArgs): never {
  const { opts, isMcpMode } = parsed;
  process.stdout.write('tokpack configuration:\n'
    + `  Mode:           ${isMcpMode ? 'mcp proxy' : 'pipe/filter'}\n`
    + `  Disabled:       ${opts.disabled ? 'yes' : 'no'}\n`
    + `  Verbose:        ${opts.verbose ? 'yes' : 'no'}\n`
    + `  Format:         ${opts.format}\n`
    + `  Strip empty:    ${opts.stripEmpty ? 'yes' : 'no'}\n`
    + `  Flatten:        ${opts.flatten ? 'yes' : 'no'}\n`
    + `  Parse text:     ${opts.parseText ? 'yes' : 'no'}\n`
    + `  Parse Python:   ${opts.parsePython ? 'yes' : 'no'}\n`
    + `  Unwrap content: ${opts.unwrapContent ? 'yes' : 'no'}\n`);
  process.exit(0);
}

export function runFormats(): never {
  const sampleData = [
    { name: 'Alice Johnson', role: 'admin', email: 'alice@example.com', department: 'Engineering', active: true },
    { name: 'Bob Smith', role: 'user', email: 'bob@example.com', department: 'Marketing', active: false },
    { name: 'Charlie Brown', role: 'user', email: 'charlie@example.com', department: 'Engineering', active: true },
    { name: 'Diana Prince', role: 'moderator', email: 'diana@example.com', department: 'Support', active: true },
    { name: 'Eve Wilson', role: 'user', email: 'eve@example.com', department: 'Marketing', active: false },
    { name: 'Frank Castle', role: 'admin', email: 'frank@example.com', department: 'Engineering', active: true },
    { name: 'Grace Hopper', role: 'user', email: 'grace@example.com', department: 'Engineering', active: true },
    { name: 'Hank Pym', role: 'moderator', email: 'hank@example.com', department: 'Support', active: false },
  ];

  process.stdout.write('=== Sample data (8 objects) ===\n\n');

  for (const f of ['psv', 'md', 'toon'] as Format[]) {
    const packer = createPacker({ format: f });
    const result = packer.pack(sampleData);
    process.stdout.write(`--- ${f.toUpperCase()} ---\n${result}\n\n`);
  }

  process.exit(0);
}

export function runBench(filePath: string | undefined): never {
  if (!filePath) {
    process.stderr.write('Usage: tokpack --bench <file>\n');
    process.exit(2);
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    process.stderr.write(`Cannot read file: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const lines = raw.split('\n').filter(l => l.trim());
  process.stdout.write(`tokpack bench: ${filePath}\n`
    + `  Lines: ${lines.length}\n\n`);

  for (const f of ['psv', 'md', 'toon', 'auto'] as Format[]) {
    let fOrig = 0;
    let fOpt = 0;
    let fCount = 0;

    const sq = new Squeezer({ format: f });
    const packer = createPacker({ format: f });

    for (const line of lines) {
      const origBytes = Buffer.byteLength(line);
      const mcpResult = sq.process(line);
      const result = mcpResult !== line ? mcpResult : packer.packRaw(line);
      const optBytes = Buffer.byteLength(result);
      fOrig += origBytes;
      fOpt += optBytes;
      if (result !== line) fCount++;
    }

    const saved = fOrig - fOpt;
    const ratio = fOrig > 0 ? Math.round((1 - fOpt / fOrig) * 100) : 0;
    const tokens = Math.round(saved / BYTES_PER_TOKEN);
    process.stdout.write(`  ${f.toUpperCase().padEnd(4)} : ${fCount} optimized, `
      + `${fOrig} → ${fOpt} bytes (-${ratio}%) ~${tokens.toLocaleString('en-US')} tokens saved\n`);
  }

  process.stdout.write('\n');
  process.exit(0);
}

export function runWrap(ownArgs: string[]): never {
  const wrapIdx = ownArgs.indexOf('--wrap');
  // Use the already-parsed args array directly to correctly handle paths with spaces
  const parts = ownArgs.slice(wrapIdx + 1);
  if (parts.length === 0) {
    process.stderr.write('Usage: tokpack --wrap <command> [args...]\n');
    process.exit(2);
  }

  const serverName = parts[parts.length - 1]
    .replace(/^@.*\//, '')
    .replace(/-mcp$/, '')
    .replace(/-server$/, '');

  const config = {
    [serverName]: {
      command: 'npx',
      args: ['-y', 'tokpack', '--mcp', '--', ...parts],
    },
  };

  process.stdout.write('Add to your MCP client config:\n\n');
  process.stdout.write(`"mcpServers": ${JSON.stringify(config, null, 2)}\n`);
  process.exit(0);
}

export function runTest(args: string[], sepIndex: number): void {
  if (sepIndex === -1 || sepIndex + 1 >= args.length) {
    process.stderr.write('Usage: tokpack --test -- <command> [args...]\n');
    process.exit(2);
  }

  const testChildArgs = args.slice(sepIndex + 1);
  const testCmd = testChildArgs[0];
  const testCmdArgs = testChildArgs.slice(1);

  const testChild = spawn(testCmd, testCmdArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });

  const initRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'tokpack-test', version: VERSION },
    },
  }) + '\n';

  let output = '';
  let succeeded = false;
  const timeout = setTimeout(() => {
    process.stderr.write('[tokpack] test: timeout — no response after 10s\n');
    testChild.kill('SIGTERM');
    process.exit(1);
  }, 10_000);

  testChild.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
    if (output.includes('\n')) {
      clearTimeout(timeout);
      try {
        const resp = JSON.parse(output.split('\n')[0]);
        if (resp.result?.protocolVersion) {
          succeeded = true;
          process.stdout.write(`OK: ${testCmd} responds to MCP initialize\n`
            + `  Protocol: ${resp.result.protocolVersion}\n`
            + `  Server:   ${resp.result.serverInfo?.name ?? 'unknown'} v${resp.result.serverInfo?.version ?? '?'}\n`);
          testChild.kill('SIGTERM');
          process.exit(0);
        } else if (resp.error) {
          process.stderr.write(`FAIL: ${resp.error.message}\n`);
          testChild.kill('SIGTERM');
          process.exit(1);
        }
      } catch {
        process.stderr.write('FAIL: invalid JSON response\n');
        testChild.kill('SIGTERM');
        process.exit(1);
      }
    }
  });

  testChild.on('error', (err: NodeJS.ErrnoException) => {
    clearTimeout(timeout);
    process.stderr.write(`FAIL: ${err.message}\n`);
    process.exit(err.code === 'ENOENT' ? 127 : 1);
  });

  testChild.on('exit', (code) => {
    clearTimeout(timeout);
    // Guard against race: data handler may have already called process.exit(0)
    if (!succeeded) {
      process.stderr.write(`FAIL: child exited with code ${code} before responding\n`);
      process.exit(1);
    }
  });

  testChild.stdin.write(initRequest);
  testChild.stdin.end();
}
