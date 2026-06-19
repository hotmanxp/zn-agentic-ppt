#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

const procs = [
  spawn('vite', ['--config', 'vite.config.ts'], { cwd: ROOT, stdio: 'inherit' }),
  spawn('tsc', ['--noEmit', '-p', 'tsconfig.main.json', '--watch'], { cwd: ROOT, stdio: 'inherit' }),
  spawn('electron', ['.'], { cwd: ROOT, env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173' }, stdio: 'inherit' }),
]

process.on('SIGINT', () => { procs.forEach(p => p.kill()); process.exit() })
await Promise.race(procs.map(p => new Promise<void>(r => p.on('exit', r))))
procs.forEach(p => p.kill())
