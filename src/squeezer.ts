import { BYTES_PER_TOKEN } from './stats.js';

const MIN_CHARS = 512;
const MIN_ITEMS = 3;
const MAX_FLATTEN_DEPTH = 3;

type Row = Record<string, unknown>;

function isPlainObject(val: unknown): val is Row {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isRowArray(data: unknown[]): data is Row[] {
  return data.every(isPlainObject);
}

function isPackableArray(data: unknown): data is Row[] {
  return Array.isArray(data) && data.length >= MIN_ITEMS && isRowArray(data);
}

function isEmpty(val: unknown): boolean {
  return val === null || val === undefined || val === '';
}

function encodeSpecialChars(
  str: string,
  newlineReplacement: (ch: string) => string,
): string {
  // Normalize \r\n to \n first so it produces a single replacement, not two
  return str.replace(/\r\n/g, '\n').replace(/[\\|\r\n]/g, (ch) => {
    if (ch === '\\') return '\\\\';
    if (ch === '|') return '\\|';
    return newlineReplacement(ch);
  });
}

export type Format = 'psv' | 'md' | 'toon';

export interface PackOptions {
  format?: Format
  stripEmpty?: boolean
  flatten?: boolean
  parseText?: boolean
  verbose?: boolean
}

export interface SqueezerOptions extends PackOptions {
  unwrapContent?: boolean
}

interface TextRecord {
  keySets: Set<string>[]
  records: Record<string, string>[]
}

/** A regex pattern for matching horizontal lines (e.g., ---, ===) */
const HORIZONTAL_LINE_REGEX = /\n[-=]{3,}\n/;

/** A regex pattern for matching double newlines (most universal) */
const DOUBLE_NEWLINE_REGEX = /\n\n+/;

/** A regex pattern for matching Markdown headers (lookahead) */
const MARKDOWN_HEADER_REGEX = /\n(?=#+\s+)/;

export class Squeezer {
  private verbose: boolean;
  private format: Format;
  private stripEmpty: boolean;
  private flatten: boolean;
  private parseText: boolean;
  private unwrapContent: boolean;

  private static readonly SEPARATORS: RegExp[] = [
    HORIZONTAL_LINE_REGEX,
    DOUBLE_NEWLINE_REGEX,
    MARKDOWN_HEADER_REGEX,
  ];

  private static readonly KV_PATTERNS: RegExp[] = [
    /^[-*+]\s+(.+?):\s+(.+)$/, // Bullets: - Key: Value, * Key: Value
    /^(.+?):\s+(.+)$/, // Simple: Key: Value
    /^\*\*(.+?)\*\*:\s+(.+)$/, // Bold: **Key**: Value
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

  /**
   * Pack structured data (array of objects) into a compact format.
   * Returns the original data as minified JSON if compression is not applicable.
   */
  packData(data: unknown): string {
    try {
      // ?? fallback handles undefined/Symbol/function inputs where JSON.stringify returns undefined
      if (!isPackableArray(data)) return JSON.stringify(data) ?? String(data);
      const json = JSON.stringify(data);
      return this.formatRecords(data, null, json.length, json, true);
    } catch {
      try {
        // ?? fallback: JSON.stringify returns undefined for non-serializable inputs
        return JSON.stringify(data) ?? String(data);
      } catch {
        return String(data);
      }
    }
  }

  /**
   * Pack raw text (structured KV patterns) into a compact format.
   * Returns the original text if no structure is detected.
   */
  packText(text: string): string {
    return this.tryOptimize(text, null);
  }

  /**
   * Process a JSON-RPC line (MCP protocol). Used in proxy mode.
   * Assumes single-line JSON input (no multi-line formatting).
   */
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
        if (item.text.length < MIN_CHARS) continue;
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not valid JSON — try structured text parsing
      if (this.parseText) {
        const records = this.tryParseStructuredText(text);
        if (records && records.length >= MIN_ITEMS) {
          return this.formatRecords(records, id, text.length, null, false);
        }
      }
      return text;
    }

    if (!isPackableArray(parsed)) {
      const minified = JSON.stringify(parsed);
      return minified !== undefined && minified.length < text.length ? minified : text;
    }

    return this.formatRecords(parsed, id, text.length, null, true);
  }

  private formatRecords(
    data: Row[],
    id: unknown,
    originalLength: number,
    dataJson: string | null,
    applyFlatten: boolean,
  ): string {
    // Keep original JSON for fallback (before any mutations)
    const fallbackJson = dataJson ?? JSON.stringify(data);
    let records: Row[] = data;

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
        process.stderr.write(`[tokpack] id:${id} skip: non-uniform keys\n`);
      }
      return fallbackJson;
    }

    try {
      let formatted: string;
      switch (this.format) {
        case 'md':
          formatted = this.toMarkdownTable(records, keys);
          break;
        case 'toon':
          formatted = this.toTOON(records, keys);
          break;
        default:
          formatted = this.toPSV(records, keys);
          break;
      }
      if (formatted.length >= originalLength) return fallbackJson;
      if (this.verbose) {
        this.logStats(id, originalLength, formatted.length);
      }
      return formatted;
    } catch {
      if (this.verbose) {
        process.stderr.write(`[tokpack] id:${id} skip: nested data detected\n`);
      }
      return fallbackJson;
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
          bestResult = records.map((r) => {
            const normalized: Record<string, string> = {};
            for (const k of commonKeys) {
              normalized[k] = r[k] ?? '';
            }
            return normalized;
          });
        }
      }
    }

    return bestResult;
  }

  private extractTextRecords(sections: string[], pattern: RegExp): TextRecord {
    const records: Record<string, string>[] = [];
    const keySets: Set<string>[] = [];

    for (const section of sections) {
      const lines = section
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

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

  private stripEmptyKeys(data: Row[]): Row[] {
    if (data.length === 0) return data;

    const allKeys = new Set<string>();
    for (const row of data) {
      for (const key of Object.keys(row)) allKeys.add(key);
    }
    if (allKeys.size === 0) return data;

    const emptyKeys = new Set<string>();
    for (const key of allKeys) {
      if (data.every(row => isEmpty(row[key]))) emptyKeys.add(key);
    }
    if (emptyKeys.size === 0) return data;

    return data.map((row) => {
      const cleaned: Row = {};
      for (const key of Object.keys(row)) {
        if (!emptyKeys.has(key)) cleaned[key] = row[key];
      }
      return cleaned;
    });
  }

  private flattenObjects(data: Row[]): Row[] | null {
    const hasNested = data.some(row =>
      Object.values(row).some(val => typeof val === 'object' && val !== null),
    );
    if (!hasNested) return null;

    const result: Row[] = [];
    for (const row of data) {
      const flat = this.flattenObject(row, '', 0);
      if (!flat) return null;
      result.push(flat);
    }
    return result;
  }

  private flattenObject(
    obj: Row,
    prefix: string,
    depth: number,
  ): Row | null {
    const result: Row = {};

    const setKey = (k: string, v: unknown): boolean => {
      if (k in result) return false; // key collision
      result[k] = v;
      return true;
    };

    for (const [key, val] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (isPlainObject(val) && depth < MAX_FLATTEN_DEPTH) {
        const nested = this.flattenObject(val, fullKey, depth + 1);
        if (!nested) return null;
        for (const [nk, nv] of Object.entries(nested)) {
          if (!setKey(nk, nv)) return null;
        }
      } else if (isPlainObject(val) || Array.isArray(val)) {
        if (!setKey(fullKey, JSON.stringify(val))) return null;
      } else {
        if (!setKey(fullKey, val)) return null;
      }
    }
    return result;
  }

  private getUniformKeys(data: Row[]): string[] | null {
    if (data.length === 0) return null;

    const keys = Object.keys(data[0]);
    if (keys.length === 0) return null;
    if (this.format === 'psv' && keys.some(k => /[,|]/.test(k))) return null;
    if (this.format === 'md' && keys.some(k => k.includes('|'))) return null;
    if (this.format === 'toon' && keys.some(k => /[,{}:]/.test(k))) return null;

    const keyCount = keys.length;
    for (const rec of data) {
      if (Object.keys(rec).length !== keyCount) return null;
      for (const key of keys) {
        if (!(key in rec)) return null;
        if (typeof rec[key] === 'object' && !isEmpty(rec[key])) return null;
      }
    }

    return keys;
  }

  /** Extract row values. Assumes data is pre-validated by getUniformKeys(). */
  private extractRowValues(
    data: Row[],
    keys: string[],
    encode: (val: unknown) => string,
  ): string[][] {
    const keyCount = keys.length;
    const result: string[][] = [];

    for (const rec of data) {
      const vals = new Array<string>(keyCount);
      for (let k = 0; k < keyCount; k++) {
        vals[k] = encode(rec[keys[k]]);
      }
      result.push(vals);
    }

    return result;
  }

  private static psvEncode(val: unknown): string {
    const str = isEmpty(val) ? '' : String(val);
    return encodeSpecialChars(str, ch => ch === '\r' ? '\\r' : '\\n');
  }

  private static mdEncode(val: unknown): string {
    const str = isEmpty(val) ? '' : String(val);
    return encodeSpecialChars(str, () => ' ');
  }

  private toPSV(data: Row[], keys: string[]): string {
    const header = `## PSV|${keys.join(',')}`;
    const rows = this.extractRowValues(data, keys, Squeezer.psvEncode);
    return `${header}\n${rows.map(v => v.join('|')).join('\n')}`;
  }

  private toMarkdownTable(data: Row[], keys: string[]): string {
    const headerRow = `| ${keys.join(' | ')} |`;
    const separatorRow = `|${keys.map(() => '---').join('|')}|`;
    const rows = this.extractRowValues(data, keys, Squeezer.mdEncode);
    return `${headerRow}\n${separatorRow}\n${rows.map(v => `| ${v.join(' | ')} |`).join('\n')}`;
  }

  private toTOON(data: Row[], keys: string[]): string {
    const header = `[${data.length}]{${keys.join(',')}}:`;
    const rows = this.extractRowValues(data, keys, Squeezer.toonEncodeValue);
    return `${header}\n${rows.map(v => `  ${v.join(',')}`).join('\n')}`;
  }

  // Pipe (`|`) is intentionally NOT quoted here — it is not a delimiter in
  // TOON (comma-separated), so it can appear in values as a literal character
  // without causing ambiguity.
  private static toonEncodeValue(val: unknown): string {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return String(val);

    const str = String(val);
    if (str === '') return '""';

    // Quote if value could be ambiguous or contains special chars
    const needsQuote = str === 'true'
      || str === 'false'
      || str === 'null'
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
      `[tokpack] id:${id} OPT ${originalBytes}B -> ${optimizedBytes}B (${sign}${Math.abs(ratio)}%) ${tokensLabel}\n`,
    );
  }
}
