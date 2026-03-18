import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Set stats path before importing stats module
const testDir = join(tmpdir(), `tokpack-test-${process.pid}`);
const testStatsFile = join(testDir, 'stats.log');
process.env.TOKPACK_STATS_PATH = testStatsFile;

import { appendStat, readStats, resetStats, getStatsPath, formatStatsReport } from '../src/stats.js';

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  try {
    rmSync(testStatsFile);
  } catch {}
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true });
  } catch {}
});

describe('getStatsPath', () => {
  it('returns path from env var', () => {
    expect(getStatsPath()).toBe(testStatsFile);
  });
});

describe('appendStat', () => {
  it('creates file and appends a line', () => {
    appendStat(1000, 400);
    const content = readFileSync(testStatsFile, 'utf8');
    const parts = content.trim().split(',');
    expect(parts).toHaveLength(3);
    expect(Number(parts[1])).toBe(1000);
    expect(Number(parts[2])).toBe(400);
  });

  it('appends multiple lines', () => {
    appendStat(1000, 400);
    appendStat(2000, 800);
    const lines = readFileSync(testStatsFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('creates directory if missing', () => {
    rmSync(testDir, { recursive: true });
    appendStat(500, 200);
    const content = readFileSync(testStatsFile, 'utf8');
    expect(content).toContain('500,200');
  });
});

describe('readStats', () => {
  it('returns zeros when no file exists', () => {
    const stats = readStats();
    expect(stats).toEqual({ optimizations: 0, originalBytes: 0, optimizedBytes: 0 });
  });

  it('aggregates multiple entries', () => {
    appendStat(1000, 400);
    appendStat(2000, 800);
    appendStat(500, 200);
    const stats = readStats();
    expect(stats.optimizations).toBe(3);
    expect(stats.originalBytes).toBe(3500);
    expect(stats.optimizedBytes).toBe(1400);
  });

  it('skips corrupted lines', () => {
    appendStat(1000, 400);
    appendFileSync(testStatsFile, 'garbage\n');
    appendFileSync(testStatsFile, '123,abc,def\n');
    appendStat(2000, 800);
    const stats = readStats();
    expect(stats.optimizations).toBe(2);
    expect(stats.originalBytes).toBe(3000);
  });
});

describe('resetStats', () => {
  it('returns false when no file exists', () => {
    expect(resetStats()).toBe(false);
  });

  it('deletes file and returns true', () => {
    appendStat(1000, 400);
    expect(resetStats()).toBe(true);
    const stats = readStats();
    expect(stats.optimizations).toBe(0);
  });
});

describe('formatStatsReport', () => {
  it('returns "No stats" when empty', () => {
    expect(formatStatsReport()).toContain('No stats recorded yet');
  });

  it('returns formatted summary', () => {
    appendStat(10000, 4000);
    appendStat(20000, 8000);
    const output = formatStatsReport();
    expect(output).toContain('Optimizations: 2');
    expect(output).toContain('29.3 KB');
    expect(output).toContain('11.7 KB');
    expect(output).toContain('60%');
    expect(output).toContain('tokens');
  });
});
