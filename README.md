# tokpack

Pack more data into fewer tokens — JSON compression library and CLI tool for LLM context optimization. Transforms verbose JSON arrays and structured text into token-efficient tabular formats (PSV, Markdown, TOON), saving 38-64% on tokens.

Three ways to use:
- **Library** — `import { pack } from 'tokpack'`
- **CLI pipe** — `cat data.json | tokpack`
- **MCP proxy** — wraps any MCP server, transparent to the client

Zero runtime dependencies. Node.js >= 20.

## Benchmarks

Summary at 100 rows (tokens counted with o200k_base tokenizer):

| Scenario | JSON min | tokpack | Savings |
|----------|----------|---------|---------|
| Flat (DB users) | 2,502 | 1,411 | **-44%** |
| Nested (profiles) | 3,222 | 1,695 | **-47%** |
| Null-heavy (sparse) | 3,902 | 1,411 | **-64%** |
| DB rows (tasks) | 7,827 | 4,841 | **-38%** |
| Mixed (nested+nulls) | 4,992 | 2,310 | **-54%** |

Run `npm run bench` to reproduce.

<details>
<summary>Detailed benchmarks (all scenarios x 10/100/500 rows)</summary>

### Flat (DB users)

| Rows | Format | Tokens | vs JSON min |
|------|--------|--------|-------------|
| 10 | JSON (minified) | 252 | baseline |
| 10 | PSV + strip + flatten | 160 | -37% |
| 10 | MD + strip + flatten | 192 | -24% |
| 100 | JSON (minified) | 2,502 | baseline |
| 100 | PSV + strip + flatten | 1,510 | -40% |
| 100 | MD + strip + flatten | 1,722 | -31% |
| 500 | JSON (minified) | 12,502 | baseline |
| 500 | PSV + strip + flatten | 7,510 | -40% |
| 500 | MD + strip + flatten | 8,522 | -32% |

### Nested (profiles)

| Rows | Format | Tokens | vs JSON min |
|------|--------|--------|-------------|
| 10 | JSON (minified) | 324 | baseline |
| 10 | PSV + strip + flatten | 196 | -40% |
| 10 | MD + strip + flatten | 240 | -26% |
| 100 | JSON (minified) | 3,222 | baseline |
| 100 | PSV + strip + flatten | 1,834 | -43% |
| 100 | MD + strip + flatten | 2,148 | -33% |
| 500 | JSON (minified) | 16,102 | baseline |
| 500 | PSV + strip + flatten | 9,114 | -43% |
| 500 | MD + strip + flatten | 10,628 | -34% |

### Null-heavy (sparse)

| Rows | Format | Tokens | vs JSON min |
|------|--------|--------|-------------|
| 10 | JSON (minified) | 392 | baseline |
| 10 | PSV + strip + flatten | 160 | -59% |
| 10 | MD + strip + flatten | 192 | -51% |
| 100 | JSON (minified) | 3,902 | baseline |
| 100 | PSV + strip + flatten | 1,510 | -61% |
| 100 | MD + strip + flatten | 1,722 | -56% |
| 500 | JSON (minified) | 19,502 | baseline |
| 500 | PSV + strip + flatten | 7,510 | -61% |
| 500 | MD + strip + flatten | 8,522 | -56% |

### DB rows (tasks)

| Rows | Format | Tokens | vs JSON min |
|------|--------|--------|-------------|
| 10 | JSON (minified) | 785 | baseline |
| 10 | PSV + strip + flatten | 499 | -36% |
| 10 | MD + strip + flatten | 545 | -31% |
| 100 | JSON (minified) | 7,827 | baseline |
| 100 | PSV + strip + flatten | 4,841 | -38% |
| 100 | MD + strip + flatten | 5,157 | -34% |
| 500 | JSON (minified) | 39,127 | baseline |
| 500 | PSV + strip + flatten | 24,141 | -38% |
| 500 | MD + strip + flatten | 25,657 | -34% |

### Mixed (nested+nulls)

| Rows | Format | Tokens | vs JSON min |
|------|--------|--------|-------------|
| 10 | JSON (minified) | 492 | baseline |
| 10 | PSV + strip + flatten | 240 | -51% |
| 10 | MD + strip + flatten | 305 | -38% |
| 100 | JSON (minified) | 4,992 | baseline |
| 100 | PSV + strip + flatten | 2,310 | -54% |
| 100 | MD + strip + flatten | 2,825 | -43% |
| 500 | JSON (minified) | 25,392 | baseline |
| 500 | PSV + strip + flatten | 11,910 | -53% |
| 500 | MD + strip + flatten | 14,425 | -43% |

</details>

## Quick Start

### MCP Proxy

Add tokpack as a wrapper in your MCP client config:

```json
{
  "mcpServers": {
    "my-db": {
      "command": "npx",
      "args": ["-y", "tokpack", "--mcp", "--", "node", "my-db-server.js"]
    }
  }
}
```

Or generate the config snippet automatically with `--wrap`. Example:

```bash
npx tokpack --wrap npx -y @modelcontextprotocol/server-postgres
```

Output:

```
Add to your MCP client config:

"mcpServers": {
  "server-postgres": {
    "command": "npx",
    "args": ["-y", "tokpack", "--mcp", "--", "npx", "-y", "@modelcontextprotocol/server-postgres"]
  }
}
```

No changes needed to your MCP servers.

### Library

```bash
npm install tokpack
```

```typescript
import { pack, packRaw, createPacker } from 'tokpack';

// Pack structured data
const users = [
  { id: 1, name: 'Alice', role: 'admin' },
  { id: 2, name: 'Bob', role: 'user' },
  { id: 3, name: 'Charlie', role: 'editor' },
  // ...
];
pack(users);
// => "## PSV|id,name,role\n1|Alice|admin\n2|Bob|user\n3|Charlie|editor"

pack(users, { format: 'md' });
// => "| id | name | role |\n|---|---|---|\n| 1 | Alice | admin |..."

// Pack raw text or JSON strings
packRaw('[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"},...]');

// Reusable packer with fixed options
const packer = createPacker({ format: 'toon' });
packer.pack(data);
packer.packRaw(text);
```

### Pipe Mode

```bash
cat data.jsonl | tokpack
cat data.jsonl | tokpack --format toon
echo '[{"id":1},{"id":2},{"id":3}]' | tokpack
```

Processes each line independently — works with JSONL and structured text.

## How It Works

tokpack intercepts data and applies a pipeline of optimizations:

```
MCP client → tokpack → MCP server       (proxy mode)
stdin → tokpack → stdout                (pipe mode)
pack(data) → compressed string          (library)
```

**Decision flow:**
- Payload < 512 bytes → pass-through (MCP proxy only)
- Array < 3 items → minified JSON
- Pre-processing: strip all-null/empty columns, flatten nested objects (dot-notation, up to 3 levels)
- Structured text: detect repeating Key: Value patterns → tabular format
- Array >= 3 items with uniform keys → PSV (default), Markdown table, or TOON
- Non-uniform or non-array data → minified JSON (if shorter) or original
- Any error → original data returned unmodified

## Output Formats

### PSV (default) — [spec](PSV_SPEC.md)

```
## PSV|name,role,email
Alice|admin|alice@example.com
Bob|user|bob@example.com
Charlie|editor|charlie@example.com
```

### Markdown Table

```
| name | role | email |
|---|---|---|
| Alice | admin | alice@example.com |
| Bob | user | bob@example.com |
| Charlie | editor | charlie@example.com |
```

### TOON — [spec](https://github.com/toon-format/spec)

```
[3]{name,role,email}:
  Alice,admin,alice@example.com
  Bob,user,bob@example.com
  Charlie,editor,charlie@example.com
```

Run `tokpack --formats` to see examples with real data.

## CLI Reference

```
Usage:
  cat data.jsonl | tokpack [options]              Pipe/filter mode
  tokpack --mcp [options] -- <command> [args...]  MCP proxy mode
```

### Options

| Flag | Description |
|------|-------------|
| `--format <fmt>` | Output format: `auto` (default), `psv`, `md`, `toon` |
| `--verbose`, `-v` | Log per-call stats to stderr |
| `--no-strip` | Disable null/empty column stripping |
| `--no-flatten` | Disable dot-notation flattening |
| `--no-parse-text` | Disable structured text parsing |
| `--mcp` | MCP proxy mode (JSON-RPC protocol) |
| `--unwrap` | Unwrap single-text content blocks (MCP only) |
| `--disabled` | Full bypass — pass all data through unchanged |

### Commands

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help |
| `--version`, `-V` | Show version |
| `--stats` | Show cumulative token savings |
| `--stats --reset` | Reset stats history |
| `--config` | Show current configuration |
| `--formats` | Show example output in all formats |
| `--bench <file>` | Benchmark a file (one JSON/text per line) |
| `--test -- <cmd>` | Verify MCP server starts and responds |
| `--wrap <cmd>` | Generate MCP client config snippet |

## Token Savings Stats

tokpack tracks cumulative optimization stats across sessions:

```bash
tokpack --stats
# tokpack stats:
#   Optimizations: 47
#   Original: 375.0 KB → Optimized: 138.7 KB
#   Saved: 236.3 KB (63%) ~59,075 tokens

tokpack --stats --reset
```

## Limitations

- Only optimizes arrays of uniform objects (same keys across all rows)
- Nested objects are flattened up to 3 levels deep; deeper values are stringified
- Non-array JSON is minified only if the result is shorter than the original
- Payloads under 512 bytes are passed through in MCP proxy mode
- Lines over 10M characters are passed through without parsing
- Keys containing format-specific delimiters (`,` `|` for PSV; `,` `{` `}` `:` for TOON; `|` for Markdown) cause fallback to JSON

## License

MIT
