# PSV (Pipe-Separated Values) Format Specification

**Version:** 1.0
**Status:** Stable

PSV is a compact tabular text format designed for token-efficient data transfer between MCP servers and LLM clients. It encodes uniform arrays of flat objects as a single header line followed by pipe-delimited data rows.

## Structure

A PSV document consists of exactly one **header line** followed by zero or more **data rows**, separated by newline (`\n`) characters.

```
## PSV|col1,col2,col3|N rows
val1|val2|val3
val4|val5|val6
```

## Header

```
## PSV|<columns>|<count> rows
```

| Component | Description |
|-----------|-------------|
| `## PSV` | Fixed magic prefix identifying the format |
| `<columns>` | Comma-separated list of column names (no spaces) |
| `<count>` | Integer number of data rows that follow |
| `rows` | Fixed literal suffix |

Column names must not contain commas. The header is always a single line.

**Example:**

```
## PSV|id,name,email,active|100 rows
```

## Data Rows

Each data row contains values separated by the pipe character (`|`). The number of values per row must equal the number of columns in the header.

```
1|Alice|alice@example.com|true
2|Bob|bob@example.com|false
```

## Data Types

All values are encoded as strings. The original type can be inferred by the consumer:

| Type | Encoding | Example |
|------|----------|---------|
| String | As-is (with escaping) | `hello` |
| Number | Decimal representation | `42`, `3.14`, `-7` |
| Boolean | `true` or `false` | `true` |
| Null/undefined | Empty string | (empty between pipes) |

## Escaping

Four characters require escaping within values:

| Character | Escape sequence | Notes |
|-----------|----------------|-------|
| &#124; (pipe) | `\|` | Prevents confusion with column delimiter |
| `\` (backslash) | `\\` | Prevents ambiguity with escape sequences |
| newline | `\n` | Prevents breaking the row-per-line structure |
| carriage return | `\r` | Prevents breaking the row-per-line structure |

Escaping is applied in a single pass. No other characters are escaped. Unicode content (including emoji) is preserved as-is.

### Escaping Examples

In the table below, "Original value" refers to the raw in-memory string (e.g., `\n` means a real newline character, not a literal backslash-n).

| Original value | Encoded value |
|----------------|---------------|
| `hello` | `hello` |
| `a` &#124; `b` (value contains pipe) | `a\|b` |
| `path\to\file` (contains backslashes) | `path\\to\\file` |
| `line1` + newline + `line2` | `line1\nline2` |
| (empty string) | (empty) |
| (null) | (empty) |

## Constraints

- **Uniform keys**: All rows must have the same set of keys in the same order.
- **Flat values**: All values must be scalars (string, number, boolean, null). Nested objects or arrays must be flattened or stringified before encoding.
- **No commas in column names**: Column names containing commas are rejected.
- **Single-line rows**: Each row occupies exactly one line (newlines in values are escaped).

## Decoding Algorithm

```
1. Read the first line as the header.
2. Verify it starts with "## PSV|".
3. Split by "|" to extract: magic, columns_string, count_string.
4. Split columns_string by "," to get column names.
5. Parse count from count_string (strip " rows" suffix).
6. For each subsequent line:
   a. Split by "|" respecting escapes (unescaped pipes only).
   b. Unescape each value: \| → |, \\ → \, \n → newline, \r → CR.
   c. Map values to column names by position.
   d. Empty values may represent null or empty string (context-dependent).
```

## Full Example

**Input (JSON array):**

```json
[
  {"id": 1, "name": "Alice", "email": "alice@example.com", "active": true},
  {"id": 2, "name": "Bob", "email": "bob@example.com", "active": false},
  {"id": 3, "name": "Carol O'Brien", "email": "carol@example.com", "active": true}
]
```

**Output (PSV):**

```
## PSV|id,name,email,active|3 rows
1|Alice|alice@example.com|true
2|Bob|bob@example.com|false
3|Carol O'Brien|carol@example.com|true
```

**Token savings:** ~50% fewer tokens compared to minified JSON for typical datasets.
