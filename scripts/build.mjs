import { readFileSync, chmodSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

await Promise.all([
  // CLI entrypoint (ESM, bundled, executable)
  build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'dist/index.js',
    banner: { js: '#!/usr/bin/env node' },
    define: { VERSION: JSON.stringify(pkg.version) },
  }).then(() => chmodSync('dist/index.js', 0o755)),

  // Library entrypoint — ESM
  build({
    entryPoints: ['src/lib.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'dist/lib.mjs',
  }),

  // Library entrypoint — CJS
  build({
    entryPoints: ['src/lib.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist/lib.cjs',
  }),
]);

// Type declarations
execSync('npx tsc --emitDeclarationOnly --declaration --outDir dist', {
  stdio: 'inherit',
});
