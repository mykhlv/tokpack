/**
 * Mock MCP server for integration tests.
 * Reads newline-delimited commands from stdin, writes JSON-RPC responses to stdout.
 *
 * Commands:
 *   {"cmd":"big","id":N}        — respond with large array (10 rows) as JSON-RPC result
 *   {"cmd":"small","id":N}      — respond with tiny payload
 *   {"cmd":"chunked","id":N}    — respond with large array written in small chunks
 *   {"cmd":"crlf","id":N}       — respond with \r\n line ending
 *   {"cmd":"stderr","msg":"x"}  — write msg to stderr
 *   {"cmd":"exit","code":N}     — exit with given code
 *   {"cmd":"huge","id":N}       — respond with a line >10MB
 */

import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin });

function makeArray(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `user_${i + 1}`,
    email: `user${i + 1}@example.com`,
    active: true,
  }));
}

function rpcResult(id, text) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text }] },
  });
}

rl.on('line', (line) => {
  let cmd;
  try {
    cmd = JSON.parse(line);
  } catch {
    return;
  }

  switch (cmd.cmd) {
    case 'big': {
      const data = JSON.stringify(makeArray(10), null, 2);
      process.stdout.write(rpcResult(cmd.id, data) + '\n');
      break;
    }
    case 'small': {
      process.stdout.write(rpcResult(cmd.id, '{"ok":true}') + '\n');
      break;
    }
    case 'chunked': {
      const data = JSON.stringify(makeArray(10), null, 2);
      const full = rpcResult(cmd.id, data) + '\n';
      // Write in 50-byte chunks
      for (let i = 0; i < full.length; i += 50) {
        process.stdout.write(full.slice(i, i + 50));
      }
      break;
    }
    case 'crlf': {
      const data = JSON.stringify(makeArray(10), null, 2);
      process.stdout.write(rpcResult(cmd.id, data) + '\r\n');
      break;
    }
    case 'stderr': {
      process.stderr.write(cmd.msg + '\n');
      break;
    }
    case 'exit': {
      process.exit(cmd.code ?? 0);
      break;
    }
    case 'huge': {
      // Generate a line >10MB
      const big = 'x'.repeat(11 * 1024 * 1024);
      const resp = rpcResult(cmd.id, big);
      process.stdout.write(resp + '\n');
      break;
    }
  }
});
