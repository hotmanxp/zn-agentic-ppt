#!/usr/bin/env bun
import { build } from 'esbuild'
import { rm } from 'node:fs/promises'

await rm('dist/main', { recursive: true, force: true })
await build({
  entryPoints: ['src/main/index.ts', 'src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist',
  external: ['electron'],
  sourcemap: true,
  loader: { '.ts': 'ts' },
})
console.log('Main + preload built.')
