# Changelog

All notable changes to mcp-squeeze will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Stateless JSON-RPC transformation engine (`Squeezer`) with PSV output for large flat arrays
- Stdio proxy that spawns a child MCP server and intercepts stdout
- PSV (Pipe-Separated Values) format: `## PSV|col1,col2|N rows` header + pipe-delimited rows
- Smart decision flow: skip small payloads (<512B), minify small arrays (<=5 items), convert large flat uniform arrays to PSV, fallback to minified JSON for nested data
- Null/empty column stripping: removes columns where all rows are null/undefined/empty string (10-20% extra savings on sparse data)
- Dot-notation flattening: converts nested objects up to 3 levels deep (`profile.city`), arrays and deep values stringified as JSON
- Markdown table output format as alternative to PSV, controlled by `MCP_SQUEEZE_FORMAT=md`
- TOON (Token-Oriented Object Notation) output format: `[N]{field1,field2}:` header + comma-separated rows with smart quoting
- `MCP_SQUEEZE_FORMAT=psv|md|toon` environment variable for output format selection
- `MCP_SQUEEZE_NO_STRIP=1` environment variable to disable null/empty column stripping
- `MCP_SQUEEZE_NO_FLATTEN=1` environment variable to disable dot-notation flattening
- Benchmark script (`npm run bench`) with 5 scenarios × 4 sizes, comparing all strategies
- Graceful shutdown: waits for both stdout drain and child exit
- Signal forwarding (SIGINT/SIGTERM) and EPIPE handling
- `MCP_SQUEEZE_DISABLED=1` environment variable for full bypass mode
- `MCP_SQUEEZE_VERBOSE=1` environment variable for optimization stats on stderr
- `--version` / `-V` CLI flag
- `--stats` CLI command: show cumulative token savings across sessions
- `--stats --reset` CLI command: clear stats history
- Append-only stats log (`~/.mcp-squeeze/stats.log`): tracks optimization metrics per call, safe for multi-process
- `MCP_SQUEEZE_STATS_PATH` environment variable to override stats log location
- Structured text parsing: detects repeating key-value patterns in plain text (e.g., Context7 responses) and converts to tabular format
- `MCP_SQUEEZE_NO_PARSE_TEXT=1` environment variable to disable structured text parsing
- Content wrapper unwrap: opt-in replacement of `[{type:"text",text:"..."}]` with plain string
- `MCP_SQUEEZE_UNWRAP=1` environment variable for content unwrap (breaks MCP spec, verify client compatibility)
- MAX_LINE_LENGTH (10MB) bypass for oversized lines
- Pipe escaping (`|` -> `\|`), backslash escaping, newline/CR escaping in PSV and Markdown values
- Unit tests, integration tests, and smoke tests (139 total)
- GitHub Actions CI workflow
- ESLint with typescript-eslint and @stylistic/eslint-plugin
- esbuild bundling with shebang injection and version define
