import { BYTES_PER_TOKEN } from './stats.js';

const MIN_CHARS = 512;
const MIN_ITEMS = 5;
const MAX_FLATTEN_DEPTH = 3;

export type Format = 'psv' | 'md' | 'toon';

export interface SqueezerOptions {
  verbose?: boolean
  format?: Format
  stripEmpty?: boolean
  flatten?: boolean
  parseText?: boolean
  unwrapContent?: boolean
}

export class Squeezer {
  private verbose: boolean;
  private format: Format;
  private stripEmpty: boolean;
  private flatten: boolean;
  private parseText: boolean;
  private unwrapContent: boolean;

  private static readonly SEPARATORS: RegExp[] = [
    /\n[-=]{3,}\n/,       // Horizontal lines (---, ===)
    /\n\n+/,              // Double newlines (most universal)
    /\n(?=#+\s+)/,        // Markdown headers (lookahead)
  ];

  private static readonly KV_PATTERNS: RegExp[] = [
    /^[-*+]\s+(.+?):\s+(.+)$/,    // Bullets: - Key: Value, * Key: Value
    /^(.+?):\s+(.+)$/,            // Simple: Key: Value
    /^\*\*(.+?)\*\*:\s+(.+)$/,   // Bold: **Key**: Value
  ];

  private static readonly MIN_DENSITY = 0.6;

  constructor(opts: SqueezerOptions = {}) {
    this.verbose = opts.verbose ?? false;
    this.format = opts.format ?? 'psv';
    this.stripEmpty = opts.stripEmpty ?? true;
    this.flatten = opts.flatten ?? true;
    this.parseText = opts.parseText ?? true;
    this.unwrapContent = opts.unwrapContent ?? false;
  }

  process(line: string): string {
    try {
      if (!line.startsWith('{')) return line;
      if (!line.includes('"result"') || !line.includes('"content"')) return line;

      const packet = JSON.parse(line);
      const content = packet.result?.content;
      if (!Array.isArray(content)) return line;

      let changed = false;
      for (const item of content) {
        if (item.type !== 'text' || typeof item.text !== 'string') continue;
        const optimized = this.tryOptimize(item.text, packet.id);
        if (optimized !== item.text) {
          item.text = optimized;
          changed = true;
        }
      }

      // Unwrap single-text content: [{type:"text",text:"..."}] → "..."
      if (this.unwrapContent
        && content.length === 1
        && content[0].type === 'text'
        && typeof content[0].text === 'string') {
        packet.result.content = content[0].text;
        changed = true;
      }

      return changed ? JSON.stringify(packet) : line;
    } catch {
      return line;
    }
  }

  private tryOptimize(text: string, id: unknown): string {
    if (text.length < MIN_CHARS) return text;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not valid JSON — try structured text parsing
      if (this.parseText) {
        const records = this.tryParseStructuredText(text);
        if (records && records.length >= MIN_ITEMS) {
          return this.formatRecords(records, id, text.length, false);
        }
      }
      return text;
    }

    if (!Array.isArray(parsed) || parsed.length < MIN_ITEMS) {
      return JSON.stringify(parsed);
    }

    return this.formatRecords(parsed as Record<string, unknown>[], id, text.length, true);
  }

  private formatRecords(
    data: Record<string, unknown>[],
    id: unknown,
    originalLength: number,
    applyFlatten: boolean,
  ): string {
    let records: Record<string, unknown>[] = data;

    // Pre-processing: flatten nested objects via dot-notation
    if (applyFlatten && this.flatten) {
      const flattened = this.flattenObjects(records);
      if (flattened) records = flattened;
    }

    // Pre-processing: strip keys that are null/empty in ALL rows
    if (this.stripEmpty) {
      records = this.stripEmptyKeys(records);
    }

    const keys = this.getUniformKeys(records);
    if (!keys) {
      if (this.verbose) {
        process.stderr.write(`[mcp-squeeze] id:${id} skip: non-uniform keys\n`);
      }
      return JSON.stringify(records);
    }

    try {
      const formatted = this.format === 'md'
        ? this.toMarkdownTable(records, keys)
        : this.format === 'toon'
          ? this.toTOON(records, keys)
          : this.toPSV(records, keys);
      if (this.verbose) {
        this.logStats(id, originalLength, formatted.length);
      }
      return formatted;
    } catch {
      if (this.verbose) {
        process.stderr.write(`[mcp-squeeze] id:${id} skip: nested data detected\n`);
      }
      return JSON.stringify(records);
    }
  }

  private tryParseStructuredText(text: string): Record<string, string>[] | null {
    let bestResult: Record<string, string>[] | null = null;
    let maxScore = 0;

    for (const sep of Squeezer.SEPARATORS) {
      const sections = text.split(sep).map(s => s.trim()).filter(s => s.length > 10);
      if (sections.length < MIN_ITEMS) continue;

      for (const pattern of Squeezer.KV_PATTERNS) {
        const { records, keySets } = this.extractTextRecords(sections, pattern);
        if (records.length < MIN_ITEMS) continue;

        const commonKeys = this.intersectKeys(keySets);
        if (commonKeys.length < 2) continue;

        const score = records.length * commonKeys.length;
        if (score > maxScore) {
          maxScore = score;
          bestResult = records.map(r => {
            const normalized: Record<string, string> = {};
            for (const k of commonKeys) normalized[k] = r[k] ?? '';
            return normalized;
          });
        }
      }
    }

    return bestResult;
  }

  private extractTextRecords(
    sections: string[],
    pattern: RegExp,
  ): { records: Record<string, string>[]; keySets: Set<string>[] } {
    const records: Record<string, string>[] = [];
    const keySets: Set<string>[] = [];

    for (const section of sections) {
      const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      const record: Record<string, string> = {};
      let kvCount = 0;

      for (const line of lines) {
        const match = line.match(pattern);
        if (match) {
          record[match[1].trim()] = match[2].trim();
          kvCount++;
        }
      }

      // Density check: ≥60% of lines must match KV pattern
      if (kvCount > 0 && kvCount / lines.length >= Squeezer.MIN_DENSITY) {
        records.push(record);
        keySets.push(new Set(Object.keys(record)));
      }
    }

    return { records, keySets };
  }

  private intersectKeys(keySets: Set<string>[]): string[] {
    if (keySets.length === 0) return [];
    const common = new Set(keySets[0]);
    for (let i = 1; i < keySets.length; i++) {
      for (const key of common) {
        if (!keySets[i].has(key)) common.delete(key);
      }
    }
    return [...common];
  }

  private stripEmptyKeys(data: Record<string, unknown>[]): Record<string, unknown>[] {
    if (data.length === 0) return data;

    // Collect keys from ALL rows (not just first) to handle non-uniform sets
    const allKeysSet = new Set<string>();
    for (const row of data) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) return data;
      for (const key of Object.keys(row)) {
        allKeysSet.add(key);
      }
    }
    const allKeys = [...allKeysSet];
    if (allKeys.length === 0) return data;

    // Find keys that are null/undefined/"" in ALL rows
    const emptyKeys = new Set<string>();
    for (const key of allKeys) {
      let allEmpty = true;
      for (const row of data) {
        const val = (row as Record<string, unknown>)[key];
        if (val !== null && val !== undefined && val !== '') {
          allEmpty = false;
          break;
        }
      }
      if (allEmpty) emptyKeys.add(key);
    }

    if (emptyKeys.size === 0) return data;

    return data.map((row) => {
      const rec = row as Record<string, unknown>;
      const cleaned: Record<string, unknown> = {};
      for (const key of Object.keys(rec)) {
        if (!emptyKeys.has(key)) cleaned[key] = rec[key];
      }
      return cleaned;
    });
  }

  private flattenObjects(data: Record<string, unknown>[]): Record<string, unknown>[] | null {
    let hasNested = false;
    for (const row of data) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
      for (const val of Object.values(row)) {
        if (val !== null && val !== undefined && typeof val === 'object') {
          hasNested = true;
          break;
        }
      }
      if (hasNested) break;
    }
    if (!hasNested) return null; // nothing to flatten

    const result: Record<string, unknown>[] = [];
    for (const row of data) {
      const flat = this.flattenObject(row as Record<string, unknown>, '', 0);
      if (!flat) return null;
      result.push(flat);
    }
    return result;
  }

  private flattenObject(
    obj: Record<string, unknown>,
    prefix: string,
    depth: number,
  ): Record<string, unknown> | null {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (val === null || val === undefined || typeof val !== 'object') {
        if (fullKey in result) return null; // key collision
        result[fullKey] = val;
      } else if (Array.isArray(val)) {
        // Arrays: stringify as JSON
        if (fullKey in result) return null;
        result[fullKey] = JSON.stringify(val);
      } else if (depth < MAX_FLATTEN_DEPTH) {
        const nested = this.flattenObject(val as Record<string, unknown>, fullKey, depth + 1);
        if (!nested) return null;
        for (const [nk, nv] of Object.entries(nested)) {
          if (nk in result) return null; // key collision
          result[nk] = nv;
        }
      } else {
        // Beyond depth limit: stringify as JSON
        if (fullKey in result) return null;
        result[fullKey] = JSON.stringify(val);
      }
    }
    return result;
  }

  private getUniformKeys(data: unknown[]): string[] | null {
    if (data.length === 0) return null;

    const first = data[0];
    if (typeof first !== 'object' || first === null || Array.isArray(first)) return null;

    const firstRec = first as Record<string, unknown>;
    const keys = Object.keys(firstRec);
    if (keys.length === 0) return null;

    const keyCount = keys.length;

    // Reject keys containing comma (would break PSV/TOON header parsing)
    for (const key of keys) {
      if (key.includes(',')) return null;
    }

    // Validate ALL items for uniform shape and flat values
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
      const rec = item as Record<string, unknown>;
      if (Object.keys(rec).length !== keyCount) return null;
      for (const key of keys) {
        if (!(key in rec)) return null;
        const val = rec[key];
        if (val !== null && val !== undefined && typeof val === 'object') return null;
      }
    }

    return keys;
  }

  private extractRowValues(
    data: Record<string, unknown>[],
    keys: string[],
    encode: (val: unknown) => string,
  ): string[][] {
    const keyCount = keys.length;
    const result: string[][] = [];

    for (const item of data) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new Error('non-object row');
      }
      const rec = item as Record<string, unknown>;
      if (Object.keys(rec).length !== keyCount) throw new Error('key count mismatch');
      const vals = new Array<string>(keyCount);
      for (let k = 0; k < keyCount; k++) {
        if (!(keys[k] in rec)) throw new Error('key mismatch');
        const val = rec[keys[k]];
        if (val !== null && val !== undefined && typeof val === 'object') {
          throw new Error('nested value');
        }
        vals[k] = encode(val);
      }
      result.push(vals);
    }

    return result;
  }

  private static psvEncode(val: unknown): string {
    const str = val === null || val === undefined ? '' : String(val);
    return str.replace(/[\\|\r\n]/g, (ch) => {
      if (ch === '\\') return '\\\\';
      if (ch === '|') return '\\|';
      if (ch === '\r') return '\\r';
      return '\\n';
    });
  }

  private static mdEncode(val: unknown): string {
    const str = val === null || val === undefined ? '' : String(val);
    return str.replace(/[\\|\r\n]/g, (ch) => {
      if (ch === '\\') return '\\\\';
      if (ch === '|') return '\\|';
      return ' '; // \r and \n become space
    });
  }

  private toPSV(data: Record<string, unknown>[], keys: string[]): string {
    const header = `## PSV|${keys.join(',')}|${data.length} rows`;
    const rows = this.extractRowValues(data, keys, Squeezer.psvEncode);
    return `${header}\n${rows.map(v => v.join('|')).join('\n')}`;
  }

  private toMarkdownTable(data: Record<string, unknown>[], keys: string[]): string {
    const headerRow = `| ${keys.join(' | ')} |`;
    const separatorRow = `|${keys.map(() => '---').join('|')}|`;
    const rows = this.extractRowValues(data, keys, Squeezer.mdEncode);
    return `${headerRow}\n${separatorRow}\n${rows.map(v => `| ${v.join(' | ')} |`).join('\n')}`;
  }

  private toTOON(data: Record<string, unknown>[], keys: string[]): string {
    const header = `[${data.length}]{${keys.join(',')}}:`;
    const rows = this.extractRowValues(data, keys, this.toonEncodeValue);
    return `${header}\n${rows.map(v => `  ${v.join(',')}`).join('\n')}`;
  }

  // Pipe (`|`) is intentionally NOT quoted here — it is not a delimiter in
  // TOON (comma-separated), so it can appear in values as a literal character
  // without causing ambiguity.
  private toonEncodeValue(val: unknown): string {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return String(val);

    const str = String(val);
    if (str === '') return '""';

    // Quote if value could be ambiguous or contains special chars
    const needsQuote = str === 'true' || str === 'false' || str === 'null'
      || /^-?\d/.test(str)
      || /[,:"\\[\]{}\r\n\t]/.test(str)
      || str !== str.trim();

    if (!needsQuote) return str;

    return '"' + str.replace(/["\\\r\n\t]/g, (ch) => {
      if (ch === '"') return '\\"';
      if (ch === '\\') return '\\\\';
      if (ch === '\r') return '\\r';
      if (ch === '\n') return '\\n';
      return '\\t';
    }) + '"';
  }

  private logStats(id: unknown, originalBytes: number, optimizedBytes: number): void {
    const ratio = Math.round((1 - optimizedBytes / originalBytes) * 100);
    const tokensSaved = Math.round((originalBytes - optimizedBytes) / BYTES_PER_TOKEN);
    const sign = ratio >= 0 ? '-' : '+';
    const tokensLabel = tokensSaved >= 0
      ? `~${tokensSaved} tokens saved`
      : `~${Math.abs(tokensSaved)} tokens added`;
    process.stderr.write(
      `[mcp-squeeze] id:${id} OPT ${originalBytes}B -> ${optimizedBytes}B (${sign}${Math.abs(ratio)}%) ${tokensLabel}\n`,
    );
  }
}
