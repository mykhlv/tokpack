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
- `MCP_SQUEEZE_FORMAT=psv|md` environment variable for output format selection
- `MCP_SQUEEZE_NO_STRIP=1` environment variable to disable null/empty column stripping
- `MCP_SQUEEZE_NO_FLATTEN=1` environment variable to disable dot-notation flattening
- Benchmark script (`npm run bench`) with 5 scenarios × 4 sizes, comparing all strategies
- Graceful shutdown: waits for both stdout drain and child exit
- Signal forwarding (SIGINT/SIGTERM) and EPIPE handling
- `MCP_SQUEEZE_DISABLED=1` environment variable for full bypass mode
- `MCP_SQUEEZE_VERBOSE=1` environment variable for optimization stats on stderr
- `--version` / `-V` CLI flag
- MAX_LINE_LENGTH (10MB) bypass for oversized lines
- Pipe escaping (`|` -> `\|`), backslash escaping, newline/CR escaping in PSV and Markdown values
- Unit tests (40 tests), integration tests (13 tests), and smoke tests (26 tests)
- GitHub Actions CI workflow
- ESLint with typescript-eslint and @stylistic/eslint-plugin
- esbuild bundling with shebang injection and version define
