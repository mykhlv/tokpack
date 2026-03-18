import { StringDecoder } from 'node:string_decoder';
import { Squeezer } from './squeezer.js';
import { createPacker } from './pack.js';
import { appendStat } from './stats.js';
import { MAX_LINE_LENGTH, type ResolvedOptions } from './cli.js';

export function createMcpLineProcessor(opts: ResolvedOptions) {
  const squeezer = new Squeezer(opts);
  return (raw: string): string => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.length > MAX_LINE_LENGTH) {
      if (opts.verbose) {
        process.stderr.write(`[tokpack] skip: line exceeds ${MAX_LINE_LENGTH} chars\n`);
      }
      return line;
    }
    const result = squeezer.process(line);
    if (result !== line) {
      appendStat(Buffer.byteLength(line), Buffer.byteLength(result));
    }
    return result;
  };
}

export function createPipeLineProcessor(opts: ResolvedOptions) {
  const packer = createPacker(opts);
  return (raw: string): string => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.length > MAX_LINE_LENGTH || line.length === 0) return line;
    const result = packer.packRaw(line);
    if (result !== line) {
      appendStat(Buffer.byteLength(line), Buffer.byteLength(result));
    }
    return result;
  };
}

export function processStream(
  input: NodeJS.ReadableStream,
  lineProcessor: (raw: string) => string,
  opts: ResolvedOptions,
  onEnd: () => void,
): void {
  if (opts.disabled) {
    input.pipe(process.stdout);
    input.on('end', onEnd);
    return;
  }

  const decoder = new StringDecoder('utf8');
  let buffer = '';

  const emitLine = (raw: string): void => {
    process.stdout.write(lineProcessor(raw) + '\n');
  };

  input.on('data', (chunk: Buffer) => {
    buffer += decoder.write(chunk);

    if (!buffer.includes('\n') && buffer.length > MAX_LINE_LENGTH) {
      emitLine(buffer);
      buffer = '';
      return;
    }

    const lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const raw of lines) {
      emitLine(raw);
    }
  });

  input.on('end', () => {
    buffer += decoder.end();
    if (buffer.length > 0) {
      emitLine(buffer);
    }
    onEnd();
  });
}
