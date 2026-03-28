/**
 * PSV (Pipe-Separated Values) decoder.
 *
 * Implemented strictly from PSV_SPEC.md — does not reference encoder internals.
 * Used as a test utility to validate the spec via round-trip tests.
 */

const MAGIC = '## PSV|';

/**
 * Split a PSV data row by unescaped pipe characters.
 * Scans char-by-char: a `|` preceded by an even number of backslashes
 * (including zero) is a delimiter; otherwise it is escaped content.
 */
function splitRow(line: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) {
      // Consume the escape pair as-is; unescape happens later
      cur += ch + line[i + 1];
      i += 2;
    } else if (ch === '|') {
      parts.push(cur);
      cur = '';
      i++;
    } else {
      cur += ch;
      i++;
    }
  }
  parts.push(cur);
  return parts;
}

/**
 * Unescape a single PSV value according to the spec:
 *   \| → |    \\ → \    \n → newline    \r → CR
 */
function unescape(val: string): string {
  let out = '';
  let i = 0;
  const escapeMap: Record<string, string> = {
    '|': '|',
    '\\': '\\',
    'n': '\n',
    'r': '\r',
  };
  while (i < val.length) {
    if (val[i] === '\\' && i + 1 < val.length) {
      const replacement = escapeMap[val[i + 1]];
      if (replacement !== undefined) {
        out += replacement;
        i += 2;
        continue;
      }
      // Unknown escape — preserve literally (spec only defines the four above)
      out += val[i];
      i++;
    } else {
      out += val[i];
      i++;
    }
  }
  return out;
}

/**
 * Decode a PSV-formatted string into an array of objects.
 *
 * Each object maps column names (from the header) to string values.
 * Empty values are returned as empty strings — the caller decides
 * whether to interpret them as null.
 *
 * @throws {Error} If the header is missing or malformed.
 */
export function decodePSV(input: string): Record<string, string>[] {
  const lines = input.split('\n');
  const header = lines[0];

  if (!header || !header.startsWith(MAGIC)) {
    throw new Error(`Invalid PSV: header must start with "${MAGIC}"`);
  }

  // Header: "## PSV|col1,col2,col3"
  // The first pipe separates the magic from the column list.
  const columnsStr = header.slice(MAGIC.length);
  const columns = columnsStr.split(',');

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') continue; // skip trailing empty line

    const values = splitRow(line);
    if (values.length !== columns.length) {
      throw new Error(
        `Row ${i} has ${values.length} values but header defines ${columns.length} columns`,
      );
    }

    const row: Record<string, string> = {};
    for (let j = 0; j < columns.length; j++) {
      row[columns[j]] = unescape(values[j]);
    }
    rows.push(row);
  }

  return rows;
}
