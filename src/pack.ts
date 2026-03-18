import { Squeezer, type Format, type PackOptions } from './squeezer.js';

export type { Format, PackOptions };

/**
 * Pack structured data (array of objects) into a token-efficient format.
 *
 * @param data - Array of uniform objects to compress
 * @param options - Format and processing options
 * @returns Compressed string (PSV, Markdown table, or TOON) or minified JSON if not compressible
 *
 * @example
 * ```ts
 * import { pack } from 'tokpack';
 *
 * const users = [
 *   { id: 1, name: 'Alice', role: 'admin' },
 *   { id: 2, name: 'Bob', role: 'user' },
 *   // ... 5+ items for compression to kick in
 * ];
 *
 * pack(users);
 * // => "## PSV|id,name,role|2 rows\n1|Alice|admin\n2|Bob|user"
 *
 * pack(users, { format: 'md' });
 * // => "| id | name | role |\n|---|---|---|\n| 1 | Alice | admin |..."
 * ```
 */
export function pack(data: unknown, options?: PackOptions): string {
  const sq = new Squeezer(options);
  return sq.packData(data);
}

/**
 * Pack raw text or JSON string into a token-efficient format.
 * Attempts JSON parsing first; falls back to structured text heuristics
 * (Key: Value patterns, markdown bold, bullet lists).
 *
 * @param text - Raw text or JSON string to compress
 * @param options - Format and processing options
 * @returns Compressed string or original text if no structure detected
 *
 * @example
 * ```ts
 * import { packRaw } from 'tokpack';
 *
 * // JSON string
 * packRaw('[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"},...]');
 *
 * // Structured text (Key: Value)
 * packRaw("- Title: React\n- Score: 83\n----------\n- Title: Vue\n- Score: 91\n...");
 * ```
 */
export function packRaw(text: string, options?: PackOptions): string {
  const sq = new Squeezer(options);
  return sq.packText(text);
}

/**
 * Create a reusable packer with fixed options.
 * More efficient than calling pack()/packRaw() repeatedly with same options.
 *
 * @example
 * ```ts
 * import { createPacker } from 'tokpack';
 *
 * const packer = createPacker({ format: 'toon', flatten: true });
 * packer.pack(data1);
 * packer.packRaw(text1);
 * ```
 */
export function createPacker(options?: PackOptions) {
  const sq = new Squeezer(options);
  return {
    pack: (data: unknown) => sq.packData(data),
    packRaw: (text: string) => sq.packText(text),
  };
}
