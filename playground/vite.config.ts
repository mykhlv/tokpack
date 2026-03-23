import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));

export default defineConfig({
  plugins: [react()],
  base: '/tokpack/',
  resolve: {
    alias: {
      'tokpack': resolve(__dirname, '../src/lib.ts'),
    },
  },
  define: {
    'process.stderr.write': 'Function.prototype',
    '__TOKPACK_VERSION__': JSON.stringify(rootPkg.version),
    '__TOKPACK_REPO_URL__': JSON.stringify(rootPkg.repository.url.replace('git+', '').replace('.git', '')),
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks: {
          tiktoken: ['js-tiktoken'],
        },
      },
    },
  },
});
