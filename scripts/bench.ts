// Benchmark script for mcp-squeeze
// Compares JSON (pretty / minified) vs PSV vs Markdown table
// across realistic MCP response scenarios.
//
// Usage: npx tsx scripts/bench.ts

import { Squeezer } from '../src/squeezer.js';

// ---------------------------------------------------------------------------
// Data generators
// ---------------------------------------------------------------------------

function makeFlat(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `user_${i + 1}`,
    email: `user${i + 1}@example.com`,
    role: i % 3 === 0 ? 'admin' : i % 3 === 1 ? 'editor' : 'viewer',
    active: i % 5 !== 0,
  }));
}

function makeNested(n) {
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

function makeNullHeavy(n) {
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

function makeDbRows(n) {
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

function makeMixed(n) {
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
// Helpers
// ---------------------------------------------------------------------------

function rpc(text) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text }] },
  });
}

function countTokensApprox(str) {
  // ~4 chars per token is the standard rough estimate
  return Math.ceil(str.length / 4);
}

function extractText(rpcLine) {
  const parsed = JSON.parse(rpcLine);
  return parsed.result.content[0].text;
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

const scenarios = [
  { name: 'Flat (DB users)', gen: makeFlat },
  { name: 'Nested (profiles)', gen: makeNested },
  { name: 'Null-heavy (sparse)', gen: makeNullHeavy },
  { name: 'DB rows (tasks)', gen: makeDbRows },
  { name: 'Mixed (nested+nulls)', gen: makeMixed },
];

const sizes = [10, 50, 100, 500];

const configs = [
  { label: 'JSON (pretty)', sq: null },
  { label: 'JSON (minified)', sq: null },
  { label: 'PSV (no pre-proc)', sq: new Squeezer({ verbose: false, flatten: false, stripEmpty: false, format: 'psv' }) },
  { label: 'PSV + strip', sq: new Squeezer({ verbose: false, flatten: false, stripEmpty: true, format: 'psv' }) },
  { label: 'PSV + strip + flatten', sq: new Squeezer({ verbose: false, flatten: true, stripEmpty: true, format: 'psv' }) },
  { label: 'MD + strip + flatten', sq: new Squeezer({ verbose: false, flatten: true, stripEmpty: true, format: 'md' }) },
];

console.log('# mcp-squeeze benchmarks\n');
console.log(`Generated: ${new Date().toISOString().slice(0, 10)}\n`);

for (const scenario of scenarios) {
  console.log(`## ${scenario.name}\n`);
  console.log('| Rows | Format | Chars | ~Tokens | vs JSON min | vs pretty |');
  console.log('|------|--------|-------|---------|-------------|-----------|');

  for (const n of sizes) {
    const data = scenario.gen(n);
    const prettyJson = JSON.stringify(data, null, 2);
    const minJson = JSON.stringify(data);
    const prettyChars = prettyJson.length;
    const prettyTokens = countTokensApprox(prettyJson);
    const minChars = minJson.length;
    const minTokens = countTokensApprox(minJson);

    const results = [];

    for (const cfg of configs) {
      let chars, tokens, text;

      if (cfg.label === 'JSON (pretty)') {
        chars = prettyChars;
        tokens = prettyTokens;
        text = prettyJson;
      } else if (cfg.label === 'JSON (minified)') {
        // Just minify, don't do any tabular conversion
        chars = minChars;
        tokens = minTokens;
        text = minJson;
      } else {
        const input = rpc(prettyJson);
        const output = cfg.sq.process(input);
        text = extractText(output);
        chars = text.length;
        tokens = countTokensApprox(text);
      }

      const vsMin = minTokens > 0 ? Math.round((1 - tokens / minTokens) * 100) : 0;
      const vsPretty = prettyTokens > 0 ? Math.round((1 - tokens / prettyTokens) * 100) : 0;

      results.push({ label: cfg.label, chars, tokens, vsMin, vsPretty });
    }

    for (const r of results) {
      const fmtPct = (v: number) => v === 0 ? '0%' : `${v > 0 ? '-' : '+'}${Math.abs(v)}%`;
      const vsMinStr = r.label === 'JSON (minified)' ? 'baseline' : fmtPct(r.vsMin);
      const vsPrettyStr = r.label === 'JSON (pretty)' ? 'baseline' : fmtPct(r.vsPretty);
      console.log(`| ${n} | ${r.label} | ${r.chars.toLocaleString()} | ${r.tokens.toLocaleString()} | ${vsMinStr} | ${vsPrettyStr} |`);
    }

    if (n !== sizes[sizes.length - 1]) {
      console.log(`|------|--------|-------|---------|-------------|-----------|`);
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

const bestSq = new Squeezer({ verbose: false, flatten: true, stripEmpty: true, format: 'psv' });
const bestMd = new Squeezer({ verbose: false, flatten: true, stripEmpty: true, format: 'md' });

for (const scenario of scenarios) {
  const data = scenario.gen(100);
  const prettyJson = JSON.stringify(data, null, 2);
  const minJson = JSON.stringify(data);
  const prettyTokens = countTokensApprox(prettyJson);
  const minTokens = countTokensApprox(minJson);

  const psvOut = extractText(bestSq.process(rpc(prettyJson)));
  const mdOut = extractText(bestMd.process(rpc(prettyJson)));
  const psvTokens = countTokensApprox(psvOut);
  const mdTokens = countTokensApprox(mdOut);

  const best = psvTokens <= mdTokens
    ? { tokens: psvTokens, fmt: 'PSV' }
    : { tokens: mdTokens, fmt: 'MD' };
  const savings = Math.round((1 - best.tokens / minTokens) * 100);

  const savingsStr = savings === 0 ? '0%' : savings > 0 ? `-${savings}%` : `+${Math.abs(savings)}%`;
  console.log(
    `| ${scenario.name} | ${prettyTokens.toLocaleString()} | ${minTokens.toLocaleString()} | ${best.tokens.toLocaleString()} | ${best.fmt} | ${savingsStr} |`,
  );
}

console.log('');
