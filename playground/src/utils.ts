const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).byteLength;
}
