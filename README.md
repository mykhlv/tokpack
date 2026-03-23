# tokpack

Pack more data into fewer tokens — JSON compression library and CLI tool for LLM context optimization. Transforms verbose JSON arrays and structured text into token-efficient tabular formats (PSV, Markdown, TOON), saving 45-72% on tokens.

Three ways to use:
- **Library** — `import { pack } from 'tokpack'`
- **CLI pipe** — `cat data.json | tokpack`
- **MCP proxy** — wraps any MCP server, transparent to the client

Zero runtime dependencies. Node.js >= 20.

## Benchmarks

Summary at 100 rows (tokens, ~4 chars/token):

| Scenario | JSON min | tokpack | Savings |
|----------|----------|---------|---------|
| Flat (DB users) | 2,141 | 1,051 | **-51%** |
| Nested (profiles) | 2,655 | 1,120 | **-58%** |
| Null-heavy (sparse) | 3,611 | 1,046 | **-71%** |
| DB rows (tasks) | 7,410 | 4,077 | **-45%** |
| Mixed (nested+nulls) | 4,016 | 1,114 | **-72%** |

Run `npm run bench` to reproduce.

<details>
<summary>Detailed benchmarks (all scenarios x 10/50/100/500 rows)</summary>

### Flat (DB users)

| Rows | Format | ~Tokens | vs JSON min |
|------|--------|---------|-------------|
| 10 | JSON (minified) | 208 | baseline |
| 10 | PSV + strip + flatten | 108 | -48% |
| 10 | MD + strip + flatten | 143 | -31% |
| 100 | JSON (minified) | 2,141 | baseline |
| 100 | PSV + strip + flatten | 1,051 | -51% |
| 100 | MD + strip + flatten | 1,356 | -37% |
| 500 | JSON (minified) | 11,028 | baseline |
| 500 | PSV + strip + flatten | 5,538 | -50% |
| 500 | MD + strip + flatten | 7,042 | -36% |

### Nested (profiles)

| Rows | Format | ~Tokens | vs JSON min |
|------|--------|---------|-------------|
| 10 | JSON (minified) | 260 | baseline |
| 10 | PSV + strip + flatten | 120 | -54% |
| 100 | JSON (minified) | 2,655 | baseline |
| 100 | PSV + strip + flatten | 1,120 | -58% |
| 500 | JSON (minified) | 13,595 | baseline |
| 500 | PSV + strip + flatten | 5,860 | -57% |

### Null-heavy (sparse)

| Rows | Format | ~Tokens | vs JSON min |
|------|--------|---------|-------------|
| 10 | JSON (minified) | 355 | baseline |
| 10 | PSV + strip + flatten | 108 | -70% |
| 100 | JSON (minified) | 3,611 | baseline |
| 100 | PSV + strip + flatten | 1,046 | -71% |
| 500 | JSON (minified) | 18,378 | baseline |
| 500 | PSV + strip + flatten | 5,513 | -70% |

### DB rows (tasks)

| Rows | Format | ~Tokens | vs JSON min |
|------|--------|---------|-------------|
| 10 | JSON (minified) | 736 | baseline |
| 10 | PSV + strip + flatten | 418 | -43% |
| 100 | JSON (minified) | 7,410 | baseline |
| 100 | PSV + strip + flatten | 4,077 | -45% |
| 500 | JSON (minified) | 37,370 | baseline |
| 500 | PSV + strip + flatten | 20,637 | -45% |

### Mixed (nested+nulls)

| Rows | Format | ~Tokens | vs JSON min |
|------|--------|---------|-------------|
| 10 | JSON (minified) | 393 | baseline |
| 10 | PSV + strip + flatten | 123 | -69% |
| 100 | JSON (minified) | 4,016 | baseline |
| 100 | PSV + strip + flatten | 1,114 | -72% |
| 500 | JSON (minified) | 20,516 | baseline |
| 500 | PSV + strip + flatten | 5,914 | -71% |

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
