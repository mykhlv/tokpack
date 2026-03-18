import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { appendFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';

export const BYTES_PER_TOKEN = 4;

const DEFAULT_STATS_PATH = join(homedir(), '.tokpack', 'stats.log');

let cachedStatsPath: string | undefined;
let dirEnsured = false;

export function getStatsPath(): string {
  if (!cachedStatsPath) {
    cachedStatsPath = process.env.TOKPACK_STATS_PATH || DEFAULT_STATS_PATH;
  }
  return cachedStatsPath;
}

export function appendStat(originalBytes: number, optimizedBytes: number): void {
  const file = getStatsPath();
  const line = `${Date.now()},${originalBytes},${optimizedBytes}\n`;
  try {
    if (!dirEnsured) {
      mkdirSync(dirname(file), { recursive: true });
      dirEnsured = true;
    }
    appendFileSync(file, line);
  } catch {
    // Directory may have been removed externally — retry once with mkdir
    try {
      dirEnsured = false;
      mkdirSync(dirname(file), { recursive: true });
      dirEnsured = true;
      appendFileSync(file, line);
    } catch {
      // Fail-safe: stats errors must never affect proxy operation
    }
  }
}

export interface StatsAggregate {
  optimizations: number
  originalBytes: number
  optimizedBytes: number
}

export function readStats(): StatsAggregate {
  const result: StatsAggregate = { optimizations: 0, originalBytes: 0, optimizedBytes: 0 };

  let raw: string;
  try {
    raw = readFileSync(getStatsPath(), 'utf8');
  } catch {
    return result;
  }

  for (const line of raw.split('\n')) {
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length !== 3) continue;
    const orig = Number(parts[1]);
    const opt = Number(parts[2]);
    if (Number.isNaN(orig) || Number.isNaN(opt)) continue;
    result.optimizations++;
    result.originalBytes += orig;
    result.optimizedBytes += opt;
  }

  return result;
}

export function resetStats(): boolean {
  try {
    unlinkSync(getStatsPath());
    cachedStatsPath = undefined;
    dirEnsured = false;
    return true;
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatStatsReport(): string {
  const stats = readStats();
  if (stats.optimizations === 0 || stats.originalBytes === 0) {
    return 'No stats recorded yet.\n';
  }

  const saved = stats.originalBytes - stats.optimizedBytes;
  const ratio = Math.round((1 - stats.optimizedBytes / stats.originalBytes) * 100);
  const tokens = Math.round(saved / BYTES_PER_TOKEN);

  return 'tokpack stats:\n'
    + `  Optimizations: ${stats.optimizations}\n`
    + `  Original: ${formatBytes(stats.originalBytes)} → Optimized: ${formatBytes(stats.optimizedBytes)}\n`
    + `  Saved: ${formatBytes(saved)} (${ratio}%) ~${tokens.toLocaleString('en-US')} tokens\n`;
}

export function printStats(): void {
  process.stdout.write(formatStatsReport());
}
