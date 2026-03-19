import type { Format } from './squeezer.js';

export const MAX_LINE_LENGTH = 10 * 1024 * 1024; // 10MB

export interface ParsedArgs {
  ownArgs: string[]
  sepIndex: number
  isMcpMode: boolean
  hasChildCommand: boolean
  isPipe: boolean
  childArgs: string[]
  opts: ResolvedOptions
  flagValue: (flag: string) => string | undefined
  hasFlag: (...flags: string[]) => boolean
}

export interface ResolvedOptions {
  disabled: boolean
  verbose: boolean
  format: Format
  stripEmpty: boolean
  flatten: boolean
  parseText: boolean
  unwrapContent: boolean
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const sepIndex = args.indexOf('--');
  const ownArgs = sepIndex === -1 ? args : args.slice(0, sepIndex);

  function flagValue(flag: string): string | undefined {
    const idx = ownArgs.indexOf(flag);
    if (idx === -1) return undefined;
    const next = ownArgs[idx + 1];
    if (next === undefined || next.startsWith('-')) return undefined;
    return next;
  }

  function hasFlag(...flags: string[]): boolean {
    return flags.some(f => ownArgs.includes(f));
  }

  function resolveFormat(): Format {
    const raw = flagValue('--format');
    if (raw && raw !== 'psv' && raw !== 'md' && raw !== 'toon') {
      process.stderr.write(`[tokpack] unknown format "${raw}", using psv\n`);
    }
    return raw === 'md' ? 'md' : raw === 'toon' ? 'toon' : 'psv';
  }

  const opts: ResolvedOptions = {
    disabled: hasFlag('--disabled'),
    verbose: hasFlag('--verbose', '-v'),
    format: resolveFormat(),
    stripEmpty: !hasFlag('--no-strip'),
    flatten: !hasFlag('--no-flatten'),
    parseText: !hasFlag('--no-parse-text'),
    unwrapContent: hasFlag('--unwrap'),
  };

  const isMcpMode = hasFlag('--mcp');
  const hasChildCommand = sepIndex !== -1 && sepIndex + 1 < args.length;
  const hasBrokenSep = sepIndex !== -1 && sepIndex + 1 >= args.length;
  const isPipe = !hasChildCommand && !hasBrokenSep && !process.stdin.isTTY;
  const childArgs = hasChildCommand ? args.slice(sepIndex + 1) : [];

  return {
    ownArgs,
    sepIndex,
    isMcpMode,
    hasChildCommand,
    isPipe,
    childArgs,
    opts,
    flagValue,
    hasFlag,
  };
}
