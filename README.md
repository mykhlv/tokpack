# mcp-squeeze

MCP token optimizer — transparent stdio shim that transforms verbose JSON responses into token-efficient formats, saving 35-64% on large arrays.

## Benchmarks

10-record array (id, name, email, role, active):

| Format | Tokens | Chars | Savings |
|--------|--------|-------|---------|
| JSON (minified) | 262 | 784 | baseline |
| **PSV (mcp-squeeze)** | **169** | **368** | **-35%** |

Savings scale with array size. A 500-row table goes from ~$1,940 to ~$760 in output token costs (61% savings).

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

It intercepts JSON-RPC responses and converts large uniform arrays into PSV (Pipe-Separated Values) format:

```
## PSV|id,name,email|3 rows
1|Alice|alice@example.com
2|Bob|bob@example.com
3|Charlie|charlie@example.com
```

**Decision flow:**
- Payload < 512 bytes → pass-through
- Array ≤ 5 items → minified JSON
- Array > 5 items with uniform flat keys → PSV
- Nested objects/arrays in values → fallback to minified JSON
- Any error → original data returned unmodified

Pipe characters in values are escaped as `\|`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SQUEEZE_DISABLED` | `0` | Set to `1` to bypass all optimization |
| `MCP_SQUEEZE_VERBOSE` | `0` | Set to `1` to log optimization stats to stderr |

## Limitations

- Only optimizes arrays of flat, uniform objects (same keys, no nested values)
- Non-array data is minified but not converted to PSV
- Payloads under 512 bytes are not touched
- Lines over 10MB are passed through without parsing

## License

MIT
