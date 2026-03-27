# PSV (Pipe-Separated Values) Format Specification

**Version:** 1.0
**Status:** Stable

PSV is a compact tabular text format designed for token-efficient data transfer between MCP servers and LLM clients. It encodes uniform arrays of flat objects as a single header line followed by pipe-delimited data rows.

## Structure

A PSV document consists of exactly one **header line** followed by zero or more **data rows**, separated by newline (`\n`) characters.

```
## PSV|col1,col2,col3
val1|val2|val3
val4|val5|val6
```

## Header

```
## PSV|<columns>
```

| Component | Description |
|-----------|-------------|
| `## PSV` | Fixed magic prefix identifying the format |
| `<columns>` | Comma-separated list of column names (no spaces) |

Column names must not contain commas. The header is always a single line.

**Example:**

```
## PSV|id,name,email,active
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

Escaping is a **per-character substitution** (lookup table): each input character maps to exactly one output independently. Because no input character matches more than one rule, the order of replacement rules does not affect the result — implementors in any language can apply the rules in any order or as a single-pass table lookup. No other characters are escaped. Unicode content (including emoji) is preserved as-is.

### Escaping Examples

In the table below, "Original value" refers to the raw in-memory string (e.g., `\n` means a real newline character, not a literal backslash-n).

| Original value | Encoded value |
|----------------|---------------|
| `hello` | `hello` |
| `a` &#124; `b` (value contains pipe) | `a\|b` |
| `path\to\file` (contains backslashes) | `path\\to\\file` |
| `line1` + newline + `line2` | `line1\nline2` |
| `foo\|bar` (backslash then pipe) | `foo\\\|bar` |
| `🎉 emoji` | `🎉 emoji` |
| (empty string) | (empty) |
| (null) | (empty) |

## Constraints

- **Uniform keys**: All rows must have the same set of keys in the same order.
- **Flat values**: All values must be scalars (string, number, boolean, null). Nested objects or arrays must be flattened or stringified before encoding.
- **No commas or pipes in column names**: Column names containing `,` or `|` are rejected.
- **Single-line rows**: Each row occupies exactly one line (newlines in values are escaped).

## Decoding Algorithm

```
1. Read the first line as the header.
2. Verify it starts with "## PSV|".
3. Extract everything after "## PSV|" as columns_string.
4. Split columns_string by "," to get column names.
5. For each subsequent non-empty line:
   a. Split by unescaped "|" only. Scan character-by-character:
      - If current char is "\" and next char exists, consume both
        as a pair (escaped content) and advance by 2.
      - If current char is "|", end the current field and start a new one.
      - Otherwise, append the character to the current field.
   b. Unescape each field value character-by-character:
      \| → |, \\ → \, \n → newline, \r → CR.
      Unknown escape sequences (e.g. \t) SHOULD be preserved literally.
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
## PSV|id,name,email,active
1|Alice|alice@example.com|true
2|Bob|bob@example.com|false
3|Carol O'Brien|carol@example.com|true
```

**Token savings:** ~50% fewer tokens compared to minified JSON for typical datasets.

## Edge Cases

### CRLF normalization

Encoders SHOULD normalize `\r\n` (CRLF) sequences to `\n` (LF) before escaping. This prevents CRLF from producing two separate escape sequences (`\r\n`) when a single `\n` is sufficient. Decoders should handle both `\r` and `\n` escape sequences regardless.

### Backslash before pipe

When a raw value contains `\|` (backslash followed by pipe), both characters are escaped independently: `\` → `\\`, `|` → `\|`, producing `\\\|` in the output. Decoders must process escape sequences left-to-right: `\\` is consumed as a literal backslash, then `\|` as a literal pipe.

Conversely, `\\|` in encoded output means: `\\` (literal backslash) followed by `|` (column delimiter) — this splits into two columns.

### Empty dataset

A PSV document with a header and zero data rows is valid:

```
## PSV|id,name,email
```

### Unicode

All Unicode content (emoji, CJK, diacritics, RTL text) is preserved as-is without escaping.
