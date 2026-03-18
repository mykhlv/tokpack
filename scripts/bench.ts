// Benchmark script for tokpack
// Compares JSON (pretty / minified) vs PSV vs Markdown table vs TOON
// across realistic MCP response scenarios.
//
// Usage: npx tsx scripts/bench.ts

import { Squeezer, type Format } from '../src/squeezer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DataGen = (n: number) => Record<string, unknown>[];

interface Scenario {
  name: string
  gen: DataGen
}

type BenchConfig
  = { type: 'json', label: string, pretty: boolean }
    | { type: 'squeeze', label: string, sq: Squeezer };

interface BenchResult {
  label: string
  chars: number
  tokens: number
  vsMin: number
  vsPretty: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rpc(text: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text }] },
  });
}

function approxTokens(str: string): number {
  return Math.ceil(str.length / 4);
}

function extractText(rpcLine: string): string {
  return JSON.parse(rpcLine).result.content[0].text;
}

function fmtPct(v: number): string {
  if (v === 0) return '0%';
  return `${v > 0 ? '-' : '+'}${Math.abs(v)}%`;
}

function makeSqueezers(): Record<Format, Squeezer> {
  const formats: Format[] = ['psv', 'md', 'toon'];
  return Object.fromEntries(
    formats.map(f => [f, new Squeezer({ format: f, flatten: true, stripEmpty: true })]),
  ) as Record<Format, Squeezer>;
}

// ---------------------------------------------------------------------------
// Data generators
// ---------------------------------------------------------------------------

function makeFlat(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `user_${i + 1}`,
    email: `user${i + 1}@example.com`,
    role: i % 3 === 0 ? 'admin' : i % 3 === 1 ? 'editor' : 'viewer',
    active: i % 5 !== 0,
  }));
}

function makeNested(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `user_${i + 1}`,
    email: `user${i + 1}@example.com`,
    profile: {
      city: ['Kyiv', 'Lviv', 'Odesa', 'Dnipro', 'Kharkiv'][i % 5],
      age: 20 + (i % 40),
    },
    active: i % 5 !== 0,
  }));
}

function makeNullHeavy(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `user_${i + 1}`,
    email: `user${i + 1}@example.com`,
    deleted_at: null,
    archived_reason: null,
    legacy_field: '',
    role: i % 3 === 0 ? 'admin' : 'viewer',
    active: true,
  }));
}

function makeDbRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    title: `Task #${i + 1}: implement feature for the project`,
    description: `Detailed description of task ${i + 1} that contains enough text to be realistic`,
    status: ['open', 'in_progress', 'review', 'done'][i % 4],
    priority: ['low', 'medium', 'high', 'critical'][i % 4],
    assignee: `user_${(i % 10) + 1}`,
    created_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
    updated_at: null,
    labels: null,
    milestone: null,
  }));
}

function makeMixed(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `item_${i + 1}`,
    metadata: {
      source: 'api',
      version: 2,
      tags: ['tag_a', 'tag_b'],
    },
    stats: {
      views: i * 100,
      likes: i * 10,
    },
    deleted_at: null,
    archived: null,
  }));
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const scenarios: Scenario[] = [
  { name: 'Flat (DB users)', gen: makeFlat },
  { name: 'Nested (profiles)', gen: makeNested },
  { name: 'Null-heavy (sparse)', gen: makeNullHeavy },
  { name: 'DB rows (tasks)', gen: makeDbRows },
  { name: 'Mixed (nested+nulls)', gen: makeMixed },
];

const sizes = [10, 50, 100, 500];
const squeezers = makeSqueezers();

const configs: BenchConfig[] = [
  { type: 'json', label: 'JSON (pretty)', pretty: true },
  { type: 'json', label: 'JSON (minified)', pretty: false },
  { type: 'squeeze', label: 'PSV (no pre-proc)', sq: new Squeezer({ flatten: false, stripEmpty: false, format: 'psv' }) },
  { type: 'squeeze', label: 'PSV + strip', sq: new Squeezer({ flatten: false, stripEmpty: true, format: 'psv' }) },
  { type: 'squeeze', label: 'PSV + strip + flatten', sq: squeezers.psv },
  { type: 'squeeze', label: 'MD + strip + flatten', sq: squeezers.md },
  { type: 'squeeze', label: 'TOON + strip + flatten', sq: squeezers.toon },
];

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

function benchSize(data: Record<string, unknown>[], prettyJson: string, minJson: string): BenchResult[] {
  const prettyTokens = approxTokens(prettyJson);
  const minTokens = approxTokens(minJson);

  return configs.map((cfg): BenchResult => {
    let chars: number;
    let tokens: number;

    if (cfg.type === 'json') {
      const json = cfg.pretty ? prettyJson : minJson;
      chars = json.length;
      tokens = approxTokens(json);
    } else {
      const output = cfg.sq.process(rpc(prettyJson));
      const text = extractText(output);
      chars = text.length;
      tokens = approxTokens(text);
    }

    return {
      label: cfg.label,
      chars,
      tokens,
      vsMin: minTokens > 0 ? Math.round((1 - tokens / minTokens) * 100) : 0,
      vsPretty: prettyTokens > 0 ? Math.round((1 - tokens / prettyTokens) * 100) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('# mcp-squeeze benchmarks\n');
console.log(`Generated: ${new Date().toISOString().slice(0, 10)}\n`);

for (const scenario of scenarios) {
  console.log(`## ${scenario.name}\n`);
  console.log('| Rows | Format | Chars | ~Tokens | vs JSON min | vs pretty |');
  console.log('|------|--------|-------|---------|-------------|-----------|');

  for (let si = 0; si < sizes.length; si++) {
    const n = sizes[si];
    const data = scenario.gen(n);
    const prettyJson = JSON.stringify(data, null, 2);
    const minJson = JSON.stringify(data);
    const results = benchSize(data, prettyJson, minJson);

    for (const r of results) {
      const vsMinStr = r.label === 'JSON (minified)' ? 'baseline' : fmtPct(r.vsMin);
      const vsPrettyStr = r.label === 'JSON (pretty)' ? 'baseline' : fmtPct(r.vsPretty);
      console.log(
        `| ${n} | ${r.label} | ${r.chars.toLocaleString()} | ${r.tokens.toLocaleString()} | ${vsMinStr} | ${vsPrettyStr} |`,
      );
    }

    if (si < sizes.length - 1) {
      console.log('|------|--------|-------|---------|-------------|-----------|');
    }
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// Summary: best savings per scenario at 100 rows
// ---------------------------------------------------------------------------

console.log('## Summary (100 rows)\n');
console.log('| Scenario | JSON pretty | JSON min | Best squeeze | Format | Savings vs min |');
console.log('|----------|-------------|----------|--------------|--------|----------------|');

for (const scenario of scenarios) {
  const data = scenario.gen(100);
  const prettyJson = JSON.stringify(data, null, 2);
  const minJson = JSON.stringify(data);
  const prettyTokens = approxTokens(prettyJson);
  const minTokens = approxTokens(minJson);

  const candidates = (['psv', 'md', 'toon'] as const).map((f) => {
    const text = extractText(squeezers[f].process(rpc(prettyJson)));
    return { tokens: approxTokens(text), fmt: f.toUpperCase() };
  });
  const best = candidates.reduce((a, b) => a.tokens <= b.tokens ? a : b);
  const savings = Math.round((1 - best.tokens / minTokens) * 100);
  const savingsStr = fmtPct(savings);

  console.log(
    `| ${scenario.name} | ${prettyTokens.toLocaleString()} | ${minTokens.toLocaleString()} | ${best.tokens.toLocaleString()} | ${best.fmt} | ${savingsStr} |`,
  );
}

console.log('');
