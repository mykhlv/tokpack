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
- Graceful shutdown: waits for both stdout drain and child exit
- Signal forwarding (SIGINT/SIGTERM) and EPIPE handling
- `MCP_SQUEEZE_DISABLED=1` environment variable for full bypass mode
- `MCP_SQUEEZE_VERBOSE=1` environment variable for optimization stats on stderr
- `--version` / `-V` CLI flag
- MAX_LINE_LENGTH (10MB) bypass for oversized lines
- Pipe escaping (`|` -> `\|`) in PSV values
- Unit tests (23 tests), integration tests (13 tests), and smoke tests (20 tests)
- GitHub Actions CI workflow
- ESLint with typescript-eslint and @stylistic/eslint-plugin
- esbuild bundling with shebang injection and version define
