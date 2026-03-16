const MIN_CHARS = 512;
const MIN_ITEMS = 5;
const SAMPLE_SIZE = 3;

export class Squeezer {
  constructor(private verbose: boolean) {}

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

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return text;
    }

    if (!Array.isArray(data) || data.length < MIN_ITEMS) {
      return JSON.stringify(data);
    }

    const keys = this.getUniformKeys(data);
    if (!keys) {
      if (this.verbose) {
        process.stderr.write(`[mcp-squeeze] id:${id} skip: non-uniform keys\n`);
      }
      return JSON.stringify(data);
    }

    try {
      const psv = this.toPSV(data, keys);
      if (this.verbose) {
        this.logStats(id, text.length, psv.length);
      }
      return psv;
    } catch {
      if (this.verbose) {
        process.stderr.write(`[mcp-squeeze] id:${id} skip: nested data detected\n`);
      }
      return JSON.stringify(data);
    }
  }

  private getUniformKeys(data: unknown[]): string[] | null {
    if (data.length === 0) return null;

    const first = data[0];
    if (typeof first !== 'object' || first === null || Array.isArray(first)) return null;

    const firstRec = first as Record<string, unknown>;
    const keys = Object.keys(firstRec);
    if (keys.length === 0) return null;

    const keyCount = keys.length;

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

  private toPSV(data: unknown[], keys: string[]): string {
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
        const val = rec[keys[k]];
        if (val !== null && val !== undefined && typeof val === 'object') {
          throw new Error('nested value');
        }
        const str = val === null || val === undefined ? '' : String(val);
        vals[k] = str.replace(/\|/g, '\\|');
      }
      rows.push(vals.join('|'));
    }

    return `${header}\n${rows.join('\n')}`;
  }

  private logStats(id: unknown, originalBytes: number, optimizedBytes: number): void {
    const ratio = Math.round((1 - optimizedBytes / originalBytes) * 100);
    const tokensSaved = Math.round((originalBytes - optimizedBytes) / 4);
    process.stderr.write(
      `[mcp-squeeze] id:${id} OPT ${originalBytes}B -> ${optimizedBytes}B (-${ratio}%) ~${tokensSaved} tokens saved\n`,
    );
  }
}
