# mcp-squeeze

MCP token optimizer — transparent stdio shim that transforms verbose JSON responses into token-efficient formats, saving 45-72% on tokens.

## Benchmarks

Summary at 100 rows (tokens, ~4 chars/token):

| Scenario | JSON min | mcp-squeeze | Savings |
|----------|----------|-------------|---------|
| Flat (DB users) | 2,141 | 1,051 | **-51%** |
| Nested (profiles) | 2,655 | 1,120 | **-58%** |
| Null-heavy (sparse) | 3,611 | 1,046 | **-71%** |
| DB rows (tasks) | 7,410 | 4,077 | **-45%** |
| Mixed (nested+nulls) | 4,016 | 1,114 | **-72%** |

Run `npm run bench` to reproduce. Full results below.

<details>
<summary>Detailed benchmarks (all scenarios × 10/50/100/500 rows)</summary>

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

Add `mcp-squeeze` as a wrapper in your MCP client config:

```json
{
  "mcpServers": {
    "my-db": {
      "command": "npx",
      "args": ["-y", "mcp-squeeze", "--", "node", "my-db-server.js"]
    }
  }
}
```

No changes needed to Claude or to your MCP servers.

## How It Works

mcp-squeeze sits between the MCP client and server as a stdio proxy:

```
Claude Desktop/Code → mcp-squeeze → MCP server
```

It intercepts JSON-RPC responses and applies a pipeline of optimizations:

1. **Null/empty stripping** — removes columns where all values are null/undefined/empty
2. **Dot-notation flattening** — converts nested objects to flat keys (`profile.city`)
3. **Structured text parsing** — detects repeating key-value patterns in plain text and converts to tabular format
4. **Tabular conversion** — converts uniform arrays to PSV, Markdown table, or TOON format

Example PSV output:
```
## PSV|id,name,email|3 rows
1|Alice|alice@example.com
2|Bob|bob@example.com
3|Charlie|charlie@example.com
```

**Decision flow:**
- Payload < 512 bytes → pass-through
- Array < 5 items → minified JSON
- Pre-processing: strip all-null columns, flatten nested objects
- Array ≥ 5 items with uniform keys → PSV (default), Markdown table, or TOON
- Non-uniform data → fallback to minified JSON
- Any error → original data returned unmodified

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SQUEEZE_DISABLED` | `0` | Set to `1` to bypass all optimization |
| `MCP_SQUEEZE_VERBOSE` | `0` | Set to `1` to log optimization stats to stderr |
| `MCP_SQUEEZE_FORMAT` | `psv` | Output format: `psv`, `md` (Markdown table), or `toon` (TOON) |
| `MCP_SQUEEZE_NO_STRIP` | `0` | Set to `1` to disable null/empty column stripping |
| `MCP_SQUEEZE_NO_FLATTEN` | `0` | Set to `1` to disable dot-notation flattening |
| `MCP_SQUEEZE_NO_PARSE_TEXT` | `0` | Set to `1` to disable structured text parsing |
| `MCP_SQUEEZE_UNWRAP` | `0` | Set to `1` to unwrap single-text content blocks (opt-in) |

## Token Savings Stats

mcp-squeeze tracks cumulative optimization stats across sessions:

```bash
npx mcp-squeeze --stats
# mcp-squeeze stats:
#   Optimizations: 47
#   Original: 375.0 KB → Optimized: 138.7 KB
#   Saved: 236.3 KB (63%) ~59,075 tokens

npx mcp-squeeze --stats --reset  # Clear stats
```

## Limitations

- Only optimizes arrays of uniform objects (same keys across all rows)
- Nested objects are flattened up to 3 levels deep; deeper values are stringified
- Non-array data is minified but not converted to tabular format
- Payloads under 512 bytes are not touched
- Lines over 10MB are passed through without parsing

## License

MIT
