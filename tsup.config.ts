import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node22',
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    banner: {
      js: '#!/usr/bin/env node'
    }
  },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node22',
    sourcemap: true,
    clean: false,
    outDir: 'dist',
    dts: true
  }
]);
