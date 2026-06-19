#!/usr/bin/env bun
import { build } from 'esbuild'
import { rm, cp, readFile, writeFile } from 'node:fs/promises'

await rm('dist/main', { recursive: true, force: true })
await build({
  entryPoints: ['src/main/index.ts', 'src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist',
  external: [
    'electron',
    // vendored SDK is pre-bundled, leave its peer deps as runtime require()
    './vendor/*',
    '../vendor/*',
    '../../vendor/*',
    '../../../vendor/*',
    '@anthropic-ai/*',
    '@aws-sdk/*',
    '@google-cloud/*',
    '@modelcontextprotocol/*',
    'google-auth-library',
    'fsevents',
  ],
  sourcemap: true,
  loader: { '.ts': 'ts' },
})

// Post-build: copy vendor next to the bundle and rewrite the import path.
// Source uses `../../../vendor/sdk.mjs` (3 levels up from src/main/sdk/).
// Bundle lives at dist/main/index.js (2 levels deep from project root).
// So the runtime path needs to be `vendor/sdk.mjs` (relative to dist/main/).
await cp('vendor', 'dist/main/vendor', { recursive: true })
const bundlePath = 'dist/main/index.js'
let content = await readFile(bundlePath, 'utf8')
content = content.replace(/from"\.\.\/\.\.\/\.\.\/vendor\/sdk\.mjs"/g, 'from"vendor/sdk.mjs"')
await writeFile(bundlePath, content)
console.log('Main + preload built; vendor copied; SDK path rewritten.')
