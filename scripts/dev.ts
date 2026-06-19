#!/usr/bin/env bun
import { spawn } from 'bun'

const procs = [
  spawn({ cmd: ['vite', '--config', 'vite.config.ts'], cwd: import.meta.dir + '/..', stdout: 'inherit', stderr: 'inherit' }),
  spawn({ cmd: ['tsc', '--noEmit', '-p', 'tsconfig.main.json', '--watch'], cwd: import.meta.dir + '/..', stdout: 'inherit', stderr: 'inherit' }),
  spawn({ cmd: ['electron', '.'], cwd: import.meta.dir + '/..', env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173' }, stdout: 'inherit', stderr: 'inherit' }),
]

process.on('SIGINT', () => { procs.forEach(p => p.kill()); process.exit() })
await Promise.race(procs.map(p => p.exited))
procs.forEach(p => p.kill())
