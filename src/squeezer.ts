const MIN_CHARS = 512;
const MIN_ITEMS = 5;
const SAMPLE_SIZE = 3;
const MAX_FLATTEN_DEPTH = 3;

export type Format = 'psv' | 'md';

export interface SqueezerOptions {
  verbose?: boolean;
  format?: Format;
  stripEmpty?: boolean;
  flatten?: boolean;
}

export class Squeezer {
  private verbose: boolean;
  private format: Format;
  private stripEmpty: boolean;
  private flatten: boolean;

  constructor(opts: SqueezerOptions) {
    this.verbose = opts.verbose ?? false;
    this.format = opts.format ?? 'psv';
    this.stripEmpty = opts.stripEmpty ?? true;
    this.flatten = opts.flatten ?? true;
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
      return text;
    }

    if (!Array.isArray(parsed) || parsed.length < MIN_ITEMS) {
      return JSON.stringify(parsed);
    }

    let data: unknown[] = parsed;

    // Pre-processing: strip keys that are null/empty in ALL rows
    if (this.stripEmpty) {
      data = this.stripEmptyKeys(data as Record<string, unknown>[]);
    }

    // Pre-processing: flatten nested objects via dot-notation
    if (this.flatten) {
      const flattened = this.flattenObjects(data as Record<string, unknown>[]);
      if (flattened) data = flattened;
    }

    // Second pass: strip keys that became null/empty after flattening
    if (this.stripEmpty && this.flatten) {
      data = this.stripEmptyKeys(data as Record<string, unknown>[]);
    }

    const keys = this.getUniformKeys(data);
    if (!keys) {
      if (this.verbose) {
        process.stderr.write(`[mcp-squeeze] id:${id} skip: non-uniform keys\n`);
      }
      return JSON.stringify(data);
    }

    try {
      const formatted = this.format === 'md'
        ? this.toMarkdownTable(data as Record<string, unknown>[], keys)
        : this.toPSV(data as Record<string, unknown>[], keys);
      if (this.verbose) {
        this.logStats(id, text.length, formatted.length);
      }
      return formatted;
    } catch {
      if (this.verbose) {
        process.stderr.write(`[mcp-squeeze] id:${id} skip: nested data detected\n`);
      }
      return JSON.stringify(data);
    }
  }

  private stripEmptyKeys(data: Record<string, unknown>[]): Record<string, unknown>[] {
    if (data.length === 0) return data;
    const first = data[0];
    if (typeof first !== 'object' || first === null || Array.isArray(first)) return data;

    const allKeys = Object.keys(first);
    if (allKeys.length === 0) return data;

    // Find keys that are null/undefined/"" in ALL rows
    const emptyKeys = new Set<string>();
    for (const key of allKeys) {
      let allEmpty = true;
      for (const row of data) {
        if (typeof row !== 'object' || row === null || Array.isArray(row)) return data;
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

    // Reject keys containing comma (would break PSV header parsing)
    for (const key of keys) {
      if (key.includes(',')) return null;
    }

    // Check all values in first item are flat
    for (const key of keys) {
      const val = firstRec[key];
      if (val !== null && val !== undefined && typeof val === 'object') return null;
    }

    // Sample-check remaining items for uniform shape (perf trade-off: full
    // validation happens in toPSV, mismatches there fall back to minified JSON)
    const limit = Math.min(SAMPLE_SIZE, data.length);
    for (let i = 1; i < limit; i++) {
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

  private toPSV(data: Record<string, unknown>[], keys: string[]): string {
    const header = `## PSV|${keys.join(',')}|${data.length} rows`;
    const rows: string[] = [];

    const keyCount = keys.length;

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
        const str = val === null || val === undefined ? '' : String(val);
        vals[k] = str.replace(/[\\|\r\n]/g, (ch) => {
          if (ch === '\\') return '\\\\';
          if (ch === '|') return '\\|';
          if (ch === '\r') return '\\r';
          return '\\n';
        });
      }
      rows.push(vals.join('|'));
    }

    return `${header}\n${rows.join('\n')}`;
  }

  private toMarkdownTable(data: Record<string, unknown>[], keys: string[]): string {
    const keyCount = keys.length;

    const headerRow = `| ${keys.join(' | ')} |`;
    const separatorRow = `|${keys.map(() => '---').join('|')}|`;
    const rows: string[] = [];

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
        const str = val === null || val === undefined ? '' : String(val);
        vals[k] = str.replace(/[\\|\r\n]/g, (ch) => {
          if (ch === '\\') return '\\\\';
          if (ch === '|') return '\\|';
          return ' '; // \r and \n become space
        });
      }
      rows.push(`| ${vals.join(' | ')} |`);
    }

    return `${headerRow}\n${separatorRow}\n${rows.join('\n')}`;
  }

  private logStats(id: unknown, originalBytes: number, optimizedBytes: number): void {
    const ratio = Math.round((1 - optimizedBytes / originalBytes) * 100);
    const tokensSaved = Math.round((originalBytes - optimizedBytes) / 4);
    const sign = ratio >= 0 ? '-' : '+';
    process.stderr.write(
      `[mcp-squeeze] id:${id} OPT ${originalBytes}B -> ${optimizedBytes}B (${sign}${Math.abs(ratio)}%) ~${tokensSaved} tokens saved\n`,
    );
  }
}
