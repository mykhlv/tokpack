# Changelog

All notable changes to tokpack will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 - 2026-03-18

### Added

- Stateless JSON-RPC transformation engine (`Squeezer`) with PSV output for large flat arrays
- Stdio proxy that spawns a child MCP server and intercepts stdout
- PSV (Pipe-Separated Values) format: `## PSV|col1,col2|N rows` header + pipe-delimited rows
- Smart decision flow: skip small payloads (<512B), minify small arrays (<3 items), convert large flat uniform arrays to PSV, fallback to minified JSON for nested data
- Null/empty column stripping: removes columns where all rows are null/undefined/empty string (10-20% extra savings on sparse data)
- Dot-notation flattening: converts nested objects up to 3 levels deep (`profile.city`), arrays and deep values stringified as JSON
- Markdown table output format as alternative to PSV, controlled by `--format md`
- TOON (Token-Oriented Object Notation) output format: `[N]{field1,field2}:` header + comma-separated rows with smart quoting
- `--format psv|md|toon` CLI flag for output format selection
- `--no-strip` CLI flag to disable null/empty column stripping
- `--no-flatten` CLI flag to disable dot-notation flattening
- Benchmark script (`npm run bench`) with 5 scenarios × 4 sizes, comparing all strategies
- Graceful shutdown: waits for both stdout drain and child exit
- Signal forwarding (SIGINT/SIGTERM) and EPIPE handling
- `--disabled` CLI flag for full bypass mode
- `--verbose` CLI flag for optimization stats on stderr
- `--version` / `-V` CLI flag
- `--stats` CLI command: show cumulative token savings across sessions
- `--stats --reset` CLI command: clear stats history
- Append-only stats log (`~/.tokpack/stats.log`): tracks optimization metrics per call
- `TOKPACK_STATS_PATH` environment variable to override stats log location
- Structured text parsing: detects repeating key-value patterns in plain text (e.g., Context7 responses) and converts to tabular format
- `--no-parse-text` CLI flag to disable structured text parsing
- Content wrapper unwrap: opt-in replacement of `[{type:"text",text:"..."}]` with plain string
- `--unwrap` CLI flag for content unwrap (breaks MCP spec, verify client compatibility)
- MAX_LINE_LENGTH (10MB) bypass for oversized lines
- Pipe escaping (`|` -> `\|`), backslash escaping, newline/CR escaping in PSV and Markdown values
- Unit tests, integration tests, smoke tests, and e2e tests (179 total)
- GitHub Actions CI workflow
- ESLint with typescript-eslint and @stylistic/eslint-plugin
- esbuild bundling with shebang injection and version define
